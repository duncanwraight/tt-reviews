#!/usr/bin/env bash
#
# Quality sweep — mechanical enforcement for QUALITY.md Phase 7 (TT-13).
#
# Each check turns a class of past drift into an automated gate:
#   1. Raw console.* calls in app/ or workers/ (belt-and-braces for
#      ESLint no-console: error — catches file-level disable escapes).
#   2. Record<string, any[]> generic-any casts (the specific shape TT-9
#      removed from the five admin queue loaders).
#
# Plus one non-fatal report:
#   * Files under app/lib/ or app/routes/ over 400 LOC — a prompt to
#     split before they become the next monster file (QUALITY.md
#     Phase 6 dealt with the last two).
#
# Exits non-zero on any violation of checks 1-2. The file-length
# report is informational and never fails the job.
#
# Invoked from .github/workflows/main.yml and runnable locally:
# `bash scripts/quality-sweep.sh`.

set -u
VIOLATIONS=0

report() {
  local check="$1" detail="$2"
  printf '\n::error::[quality-sweep] %s\n' "$check" >&2
  printf '%s\n' "$detail" >&2
  VIOLATIONS=$((VIOLATIONS + 1))
}

# ----------------------------------------------------------------------
# 1. Raw console.* calls in app/ and workers/.
#
# ESLint already enforces no-console: error, so any hit here is either
# a file-level `/* eslint-disable no-console */` header escape, an
# accepted `eslint-disable-next-line no-console` suppression, or the
# logger implementation itself.
#
# Allow:
#   - app/lib/logger.server.ts — the Logger implementation.
#   - Tests (__tests__/, *.test.ts[x]).
#   - Lines preceded by an `eslint-disable-next-line no-console` comment
#     (ESLint has already seen and accepted the suppression).
# Block:
#   - Everything else (e.g. a file-level disable header smuggling in new
#     console calls that ESLint never saw).
# ----------------------------------------------------------------------
echo "→ Checking for raw console.* calls..."
CONSOLE_HITS=$(grep -rnE '^\s*console\.(log|warn|error|info|debug)' \
  app/ workers/ \
  --include='*.ts' --include='*.tsx' 2>/dev/null \
  | grep -v '^app/lib/logger.server.ts:' \
  | grep -v '__tests__/' \
  | grep -vE '\.test\.tsx?:' \
  || true)

if [ -n "$CONSOLE_HITS" ]; then
  # Keep only hits where the previous line isn't an eslint-disable-next-line
  # no-console. Re-open each source file to check line N-1.
  FILTERED=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    file="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    prev=$((lineno - 1))
    if [ "$prev" -gt 0 ]; then
      prevtext=$(sed -n "${prev}p" "$file")
      if echo "$prevtext" | grep -qE 'eslint-disable-next-line.*no-console'; then
        continue
      fi
    fi
    FILTERED="${FILTERED}${line}"$'\n'
  done <<< "$CONSOLE_HITS"

  if [ -n "$FILTERED" ]; then
    report "Raw console.* call" \
      "ESLint no-console is error-level; the only allowed console path is app/lib/logger.server.ts.
Use Logger (server) or accept the rule with an 'eslint-disable-next-line no-console' on the line above.

$FILTERED"
  fi
fi

# ----------------------------------------------------------------------
# 2. Record<string, any[]> generic-any casts.
#
# The specific pattern that TT-9 removed from five admin queue loaders
# (`{} as Record<string, any[]>` over moderator_approvals grouped by
# submission_id). It's zero-hit today; block to prevent regression.
#
# The narrower bracket-array variant is the right shape to ban — the
# unbracketed Record<string, any> still has legitimate uses (form data,
# filter objects, pre-selected values) and is allowed.
# ----------------------------------------------------------------------
echo "→ Checking for Record<string, any[]> casts..."
RECORD_ANY_HITS=$(grep -rnE 'Record<\s*string\s*,\s*any\s*\[\s*\]\s*>' \
  app/ workers/ \
  --include='*.ts' --include='*.tsx' 2>/dev/null \
  | grep -v '__tests__/' \
  | grep -vE '\.test\.tsx?:' \
  | grep -vE ':\s*(//|\*|#)' \
  || true)
if [ -n "$RECORD_ANY_HITS" ]; then
  report "Record<string, any[]> cast" \
    "TT-9 removed this exact shape from the admin queue loaders. Prefer a typed shape or
loadApprovalsForSubmissions (app/lib/admin/queue.server.ts).

$RECORD_ANY_HITS"
fi

# ----------------------------------------------------------------------
# File-length report (non-fatal).
#
# Files over 400 LOC under app/lib/ or app/routes/ are prompts to split —
# QUALITY.md Phase 6 dealt with registry.ts and moderation.ts after they
# passed 700. We don't fail on length; the list surfaces refactor
# candidates in the CI log.
# ----------------------------------------------------------------------
echo "→ File-length report (non-fatal, >400 LOC under app/lib, app/routes)..."
LONG_FILES=$(find app/lib app/routes -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/__tests__/*' \
  -not -name '*.test.ts' \
  -not -name '*.test.tsx' \
  -printf '%p\n' 2>/dev/null \
  | while IFS= read -r f; do
      n=$(wc -l < "$f")
      if [ "$n" -gt 400 ]; then
        printf '%5d  %s\n' "$n" "$f"
      fi
    done \
  | sort -rn)

if [ -n "$LONG_FILES" ]; then
  echo ""
  echo "Files over 400 LOC (refactor candidates — not blocking):"
  echo "$LONG_FILES"
fi

# ----------------------------------------------------------------------

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "Quality sweep: $VIOLATIONS violation(s)." >&2
  exit 1
fi

echo "Quality sweep: clean."
