#!/usr/bin/env bash
# PostToolUse hook for Edit|Write on supabase/migrations/**.
# Non-blocking. Reminds Claude to describe the schema impact in its summary,
# and attempts `supabase db diff` if the CLI + local Supabase are available.
set -u

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("file_path", ""))
except Exception:
    print("")' 2>/dev/null)

case "$FILE" in
  */supabase/migrations/*) ;;
  *) exit 0 ;;
esac

{
  echo "Migration edited: ${FILE}"
  echo "Remember to:"
  echo "  - describe the schema change in your turn summary,"
  echo "  - confirm RLS policies still hold (no direct reads of user_roles — use auth.jwt() ->> 'user_role'),"
  echo "  - verify backwards compatibility if the column is already populated in prod."
} >&2

# Best-effort diff; silent if unavailable.
if command -v supabase >/dev/null 2>&1; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$REPO_ROOT" || exit 0
  DIFF=$(timeout 15 supabase db diff --schema public 2>&1 || true)
  if [ -n "$DIFF" ] && [ "$DIFF" != "No schema changes found" ]; then
    {
      echo
      echo "--- supabase db diff (public) ---"
      printf '%s\n' "$DIFF" | head -60
    } >&2
  fi
fi

exit 0
