#!/usr/bin/env bash
# PostToolUse hook for Edit|Write|MultiEdit.
# Runs `prettier --check` against the edited file so formatting drift is
# caught locally instead of at CI. Matches the blocking/error shape of
# post-edit-typecheck.sh.
set -u

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("file_path", ""))
except Exception:
    print("")' 2>/dev/null)

if [ -z "$FILE" ]; then
  exit 0
fi

# Pre-filter by extension. Prettier's --ignore-unknown will also skip
# unsupported types, but checking here avoids the npx spawn for obvious
# non-source files (images, .dev.vars, binaries).
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.md|*.mdx|*.css|*.scss|*.html|*.yml|*.yaml) ;;
  *) exit 0 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 0

# --ignore-unknown swallows "No parser could be inferred" silently.
if OUTPUT=$(npx prettier --check --ignore-unknown "$FILE" 2>&1); then
  exit 0
fi

{
  echo "Prettier formatting check failed for ${FILE}:"
  printf '%s\n' "$OUTPUT" | tail -20
  echo
  echo "Fix with: npx prettier --write \"$FILE\""
  echo "CI will reject this file's formatting otherwise."
} >&2
exit 2
