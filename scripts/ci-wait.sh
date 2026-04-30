#!/usr/bin/env bash
# Wait for a GitHub Actions run to reach `status: completed` and report
# its conclusion. A wrapper around `gh run view` so that the polling
# loop has a single stable command form (one allowlist entry covers
# every invocation, instead of every compound `until ... gh run view`
# variant needing manual approval).
#
# Usage:
#   ./scripts/ci-wait.sh                 # run for HEAD's sha on current branch
#   ./scripts/ci-wait.sh <run-id>        # specific run id
#   ./scripts/ci-wait.sh --branch main   # latest run on branch `main`
#                                        # (sha-agnostic — old behaviour)
#
# Default mode is sha-precise: it resolves `git rev-parse HEAD` and
# polls until a run appears for that exact sha on the current branch.
# This avoids the race where, immediately after `git push`, the script
# would otherwise grab the previous commit's already-completed run
# (because GitHub hasn't registered the new workflow run yet) and lie
# green about the new push. Use `--branch` for the old "latest on
# branch regardless of sha" behaviour when that's what you actually
# want (e.g. checking what's currently running on main).
#
# Exits 0 when conclusion is `success`. Any other terminal conclusion
# (failure, cancelled, timed_out, action_required, neutral, skipped)
# exits 1, with `gh run view --log-failed` appended so the failing
# steps are visible without a second command.
#
# Polling interval defaults to 30s, overridable via CI_WAIT_INTERVAL.
# Time spent waiting for the run to *appear* (sha-precise mode only)
# defaults to 5 min, overridable via CI_WAIT_REGISTER_TIMEOUT.

set -euo pipefail

POLL_INTERVAL="${CI_WAIT_INTERVAL:-30}"
REGISTER_TIMEOUT="${CI_WAIT_REGISTER_TIMEOUT:-300}"

usage() {
  cat >&2 <<EOF
Usage: $0 [<run-id>] [--branch <branch>]

  <run-id>          GitHub Actions run id. Skips sha lookup entirely.
  --branch <name>   Sha-agnostic mode: pick the latest run on the named
                    branch by createdAt. Use when you want "whatever's
                    currently running on main" rather than the run for
                    your local HEAD.

  (no args)         Sha-precise mode: resolve git HEAD and wait for a
                    run matching that sha on the current branch. Polls
                    until the run is registered (up to 5 min) so a
                    fresh-push doesn't race the workflow registration.

Env:
  CI_WAIT_INTERVAL          Polling interval in seconds (default 30).
  CI_WAIT_REGISTER_TIMEOUT  Max seconds to wait for the sha's run to
                            appear (default 300).
EOF
  exit 2
}

run_id=""
branch=""
branch_explicit=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      branch="${2:-}"
      [[ -z "$branch" ]] && usage
      branch_explicit=1
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

  if [[ -n "$branch_explicit" ]]; then
    # Sha-agnostic: latest run on the named branch.
    run_id=$(gh run list --branch "$branch" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
    if [[ -z "$run_id" ]]; then
      echo "ci-wait: no runs found for branch $branch" >&2
      exit 2
    fi
    echo "ci-wait: latest run on $branch is $run_id (sha-agnostic --branch mode)"
  else
    # Sha-precise: wait for the run matching HEAD to appear, then track it.
    head_sha=$(git rev-parse HEAD 2>/dev/null || true)
    if [[ -z "$head_sha" ]]; then
      echo "ci-wait: cannot resolve HEAD sha — pass <run-id> or --branch <name>" >&2
      exit 2
    fi

    deadline=$(( $(date +%s) + REGISTER_TIMEOUT ))
    notified=""
    while :; do
      # Pull a small window of recent runs and filter to matching sha.
      # `last` after sort_by(.createdAt) picks the most recent re-run if
      # the same sha has been re-run.
      run_id=$(gh run list --branch "$branch" --limit 10 \
        --json databaseId,headSha,createdAt \
        --jq "map(select(.headSha == \"$head_sha\")) | sort_by(.createdAt) | last | .databaseId // empty")
      if [[ -n "$run_id" ]]; then
        break
      fi
      if (( $(date +%s) > deadline )); then
        echo "ci-wait: no run for HEAD ${head_sha:0:7} on $branch appeared within ${REGISTER_TIMEOUT}s" >&2
        echo "ci-wait: was the commit pushed? Or pass <run-id> / --branch $branch to override." >&2
        exit 2
      fi
      if [[ -z "$notified" ]]; then
        echo "ci-wait: waiting for a run on ${head_sha:0:7} ($branch) to be registered..."
        notified=1
      fi
      sleep 5
    done
    echo "ci-wait: run $run_id matches HEAD ${head_sha:0:7} on $branch"
  fi
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
