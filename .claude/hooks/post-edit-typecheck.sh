#!/usr/bin/env bash
# PostToolUse hook for Edit|Write|MultiEdit.
# Runs incremental `tsc -b` when a TypeScript source file under app/ or workers/
# was just edited, and surfaces any errors so Claude self-corrects in the same turn.
set -u

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("file_path", ""))
except Exception:
    print("")' 2>/dev/null)

# Only react to .ts / .tsx under app/ or workers/
case "$FILE" in
  */app/*.ts|*/app/*.tsx|*/workers/*.ts|*/workers/*.tsx) ;;
  *) exit 0 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 0

if OUTPUT=$(npx tsc -b 2>&1); then
  exit 0
fi

ERRORS=$(printf '%s\n' "$OUTPUT" | grep -E 'error TS[0-9]+:|^npm ERR!|Error:' || true)

{
  echo "Incremental typecheck failed after editing ${FILE}:"
  if [ -n "$ERRORS" ]; then
    printf '%s\n' "$ERRORS" | head -40
  else
    printf '%s\n' "$OUTPUT" | tail -40
  fi
  echo
  echo "Fix the type errors before moving on — the pre-commit hook will block git commit/push until they are resolved."
} >&2
exit 2
