#!/usr/bin/env bash
# Full prod data refresh orchestrator (TT-191).
#
# Order matters — the DB and Cloudflare Queues hold state that can't be
# reset together with `supabase db reset --linked` alone. If queue
# messages are in-flight while the DB is wiped, the consumer drains
# stale messages against a freshly-seeded DB (per the TT-189 sidebar).
#
# Sequence:
#   1. Detach the 3 queue consumers (photo + spec + player import).
#   2. Purge all 6 queues (3 main + 3 DLQs, --force).
#   3. supabase db reset --linked --yes  (re-runs migrations + seed.sql).
#   4. Re-attach queue consumers with the same params CI uses.
#   5. (--cleanup-r2, opt-in) Walk R2 and delete objects not referenced
#      by the post-reseed DB. OFF by default until seed.sql is curated
#      (TT-78/167/154); running it against an incomplete seed would
#      delete legitimate photos.
#   6. Print the manual post-wipe checklist from TT-191.
#
# This script DOES NOT touch:
#   - PROVIDER_QUOTA KV (Brave / sourcing quota counters track real
#     external-API usage and have their own TTLs — wiping them would
#     give the app a false sense of budget headroom).
#   - Cloudflare Image Resizing cache (purges automatically as keys
#     stop resolving).
#   - auth.users (Supabase Auth schema is managed separately from
#     local migrations; verify manually post-wipe).
#
# Required env (export before running OR put in a gitignored
# .wipe.env and source it):
#   SUPABASE_URL                   prod API URL (NOT the dev one)
#   SUPABASE_SERVICE_ROLE_KEY      prod service-role key
#   R2_ACCOUNT_ID                  Cloudflare account ID for R2
#   R2_ACCESS_KEY_ID               R2 S3-compatible access key
#   R2_SECRET_ACCESS_KEY           R2 S3-compatible secret
#   R2_BUCKET_NAME                 defaults to tt-reviews-prod
#
# Required tools:
#   npx wrangler, npx supabase, aws (R2 S3 endpoint), curl, jq
#
# Usage:
#   scripts/prod-wipe-and-reseed.sh                 # interactive, no R2 cleanup
#   scripts/prod-wipe-and-reseed.sh --dry-run       # print what would run
#   scripts/prod-wipe-and-reseed.sh --cleanup-r2    # include R2 orphan walk
#   scripts/prod-wipe-and-reseed.sh --skip-db-reset # queue ops only
#
# Linked tickets: TT-191 (parent), TT-170 (R2 orphan cleanup overlap),
# TT-189 (queue/DB race investigation that produced this ordering).

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." &>/dev/null && pwd)"

WORKER_NAME="app"

# Queue → DLQ mapping. Order: main queue first, DLQ second.
# Mirrors wrangler.toml [[queues.consumers]] dead_letter_queue values.
QUEUE_PAIRS=(
  "equipment-photo-source:equipment-photo-source-dlq"
  "spec-source-queue:spec-source-dlq"
  "player-import-queue:player-import-dlq"
)

# Consumer params — must match wrangler.toml's [[queues.consumers]]
# blocks. If wrangler.toml changes, update here too (or the reattach
# step will silently install stale config).
CONSUMER_FLAGS=(--batch-size 1 --message-retries 5 --batch-timeout 5
                --max-concurrency 1)

# Tables whose image_key column points at R2 objects we must keep.
# Submission/edit tables (equipment_submissions, player_submissions,
# player_edits, equipment_edits) are user-generated and empty post-
# reset, so they contribute no keys to the keep-set.
KEEP_KEY_TABLES=("equipment" "players")

# ─── Flags ─────────────────────────────────────────────────────────────────

DRY_RUN=0
CLEANUP_R2=0
SKIP_DB_RESET=0
SKIP_QUEUES=0

print_help() {
  sed -n '2,/^set -euo pipefail$/{/^set -euo pipefail$/d; s/^# \{0,1\}//; p}' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)       DRY_RUN=1 ;;
    --cleanup-r2)    CLEANUP_R2=1 ;;
    --skip-db-reset) SKIP_DB_RESET=1 ;;
    --skip-queues)   SKIP_QUEUES=1 ;;
    -h|--help)       print_help; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; echo "Run with --help for usage." >&2; exit 2 ;;
  esac
  shift
done

# ─── Helpers ───────────────────────────────────────────────────────────────

log()   { printf '\n\033[1;34m[wipe]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[wipe]\033[0m %s\n' "$*" >&2; }
fatal() { printf '\033[1;31m[wipe]\033[0m %s\n' "$*" >&2; exit 1; }

# run CMD…   — runs the command, or prints it under --dry-run.
run() {
  if (( DRY_RUN )); then
    printf '\033[2m  [dry-run]\033[0m'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || fatal "Missing required tool: $1"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fatal "Required env var not set: $name (see script header)"
  fi
}

# ─── Pre-flight ────────────────────────────────────────────────────────────

log "Pre-flight checks"

require_tool npx
require_tool curl
require_tool jq

# Tool checks are scoped to the steps that need them — skipping DB
# reset means we can run without `supabase`, etc.
if (( ! SKIP_DB_RESET )); then
  # `npx supabase` is the canonical invocation; the global `supabase`
  # binary isn't required.
  :
fi
if (( CLEANUP_R2 )); then
  require_tool aws
  require_env SUPABASE_URL
  require_env SUPABASE_SERVICE_ROLE_KEY
  require_env R2_ACCOUNT_ID
  require_env R2_ACCESS_KEY_ID
  require_env R2_SECRET_ACCESS_KEY
  : "${R2_BUCKET_NAME:=tt-reviews-prod}"
fi

# Sanity: the linked Supabase project should be prod (not dev/local).
# `supabase status --linked` prints the project ref + URL; if the
# linked URL doesn't look like prod, refuse to continue. The user
# may also have intentionally linked to a non-prod project — pass
# --skip-db-reset to bypass this check.
if (( ! SKIP_DB_RESET && ! DRY_RUN )); then
  linked_info="$(npx supabase status --linked 2>&1 || true)"
  if echo "$linked_info" | grep -qiE "(localhost|127\.0\.0\.1|tt-reviews\.local)"; then
    fatal "Linked Supabase project looks like local/dev. Refusing to wipe.
       \$ supabase status --linked
       $linked_info"
  fi
fi

# ─── Confirmation ──────────────────────────────────────────────────────────

echo
printf '\033[1;31m%s\033[0m\n' \
  "=============================================================" \
  "  PROD DATA WIPE — TT-191" \
  "============================================================="
echo
echo "This will:"
(( SKIP_QUEUES   )) || echo "  • Detach + purge ${#QUEUE_PAIRS[@]} queues (and their DLQs)"
(( SKIP_DB_RESET )) || echo "  • Run \`supabase db reset --linked\` against the linked prod project"
(( SKIP_QUEUES   )) || echo "  • Re-attach queue consumers afterwards"
(( CLEANUP_R2    )) && echo "  • Walk R2 (\`${R2_BUCKET_NAME:-tt-reviews-prod}\`) and delete objects not referenced post-reseed"
echo
echo "Flags in effect:"
echo "  DRY_RUN=${DRY_RUN}  SKIP_DB_RESET=${SKIP_DB_RESET}  SKIP_QUEUES=${SKIP_QUEUES}  CLEANUP_R2=${CLEANUP_R2}"
echo

if (( CLEANUP_R2 )); then
  warn "--cleanup-r2 is ON. This is only safe after seed.sql has been"
  warn "curated to include the photo metadata (TT-78 / TT-167 / TT-154)."
  warn "Otherwise this WILL delete the legitimate equipment/player photos."
fi

if (( ! DRY_RUN )); then
  # Belt-and-braces gate: a single short word ("WIPE", "yes") is too
  # easy to type by reflex on a destructive prompt. Forcing two words
  # in a deliberate phrase ("WIPE PROD") makes muscle-memory confirms
  # implausible. Verbatim match — leading/trailing whitespace and case
  # both count.
  read -r -p $'\nType WIPE PROD to continue, anything else to abort: ' confirm
  [[ "$confirm" == "WIPE PROD" ]] || fatal "Aborted."
fi

# ─── Step 1+2: Detach + purge queues ───────────────────────────────────────

detach_queues() {
  log "Detaching queue consumers"
  for pair in "${QUEUE_PAIRS[@]}"; do
    local q="${pair%%:*}"
    run npx wrangler queues consumer worker remove "$q" "$WORKER_NAME" || \
      warn "consumer remove failed for $q (may already be detached) — continuing"
  done
}

purge_queues() {
  log "Purging queues + DLQs (--force)"
  for pair in "${QUEUE_PAIRS[@]}"; do
    local q="${pair%%:*}"
    local dlq="${pair##*:}"
    run npx wrangler queues purge "$q"   --force
    run npx wrangler queues purge "$dlq" --force
  done
}

# ─── Step 3: supabase db reset --linked ────────────────────────────────────

db_reset() {
  log "Resetting linked Supabase project (db reset --linked --yes)"
  run npx supabase db reset --linked --yes
}

# ─── Step 4: Re-attach queue consumers ─────────────────────────────────────

reattach_queues() {
  log "Re-attaching queue consumers"
  for pair in "${QUEUE_PAIRS[@]}"; do
    local q="${pair%%:*}"
    local dlq="${pair##*:}"
    run npx wrangler queues consumer worker add "$q" "$WORKER_NAME" \
      "${CONSUMER_FLAGS[@]}" --dead-letter-queue "$dlq"
  done
}

# ─── Step 5: R2 orphan cleanup ─────────────────────────────────────────────

# Returns the union of image_key values currently in the DB, one per
# line. PostgREST + service-role bypass RLS. Empty result is fine —
# means everything in R2 is an orphan.
fetch_keep_keys() {
  local url="${SUPABASE_URL%/}"
  for table in "${KEEP_KEY_TABLES[@]}"; do
    curl --fail --silent \
      "$url/rest/v1/$table?select=image_key&image_key=not.is.null" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    | jq -r '.[].image_key' \
    || fatal "Failed to fetch image_keys from $table"
  done
}

# Lists every object key in the R2 bucket, paginating until done.
list_r2_keys() {
  local endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="auto" \
    aws s3api list-objects-v2 \
      --bucket "$R2_BUCKET_NAME" \
      --endpoint-url "$endpoint" \
      --output json \
      --query 'Contents[].Key' \
    | jq -r '.[] // empty'
}

delete_r2_key() {
  local key="$1"
  local endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="auto" \
    aws s3api delete-object \
      --bucket "$R2_BUCKET_NAME" \
      --endpoint-url "$endpoint" \
      --key "$key" >/dev/null
}

cleanup_r2() {
  log "R2 orphan cleanup ($R2_BUCKET_NAME)"

  local keep_file all_file orphans_file
  keep_file=$(mktemp)
  all_file=$(mktemp)
  orphans_file=$(mktemp)
  trap 'rm -f "$keep_file" "$all_file" "$orphans_file"' RETURN

  fetch_keep_keys | sort -u > "$keep_file"
  list_r2_keys   | sort -u > "$all_file"
  comm -23 "$all_file" "$keep_file" > "$orphans_file"

  local kept orphan_count
  kept=$(wc -l < "$keep_file" | tr -d ' ')
  orphan_count=$(wc -l < "$orphans_file" | tr -d ' ')
  log "  $kept key(s) referenced by DB; $orphan_count orphan(s) to delete"

  if (( orphan_count == 0 )); then
    return 0
  fi

  if (( DRY_RUN )); then
    printf '\033[2m  [dry-run]\033[0m would delete:\n'
    sed 's/^/    /' "$orphans_file"
    return 0
  fi

  local i=0
  while IFS= read -r key; do
    i=$((i + 1))
    printf '  [%d/%d] %s\n' "$i" "$orphan_count" "$key"
    delete_r2_key "$key"
  done < "$orphans_file"
}

# ─── Step 6: Post-wipe checklist ───────────────────────────────────────────

print_checklist() {
  cat <<'EOF'

[wipe] Post-wipe checklist (do these by hand):

  1. Re-grant Discord moderator role to prod mods. `discord_moderators`
     is wiped by the reset; Discord user IDs are unchanged.
        SELECT * FROM discord_moderators;  -- should be empty / seeded only

  2. Spot-check render of key pages:
        /                          (home)
        /equipment                 (browse)
        /equipment/<some-slug>     (detail)
        /players                   (browse)
        /players/<some-slug>       (detail)
        /admin                     (dashboard)
        /admin/equipment-photos    (queue)

  3. Kick sourcing crons manually to confirm consumers drain:
        curl 'https://tabletennis.reviews/__scheduled?cron=0+%2A%2F6+%2A+%2A+%2A'
     Then watch `wrangler tail` for spec-source-queue ingest.

  4. Verify no orphan rows / broken FKs:
        SELECT count(*) FROM equipment_spec_proposals
          WHERE equipment_id NOT IN (SELECT id FROM equipment);

  5. (auth.users) — `supabase db reset` only re-runs the public
     migrations; the auth schema persists. If you also want to wipe
     real user accounts, do that via the Supabase dashboard.

  6. (R2 orphans) — if you skipped --cleanup-r2, file or pick up
     TT-170 for orphan cleanup against the curated seed.

EOF
}

# ─── Run ───────────────────────────────────────────────────────────────────

if (( ! SKIP_QUEUES )); then
  detach_queues
  purge_queues
fi

if (( ! SKIP_DB_RESET )); then
  db_reset
fi

if (( ! SKIP_QUEUES )); then
  reattach_queues
fi

if (( CLEANUP_R2 )); then
  cleanup_r2
fi

log "Done."
print_checklist
