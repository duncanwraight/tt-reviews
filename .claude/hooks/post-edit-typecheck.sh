#!/usr/bin/env bash
# PostToolUse hook for Edit|Write|MultiEdit.
# Runs incremental `tsc -b` when a TypeScript source file under app/ or workers/
# was just edited, and surfaces any errors so Claude self-corrects in the same turn.
#
# Output strategy: show errors in the file just edited in full, plus a per-file
# count for everything else. During multi-file refactors the cascade is expected
# and doesn't need to be re-dumped after every edit — the count is enough to
# flag an unexpected break without burning tokens on identical repeated output.
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

# tsc error lines look like: "app/foo.ts(12,34): error TS2345: ..."
ERRORS=$(printf '%s\n' "$OUTPUT" | grep -E 'error TS[0-9]+:' || true)

if [ -z "$ERRORS" ]; then
  {
    echo "Typecheck failed after editing ${FILE}:"
    printf '%s\n' "$OUTPUT" | tail -20
    echo
    echo "Run \`npx tsc -b\` to investigate — the pre-push hook will block you until this is resolved."
  } >&2
  exit 2
fi

# Relative path so tsc output matches (tsc reports paths relative to REPO_ROOT).
REL_FILE="${FILE#"$REPO_ROOT"/}"

THIS_FILE_ERRORS=$(printf '%s\n' "$ERRORS" | awk -v f="$REL_FILE" 'index($0, f "(") == 1')
OTHER_ERRORS=$(printf '%s\n' "$ERRORS" | awk -v f="$REL_FILE" 'index($0, f "(") != 1')

THIS_COUNT=$(printf '%s' "$THIS_FILE_ERRORS" | grep -c . || true)
OTHER_COUNT=$(printf '%s' "$OTHER_ERRORS" | grep -c . || true)

{
  echo "Typecheck after editing ${REL_FILE}:"
  if [ "$THIS_COUNT" -gt 0 ]; then
    echo "  In this file (${THIS_COUNT}):"
    printf '%s\n' "$THIS_FILE_ERRORS" | head -10 | sed 's/^/    /'
    if [ "$THIS_COUNT" -gt 10 ]; then
      echo "    ... ($((THIS_COUNT - 10)) more)"
    fi
  else
    echo "  In this file: clean"
  fi
  if [ "$OTHER_COUNT" -gt 0 ]; then
    # Per-file count summary for the cascade.
    SUMMARY=$(printf '%s\n' "$OTHER_ERRORS" | sed -E 's/\(.*//' | sort | uniq -c | sort -rn | awk '{printf "    %s: %d\n", $2, $1}')
    FILE_COUNT=$(printf '%s\n' "$SUMMARY" | grep -c . || true)
    echo "  Elsewhere: ${OTHER_COUNT} errors across ${FILE_COUNT} files"
    printf '%s\n' "$SUMMARY" | head -6
    if [ "$FILE_COUNT" -gt 6 ]; then
      echo "    ... ($((FILE_COUNT - 6)) more files)"
    fi
  fi
  echo
  echo "Run \`npx tsc -b\` for the full list if anything here is unexpected. Pre-push hook will block commits until clean."
} >&2
exit 2
