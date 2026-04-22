#!/usr/bin/env bash
# Stop hook. Prints a short checklist of the state Claude is leaving behind
# — uncommitted type errors, untracked files, whether a UI edit went out
# without a matching `test:e2e` run. Non-blocking.
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 0

ITEMS=()

# Typecheck — only flag if fast cache says something is broken
if ! TC_OUT=$(npx tsc -b 2>&1); then
  ITEMS+=("Typecheck failing. Tail:")
  ITEMS+=("$(printf '%s\n' "$TC_OUT" | tail -10)")
fi

# Uncommitted changes (informational)
DIRTY=$(git status --short 2>/dev/null)
if [ -n "$DIRTY" ]; then
  CHANGED_COUNT=$(printf '%s\n' "$DIRTY" | wc -l | tr -d ' ')
  ITEMS+=("$CHANGED_COUNT uncommitted change(s) in working tree.")
fi

# Playwright reminder (Phase 3). Only noise until the script exists.
if grep -q '"test:e2e"' package.json 2>/dev/null; then
  UI_CHANGED=$(printf '%s\n' "$DIRTY" | grep -E '^.M (app/(routes|components)/|app/root\.tsx)' || true)
  if [ -n "$UI_CHANGED" ]; then
    ITEMS+=("UI files changed but no test:e2e run this turn — run \`npm run test:e2e\` before declaring the task done.")
  fi
fi

if [ ${#ITEMS[@]} -eq 0 ]; then
  exit 0
fi

{
  echo "--- Stop checklist ---"
  for item in "${ITEMS[@]}"; do
    echo "- $item"
  done
} >&2
exit 0
