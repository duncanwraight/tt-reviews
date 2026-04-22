#!/usr/bin/env bash
# PreToolUse hook for Bash.
# Runs full typecheck before git commit / git push; blocks on failure.
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

if OUTPUT=$(npm run typecheck 2>&1); then
  exit 0
fi

ERRORS=$(printf '%s\n' "$OUTPUT" | grep -E 'error TS[0-9]+:|^npm ERR!|Error:' || true)

{
  echo "BLOCKED: \`npm run typecheck\` failed — refusing ${CMD%% *} ${CMD#* }."
  echo
  if [ -n "$ERRORS" ]; then
    printf '%s\n' "$ERRORS" | head -40
  else
    printf '%s\n' "$OUTPUT" | tail -40
  fi
  echo
  echo "Fix the type errors, then retry the git command."
} >&2
exit 2
