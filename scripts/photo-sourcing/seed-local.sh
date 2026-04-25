#!/usr/bin/env bash
# Seed the local DB with the photo-sourcing credits and push the
# normalised images into the local Miniflare R2 bucket. Intended to
# run after `supabase db reset`.
#
# Usage:
#   scripts/photo-sourcing/seed-local.sh

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." &>/dev/null && pwd)"
CREDITS_SQL="$ROOT_DIR/supabase/seed-images/credits.sql"

if [[ ! -f "$CREDITS_SQL" ]]; then
  echo "No credits.sql at $CREDITS_SQL." >&2
  echo "Run: node --experimental-strip-types scripts/photo-sourcing/apply.ts" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q '^supabase_db_'; then
  echo "Local Supabase is not running. Start it with 'supabase start'." >&2
  exit 1
fi

DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n1)"

echo "Applying $CREDITS_SQL to $DB_CONTAINER..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < "$CREDITS_SQL"

echo
echo "Loading fixtures into local R2..."
"$SCRIPT_DIR/load-fixtures.sh"
