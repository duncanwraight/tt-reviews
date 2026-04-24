#!/usr/bin/env bash
#
# Security sweep — mechanical enforcement for SECURITY.md Phase 10 (TT-19).
#
# Each check turns a class of past mistake into an automated gate:
#   1. Self-approval RLS anti-pattern in new migrations.
#   2. process.env reads in server code (always undefined on Workers).
#   3. Admin route actions that forgot to call validateCSRF.
#
# Exits non-zero on any violation. Invoked from .github/workflows/main.yml
# and runnable locally: `bash scripts/security-sweep.sh`.

set -u
VIOLATIONS=0

report() {
  local check="$1" detail="$2"
  printf '\n::error::[security-sweep] %s\n' "$check" >&2
  printf '%s\n' "$detail" >&2
  VIOLATIONS=$((VIOLATIONS + 1))
}

# ----------------------------------------------------------------------
# 1. RLS anti-patterns in migrations.
#
# `FOR UPDATE USING (auth.uid() IS NOT NULL)` lets any authenticated
# user update any row — Phase 3's self-approval footgun. Ban it.
#
# `WITH CHECK (true)` on a write policy and `USING (true)` on INSERT /
# UPDATE / DELETE are the "any authenticated row" pattern. Public
# SELECT with `USING (true)` is fine — we narrow the grep to write ops.
#
# We only check migrations dated 2026-04-23 onwards. Older ones
# included these open policies and were later dropped by
# 20260423100000_lock_submission_self_approve.sql and
# 20260423100100_lock_core_table_writes.sql — the current DB state is
# clean, but rewriting those historical files would lose audit trail.
# The cutoff below is the day Phase 3 shipped.
# ----------------------------------------------------------------------
echo "→ Checking migrations for RLS anti-patterns..."
CUTOFF="20260423"

NEW_MIGRATIONS=$(find supabase/migrations -type f -name "*.sql" \
  | awk -v cut="$CUTOFF" -F/ '{
      fname = $NF
      # Strip to the leading timestamp digits.
      match(fname, /^[0-9]+/)
      ts = substr(fname, RSTART, RLENGTH)
      if (length(ts) >= 8 && substr(ts, 1, 8) >= cut) print $0
    }')

if [ -n "$NEW_MIGRATIONS" ]; then
  SELF_APPROVE=$(echo "$NEW_MIGRATIONS" \
    | xargs grep -niE 'FOR\s+UPDATE\s+USING\s*\(\s*auth\.uid\(\)\s+IS\s+NOT\s+NULL\s*\)' \
      2>/dev/null \
      | grep -vE ':\s*--' || true)
  if [ -n "$SELF_APPROVE" ]; then
    report "RLS self-approval anti-pattern" \
      "Found 'FOR UPDATE USING (auth.uid() IS NOT NULL)' — any authenticated user can update any row.
Use an admin-role check or a user_id match. See supabase/migrations/20260423100000_lock_submission_self_approve.sql.

$SELF_APPROVE"
  fi

  OPEN_WRITE=$(echo "$NEW_MIGRATIONS" \
    | xargs grep -niE '(CREATE|ALTER).*POLICY.*FOR\s+(INSERT|UPDATE|DELETE).*WITH\s+CHECK\s*\(\s*true\s*\)' \
      2>/dev/null \
      | grep -vE ':\s*--' \
      | grep -v 'security: reviewed' || true)
  if [ -n "$OPEN_WRITE" ]; then
    report "Write policy with WITH CHECK (true)" \
      "A write policy with 'WITH CHECK (true)' admits any row. Add an explicit condition, or append
-- security: reviewed to the line if the open policy is intentional.

$OPEN_WRITE"
  fi
fi

# ----------------------------------------------------------------------
# 2. process.env in server code.
#
# Cloudflare Workers never populate process.env at runtime. Every
# `process.env.X` in a `.server.ts` / `.server.tsx` file silently
# returns undefined. The only legitimate usage is the vitest fallback
# in app/lib/env.server.ts. Comments that reference the old pattern
# don't count — narrow the grep to real reads by requiring something
# other than whitespace + comment-prefix before the match.
# ----------------------------------------------------------------------
echo "→ Checking server code for process.env reads..."
PROCESS_ENV_HITS=$(grep -rnE 'process\.env\.[A-Za-z_]' \
  app/lib/ app/routes/ \
  --include='*.server.ts' --include='*.server.tsx' 2>/dev/null \
  | grep -v '^app/lib/env.server.ts:' \
  | grep -vE ':\s*(//|\*|#)' \
  || true)
if [ -n "$PROCESS_ENV_HITS" ]; then
  report "process.env in server file" \
    "process.env.X is always undefined on Workers. Thread the value through AppLoadContext
(getEnvVar(context, 'X') in app/lib/env.server.ts).

$PROCESS_ENV_HITS"
fi

# ----------------------------------------------------------------------
# 3. Admin route actions must gate CSRF + rate limit.
#
# Every admin.*.tsx route with an exported action must reference one of
# the canonical gates:
#   - ensureAdminAction (admin + CSRF + rate-limit wrapper from TT-9)
#   - enforceAdminActionGate (the underlying CSRF + rate-limit primitive)
#   - validateCSRF (for callers that CSRF-check without rate-limiting)
# Loader-only files (admin._index.tsx) and the pass-through layout
# (admin.tsx) are exempt.
# ----------------------------------------------------------------------
echo "→ Checking admin route action gate coverage..."
EXEMPT=(
  "app/routes/admin.tsx"
  "app/routes/admin._index.tsx"
)
MISSING=""
for file in app/routes/admin.*.tsx; do
  skip=0
  for ex in "${EXEMPT[@]}"; do
    if [ "$file" = "$ex" ]; then skip=1; break; fi
  done
  [ $skip -eq 1 ] && continue

  if grep -qE '^export (async )?function action' "$file"; then
    if ! grep -qE 'ensureAdminAction|enforceAdminActionGate|validateCSRF' "$file"; then
      MISSING="${MISSING}${file}"$'\n'
    fi
  fi
done
if [ -n "$MISSING" ]; then
  report "Admin route action without CSRF + rate-limit gate" \
    "Every admin.*.tsx action must call ensureAdminAction (preferred) or enforceAdminActionGate / validateCSRF before doing work.
$MISSING"
fi

# ----------------------------------------------------------------------

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "Security sweep: $VIOLATIONS violation(s)." >&2
  exit 1
fi

echo "Security sweep: clean."
