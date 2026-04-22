#!/usr/bin/env bash
# PreToolUse hook for Bash.
# Runs typecheck + lint before git commit / git push; blocks on failure.
set -u

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("command", ""))
except Exception:
    print("")' 2>/dev/null)

# Only gate on git commit or git push
case "$CMD" in
  "git commit"*|"git push"*|*" git commit"*|*" git push"*) ;;
  *) exit 0 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 0

block() {
  local phase="$1"
  local output="$2"
  local errors
  errors=$(printf '%s\n' "$output" | grep -E 'error TS[0-9]+:|error  |^npm ERR!|Error:|Parsing error' || true)
  {
    echo "BLOCKED: \`npm run ${phase}\` failed — refusing ${CMD%% *} ${CMD#* }."
    echo
    if [ -n "$errors" ]; then
      printf '%s\n' "$errors" | head -40
    else
      printf '%s\n' "$output" | tail -40
    fi
    echo
    echo "Fix the ${phase} errors, then retry the git command."
  } >&2
  exit 2
}

if ! OUTPUT=$(npm run typecheck 2>&1); then
  block typecheck "$OUTPUT"
fi

if ! OUTPUT=$(npm run lint 2>&1); then
  block lint "$OUTPUT"
fi

exit 0
