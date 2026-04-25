#!/usr/bin/env bash
# Apply the photo-sourcing pipeline output to PRODUCTION.
#   1. Upload supabase/seed-images/**/*.webp to the prod R2 bucket
#      (tt-reviews-prod) via wrangler --remote.
#   2. Apply supabase/seed-images/credits.sql to the prod Postgres
#      via psql, updating image_key / image_etag / attribution columns
#      on every player slug present in the file.
#
# Both steps are idempotent — re-running after a photo rotation just
# overwrites the existing R2 objects and runs the same UPDATEs again
# (a no-op when content is unchanged).
#
# Usage:
#   SUPABASE_DB_URL=postgresql://... scripts/photo-sourcing/seed-prod.sh
#   SUPABASE_DB_URL=... scripts/photo-sourcing/seed-prod.sh --yes   (skip confirm)
#
# Cloudflare auth comes from `wrangler login` or CLOUDFLARE_API_TOKEN
# in the environment — same as any other `wrangler` command.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." &>/dev/null && pwd)"
CREDITS_SQL="$ROOT_DIR/supabase/seed-images/credits.sql"

YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is not set." >&2
  echo "Get it from the Supabase dashboard (Project → Database → Connection string)" >&2
  echo "or copy it from the GitHub Actions secret of the same name." >&2
  echo "Expected form: postgresql://USER:PASSWORD@HOST:PORT/DBNAME" >&2
  exit 1
fi

# Without a recognised URI scheme psql treats the arg as a bare dbname
# and silently falls back to PGHOST/PGPORT defaults — i.e. tries to
# connect to your local Postgres instead of prod. Reject that loudly.
if [[ "$SUPABASE_DB_URL" != postgresql://* && "$SUPABASE_DB_URL" != postgres://* ]]; then
  echo "SUPABASE_DB_URL must start with postgresql:// or postgres://" >&2
  echo "Got: $(printf '%.40s...' "$SUPABASE_DB_URL")" >&2
  echo "Expected form: postgresql://USER:PASSWORD@HOST:PORT/DBNAME" >&2
  exit 1
fi

if [[ ! -f "$CREDITS_SQL" ]]; then
  echo "Missing $CREDITS_SQL." >&2
  echo "Run: npm run sourcing:apply" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not on PATH. Install postgresql-client and re-run." >&2
  exit 1
fi

WEBP_COUNT=$(find "$ROOT_DIR/supabase/seed-images" -type f -name '*.webp' 2>/dev/null | wc -l)
SQL_ROWS=$(grep -c '^UPDATE ' "$CREDITS_SQL" || true)

# Mask the password and most of the host in the URL before echoing.
SANITISED_URL=$(printf '%s' "$SUPABASE_DB_URL" | sed -E 's#(://[^:]+:)[^@]+(@)#\1***\2#; s#@([a-z0-9-]{4})[a-z0-9.-]+#@\1***#')

cat <<EOF
About to update production:
  - Upload $WEBP_COUNT webp file(s) to R2 bucket tt-reviews-prod
  - Apply $SQL_ROWS UPDATE row(s) from $CREDITS_SQL
  - Target DB: $SANITISED_URL

EOF

if [[ "$YES" != "1" ]]; then
  read -r -p "Proceed? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

echo
echo "→ Uploading webps to prod R2..."
"$SCRIPT_DIR/load-fixtures.sh" --remote

echo
echo "→ Applying credits.sql to prod Postgres..."
# ON_ERROR_STOP makes psql exit non-zero on the first failed statement
# so a partial-apply doesn't pretend to have succeeded.
#
# Connect via -d so psql treats the value as a connection string,
# never as a bare dbname; --no-password ensures we fail fast if the
# URL is missing credentials (rather than prompting and stalling on
# a CI/non-tty run); env -u clears any host PGPORT/PGHOST/PGUSER that
# would otherwise leak into the connection if the URL parser tripped.
env -u PGHOST -u PGPORT -u PGUSER -u PGDATABASE -u PGPASSWORD \
  psql \
    --dbname="$SUPABASE_DB_URL" \
    --variable=ON_ERROR_STOP=1 \
    --no-password \
    --no-psqlrc \
    --quiet \
    -f "$CREDITS_SQL"

echo
echo "Done. Spot-check a player page on https://tabletennis.reviews to verify."
