#!/usr/bin/env bash
# Wait for a GitHub Actions run to reach `status: completed` and report
# its conclusion. A wrapper around `gh run view` so that the polling
# loop has a single stable command form (one allowlist entry covers
# every invocation, instead of every compound `until ... gh run view`
# variant needing manual approval).
#
# Usage:
#   ./scripts/ci-wait.sh                 # latest run on current branch
#   ./scripts/ci-wait.sh <run-id>        # specific run id
#   ./scripts/ci-wait.sh --branch main   # latest run on branch `main`
#
# Exits 0 when conclusion is `success`. Any other terminal conclusion
# (failure, cancelled, timed_out, action_required, neutral, skipped)
# exits 1, with `gh run view --log-failed` appended so the failing
# steps are visible without a second command.
#
# Polling interval defaults to 30s, overridable via CI_WAIT_INTERVAL.

set -euo pipefail

POLL_INTERVAL="${CI_WAIT_INTERVAL:-30}"

usage() {
  cat >&2 <<EOF
Usage: $0 [<run-id>] [--branch <branch>]

  <run-id>          GitHub Actions run id. If omitted, picks the latest
                    run on the current branch (or --branch if given).
  --branch <name>   Branch to look up the latest run on. Defaults to
                    the currently checked-out branch.

Env:
  CI_WAIT_INTERVAL  Polling interval in seconds (default 30).
EOF
  exit 2
}

run_id=""
branch=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      branch="${2:-}"
      [[ -z "$branch" ]] && usage
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    --*)
      usage
      ;;
    *)
      [[ -n "$run_id" ]] && usage
      run_id="$1"
      shift
      ;;
  esac
done

if [[ -z "$run_id" ]]; then
  if [[ -z "$branch" ]]; then
    branch=$(git branch --show-current 2>/dev/null || true)
  fi
  if [[ -z "$branch" ]]; then
    echo "ci-wait: no run id given and current branch is undetectable" >&2
    exit 2
  fi
  run_id=$(gh run list --branch "$branch" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  if [[ -z "$run_id" ]]; then
    echo "ci-wait: no runs found for branch $branch" >&2
    exit 2
  fi
  echo "ci-wait: latest run on $branch is $run_id"
fi

echo "ci-wait: polling run $run_id every ${POLL_INTERVAL}s..."

while :; do
  status=$(gh run view "$run_id" --json status --jq .status 2>/dev/null || true)
  if [[ -z "$status" ]]; then
    echo "ci-wait: failed to read run status (transient gh error?), retrying" >&2
  elif [[ "$status" == "completed" ]]; then
    break
  fi
  sleep "$POLL_INTERVAL"
done

# Authoritative result. `gh run watch --exit-status` propagates the
# latest non-zero step exit code (so a `continue-on-error: true` step
# that exited non-zero lies green-as-red), per CLAUDE.md. Read
# `conclusion` from the API directly instead.
gh run view "$run_id" --json status,conclusion,displayTitle,url,headSha --jq \
  '"\(.displayTitle) (\(.headSha[:7]))\n  status:     \(.status)\n  conclusion: \(.conclusion)\n  url:        \(.url)"'

conclusion=$(gh run view "$run_id" --json conclusion --jq '.conclusion')

if [[ "$conclusion" == "success" ]]; then
  exit 0
fi

echo
echo "ci-wait: conclusion=$conclusion — failing steps below" >&2
gh run view "$run_id" --log-failed || true
exit 1
