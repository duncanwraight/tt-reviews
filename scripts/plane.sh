#!/usr/bin/env bash
# Thin wrapper around the Plane REST API.
# See docs/PLANE.md for the underlying endpoints.
#
# Usage:
#   ./scripts/plane.sh projects                  # list projects in the workspace
#   ./scripts/plane.sh list [--state NAME]       # list work items in $PLANE_PROJECT_ID
#   ./scripts/plane.sh show <seq|uuid>           # show one work item
#   ./scripts/plane.sh new "Title" [--priority low|medium|high|urgent] [--label NAME ...]
#                                  [--description TEXT | --description-file PATH]
#   ./scripts/plane.sh describe <seq|uuid> (--description TEXT | --description-file PATH)
#   ./scripts/plane.sh done <seq|uuid>           # move to the "Done" state
#   ./scripts/plane.sh state <seq|uuid> <NAME>   # move to any state by name (e.g. "In Progress")
#   ./scripts/plane.sh labels                    # list labels
#   ./scripts/plane.sh states                    # list states
#
# Env (loaded from .env if present):
#   PLANE_ACCESS_TOKEN   required
#   PLANE_WORKSPACE      defaults to "tt-reviews"
#   PLANE_PROJECT_ID     required for anything below the project level

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a; . "$ROOT/.env"; set +a
fi

: "${PLANE_ACCESS_TOKEN:?PLANE_ACCESS_TOKEN not set (add it to .env)}"
: "${PLANE_WORKSPACE:=tt-reviews}"

BASE="https://api.plane.so/api/v1/workspaces/$PLANE_WORKSPACE"
AUTH=(-H "X-API-Key: $PLANE_ACCESS_TOKEN")

command -v jq >/dev/null 2>&1 || { echo "jq is required (brew/apt install jq)" >&2; exit 1; }

die() { echo "$*" >&2; exit 1; }
need_project() { : "${PLANE_PROJECT_ID:?PLANE_PROJECT_ID not set — run 'projects' to find one, then export it or put it in .env}"; }

api() {
  local method="$1" path="$2"; shift 2
  curl -sS -X "$method" "${AUTH[@]}" -H "Content-Type: application/json" "$BASE$path" "$@"
}

# Resolve "42", "TT-42", or a UUID to a work-item UUID.
resolve_work_item() {
  local ref="$1"
  if [[ "$ref" =~ ^[0-9a-f]{8}-[0-9a-f]{4}- ]]; then
    echo "$ref"; return
  fi
  local seq="${ref##*-}"  # strip any "TT-" prefix
  [[ "$seq" =~ ^[0-9]+$ ]] || die "can't parse work-item reference: $ref"
  local id
  id=$(api GET "/projects/$PLANE_PROJECT_ID/work-items/?per_page=500" \
    | jq -r --arg seq "$seq" '.results[] | select(.sequence_id == ($seq|tonumber)) | .id' | head -n1)
  [[ -n "$id" ]] || die "no work item with sequence id $seq"
  echo "$id"
}

# Resolve a label/state name (case-insensitive) to a UUID.
resolve_named() {
  local resource="$1" name="$2"
  api GET "/projects/$PLANE_PROJECT_ID/$resource/" \
    | jq -r --arg n "$name" '.results[] | select((.name | ascii_downcase) == ($n | ascii_downcase)) | .id' | head -n1
}

cmd_projects() {
  api GET "/projects/" | jq -r '.results[] | "\(.id)  \(.name)"'
}

cmd_list() {
  need_project
  local state_filter=""
  while (($#)); do
    case "$1" in
      --state) state_filter="$2"; shift 2;;
      *) die "unknown flag: $1";;
    esac
  done
  # Pull states + labels once so we can print names instead of UUIDs.
  local states labels
  states=$(api GET "/projects/$PLANE_PROJECT_ID/states/")
  labels=$(api GET "/projects/$PLANE_PROJECT_ID/labels/")
  api GET "/projects/$PLANE_PROJECT_ID/work-items/?per_page=200" \
    | jq -r --argjson s "$states" --argjson l "$labels" --arg sf "$state_filter" '
        ($s.results | map({key:.id, value:.name}) | from_entries) as $smap
        | ($l.results | map({key:.id, value:.name}) | from_entries) as $lmap
        | .results
        | map({
            seq: .sequence_id,
            name: .name,
            priority: .priority,
            state: ($smap[.state] // "?"),
            labels: [.labels[]? as $id | $lmap[$id]]
          })
        | (if $sf == "" then . else map(select((.state | ascii_downcase) == ($sf | ascii_downcase))) end)
        | sort_by(.seq)
        | .[] | "[\(.state | .[0:4])] TT-\(.seq)  (\(.priority))  \(.name)\(if (.labels|length)>0 then "  #" + (.labels | join(" #")) else "" end)"
      '
}

cmd_show() {
  need_project; [[ $# -ge 1 ]] || die "usage: plane.sh show <seq|uuid>"
  local id; id=$(resolve_work_item "$1")
  api GET "/projects/$PLANE_PROJECT_ID/work-items/$id/" | jq '.'
}

# Convert plain text (on stdin) to Plane-friendly HTML: escape &<>, split
# paragraphs on blank lines, turn single newlines into <br>. If the input
# already contains `<p>` or `<h` tags, assume it's HTML and pass through.
text_to_html() {
  jq -Rs '
    if test("<p[ >]|<h[1-6][ >]"; "i") then
      .
    else
      gsub("&"; "&amp;")
      | gsub("<"; "&lt;")
      | gsub(">"; "&gt;")
      | split("\n\n")
      | map(gsub("\n"; "<br>") | "<p>" + . + "</p>")
      | join("")
    end
  '
}

# Resolve a --description / --description-file pair into an HTML JSON string (via text_to_html).
# Usage: description_html=$(read_description TEXT) or read_description_file PATH
read_description_arg() {
  printf '%s' "$1" | text_to_html
}
read_description_file() {
  [[ -f "$1" ]] || die "description file not found: $1"
  cat "$1" | text_to_html
}

cmd_new() {
  need_project; [[ $# -ge 1 ]] || die "usage: plane.sh new \"Title\" [--priority P] [--label NAME ...] [--description TEXT | --description-file PATH]"
  local title="$1"; shift
  local priority="none"
  local description_html=""
  local label_ids=()
  while (($#)); do
    case "$1" in
      --priority) priority="$2"; shift 2;;
      --label)
        local lid; lid=$(resolve_named labels "$2")
        [[ -n "$lid" ]] || die "no label called '$2' (use 'plane.sh labels')"
        label_ids+=("$lid"); shift 2;;
      --description)      description_html=$(read_description_arg "$2"); shift 2;;
      --description-file) description_html=$(read_description_file "$2"); shift 2;;
      *) die "unknown flag: $1";;
    esac
  done
  local labels_json
  labels_json=$(printf '%s\n' "${label_ids[@]}" | jq -R . | jq -s .)
  [[ "${#label_ids[@]}" -eq 0 ]] && labels_json="[]"
  local payload
  if [[ -n "$description_html" ]]; then
    payload=$(jq -n --arg n "$title" --arg p "$priority" --argjson l "$labels_json" --argjson d "$description_html" \
      '{name:$n, priority:$p, labels:$l, description_html:$d}')
  else
    payload=$(jq -n --arg n "$title" --arg p "$priority" --argjson l "$labels_json" \
      '{name:$n, priority:$p, labels:$l}')
  fi
  api POST "/projects/$PLANE_PROJECT_ID/work-items/" -d "$payload" \
    | jq -r '"created TT-\(.sequence_id)  \(.name)  (\(.id))"'
}

cmd_describe() {
  need_project; [[ $# -ge 3 ]] || die "usage: plane.sh describe <seq|uuid> (--description TEXT | --description-file PATH)"
  local id; id=$(resolve_work_item "$1"); shift
  local description_html=""
  while (($#)); do
    case "$1" in
      --description)      description_html=$(read_description_arg "$2"); shift 2;;
      --description-file) description_html=$(read_description_file "$2"); shift 2;;
      *) die "unknown flag: $1";;
    esac
  done
  [[ -n "$description_html" ]] || die "describe requires --description or --description-file"
  api PATCH "/projects/$PLANE_PROJECT_ID/work-items/$id/" \
    -d "$(jq -n --argjson d "$description_html" '{description_html:$d}')" \
    | jq -r '"TT-\(.sequence_id) description updated"'
}

cmd_state() {
  need_project; [[ $# -ge 2 ]] || die "usage: plane.sh state <seq|uuid> <state-name>"
  local id state_id
  id=$(resolve_work_item "$1")
  state_id=$(resolve_named states "$2") || true
  [[ -n "$state_id" ]] || die "no state called '$2' (use 'plane.sh states')"
  api PATCH "/projects/$PLANE_PROJECT_ID/work-items/$id/" \
    -d "$(jq -n --arg s "$state_id" '{state:$s}')" \
    | jq -r --arg name "$2" '"TT-\(.sequence_id) → \($name)"'
}

cmd_done() {
  need_project; [[ $# -ge 1 ]] || die "usage: plane.sh done <seq|uuid>"
  # Resolve the first state in the `completed` group, so this works
  # regardless of whether the state is named "Done", "Completed", etc.
  local done_state
  done_state=$(api GET "/projects/$PLANE_PROJECT_ID/states/" \
    | jq -r '[.results[] | select(.group=="completed")] | sort_by(.sequence) | .[0].name')
  [[ -n "$done_state" && "$done_state" != "null" ]] || die "no state in 'completed' group"
  cmd_state "$1" "$done_state"
}

cmd_labels() {
  need_project
  api GET "/projects/$PLANE_PROJECT_ID/labels/" | jq -r '.results[] | "\(.color)  \(.name)  (\(.id))"'
}

cmd_states() {
  need_project
  api GET "/projects/$PLANE_PROJECT_ID/states/" | jq -r '.results[] | "\(.group | .[0:4])  \(.name)  (\(.id))"'
}

sub="${1:-}"; shift || true
case "$sub" in
  projects) cmd_projects "$@";;
  list)     cmd_list "$@";;
  show)     cmd_show "$@";;
  new)      cmd_new "$@";;
  describe) cmd_describe "$@";;
  state)    cmd_state "$@";;
  done)     cmd_done "$@";;
  labels)   cmd_labels "$@";;
  states)   cmd_states "$@";;
  ""|-h|--help|help)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *) die "unknown command: $sub (try --help)";;
esac
