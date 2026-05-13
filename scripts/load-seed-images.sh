#!/usr/bin/env bash
# Upload supabase/seed-images/{kind}/{slug}.webp into the IMAGE_BUCKET
# binding under the deterministic key {kind}/{slug}/seed.webp. By
# default targets the local Miniflare bucket; pass --remote for prod.
#
# This is the local-dev R2 hydrator — without it, player photos won't
# render under `wrangler dev` because Miniflare's R2 starts empty.
# Sibling to the /admin/import-players + /admin/equipment-photos
# flows which write *new* images to R2; this is purely for getting
# the committed seed fixtures into local R2.
#
# Usage:
#   scripts/load-seed-images.sh           # local Miniflare
#   scripts/load-seed-images.sh --remote  # prod R2 (rarely needed)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." &>/dev/null && pwd)"
SEED_DIR="$ROOT_DIR/supabase/seed-images"

REMOTE=""
for arg in "$@"; do
  case "$arg" in
    --remote)
      REMOTE="--remote"
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$SEED_DIR" ]]; then
  echo "No seed-images directory at $SEED_DIR." >&2
  exit 1
fi

# Always target the top-level IMAGE_BUCKET binding (tt-reviews-prod).
# Locally that's a Miniflare bucket — the same one `wrangler dev`
# binds — so dev sees the uploads. Remotely it's the real prod R2.
BUCKET="tt-reviews-prod"

count=0
while IFS= read -r -d '' file; do
  rel="${file#$SEED_DIR/}"           # player/lin-shidong.webp
  kind="${rel%%/*}"                  # player
  base="${rel#$kind/}"               # lin-shidong.webp
  slug="${base%.webp}"               # lin-shidong
  key="$kind/$slug/seed.webp"

  echo "→ $BUCKET/$key"
  npx wrangler r2 object put "$BUCKET/$key" \
    --file="$file" \
    --content-type="image/webp" \
    $REMOTE
  count=$((count + 1))
done < <(find "$SEED_DIR" -type f -name '*.webp' -print0)

echo
echo "Uploaded $count file(s) to $BUCKET ($([[ -n $REMOTE ]] && echo remote || echo local))."
