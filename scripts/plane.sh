#!/usr/bin/env bash
# Thin wrapper around the Plane REST API. See docs/PLANE.md for endpoints.
#
# Run `./scripts/plane.sh --help` for a command list. Append `--help` to any
# subcommand (e.g. `./scripts/plane.sh new --help`) for command-specific help.

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

# Per-command help. Pass the subcommand name; pass nothing (or an unknown
# command) for the generic overview.
show_help() {
  case "${1:-}" in
    projects)
      cat <<'EOF'
plane.sh projects
  List projects in the workspace, with their UUIDs.
EOF
      ;;
    list)
      cat <<'EOF'
plane.sh list [--state NAME]
  List work items in $PLANE_PROJECT_ID, sorted by sequence id. Each line
  is annotated with state, priority, labels, and parent/child markers
  ([↳ TT-N] for children, [parent: M/N done] for parents).

  Flags:
    --state NAME    Only show items in the named state (case-insensitive),
                    e.g. "Backlog", "In Progress", "Blocked", "Completed".
EOF
      ;;
    show)
      cat <<'EOF'
plane.sh show <seq|uuid>
  Print the full JSON for one work item. <seq> may be "42", "TT-42",
  or a work-item UUID.
EOF
      ;;
    children)
      cat <<'EOF'
plane.sh children <seq|uuid>
  List sub-issues of the given parent, with their states and an "M/N
  complete" summary. Prints a hint when the parent is ready to close.
EOF
      ;;
    new)
      cat <<'EOF'
plane.sh new "Title" [flags]
  Create a new work item. Defaults to the project's default state
  (Backlog) and priority "none".

  Flags:
    --priority low|medium|high|urgent
    --label NAME              May be repeated to add multiple labels.
    --description TEXT        Plain text. Blank lines become paragraphs;
                              single newlines become <br>; <, >, & are
                              HTML-escaped. Pass-through if it already
                              contains <p> or <h1>..<h6>.
    --description-file PATH   Read description from a file.
    --parent <seq|uuid>       Parent work item (creates a sub-issue).

  Example:
    plane.sh new "Fix CSRF on rename form" --priority high --label bug \
      --description-file ./tmp/notes.md
EOF
      ;;
    describe)
      cat <<'EOF'
plane.sh describe <seq|uuid> (--description TEXT | --description-file PATH)
  Replace a work item's description. Use 'plane.sh update' for any
  other field.
EOF
      ;;
    update)
      cat <<'EOF'
plane.sh update <seq|uuid> [flags]
  Patch one or more fields on a work item. At least one flag is
  required. For state changes, use 'plane.sh state' or 'plane.sh done'.

  Flags:
    --title TEXT
    --priority none|low|medium|high|urgent
    --description TEXT
    --description-file PATH
    --add-label NAME          May be repeated.
    --remove-label NAME       May be repeated.
    --parent <seq|uuid>       Reparent the item.
    --no-parent               Detach from current parent.

  Examples:
    plane.sh update TT-14 --priority high --add-label bug
    plane.sh update TT-14 --title "Fix CSRF on category rename"
    plane.sh update TT-14 --remove-label polish --parent TT-25
EOF
      ;;
    state)
      cat <<'EOF'
plane.sh state <seq|uuid> <state-name>
  Move a work item to the named state (case-insensitive). Examples:
  "In Progress", "Blocked", "Backlog", "Completed".
EOF
      ;;
    done)
      cat <<'EOF'
plane.sh done <seq|uuid>
  Move a work item to the first state in the 'completed' group. If the
  closed item's parent now has all children complete, prints a hint to
  close the parent too.
EOF
      ;;
    delete)
      cat <<'EOF'
plane.sh delete <seq|uuid> [--yes]
  Delete a work item. Prompts for confirmation by default; pass --yes
  (or -y) to skip the prompt. Sequence IDs do not reclaim — deleting
  TT-5 does not free the number for the next item.
EOF
      ;;
    labels)
      cat <<'EOF'
plane.sh labels
  List all labels in the project, with colors and UUIDs.
EOF
      ;;
    states)
      cat <<'EOF'
plane.sh states
  List all states in the project, with their group
  (backlog/started/completed/etc).
EOF
      ;;
    *)
      cat <<'EOF'
plane.sh — wrapper around the Plane REST API. See docs/PLANE.md.

Commands:
  projects                              List projects in the workspace
  list [--state NAME]                   List work items
  show <seq|uuid>                       Show full JSON for one work item
  children <seq|uuid>                   List sub-issues of a parent
  new "Title" [flags]                   Create a work item
  describe <seq|uuid> --description …   Replace description (shortcut)
  update <seq|uuid> [flags]             Update title / priority / labels / parent
  state <seq|uuid> <NAME>               Move to a named state
  done <seq|uuid>                       Move to the 'completed' state
  delete <seq|uuid> [--yes]             Delete a work item
  labels                                List labels
  states                                List states

Append --help to any command for command-specific help, e.g.
  ./scripts/plane.sh new --help
  ./scripts/plane.sh help update          (equivalent)

Env (loaded from .env):
  PLANE_ACCESS_TOKEN   required
  PLANE_WORKSPACE      defaults to "tt-reviews"
  PLANE_PROJECT_ID     required for anything below the project level
EOF
      ;;
  esac
}

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
        | (.results | map({key:.id, value:.sequence_id}) | from_entries) as $idToSeq
        | (
            .results
            | map(select(.parent != null))
            | group_by(.parent)
            | map({
                key: .[0].parent,
                value: { total: length, done: ([.[] | select(.completed_at != null)] | length) }
              })
            | from_entries
          ) as $childMap
        | .results
        | map({
            seq: .sequence_id,
            name: .name,
            priority: .priority,
            state: ($smap[.state] // "?"),
            labels: [.labels[]? as $id | $lmap[$id]],
            parent_seq: (if .parent then $idToSeq[.parent] else null end),
            children: ($childMap[.id] // null)
          })
        | (if $sf == "" then . else map(select((.state | ascii_downcase) == ($sf | ascii_downcase))) end)
        | sort_by(.seq)
        | .[]
        | "[\(.state | .[0:4])] TT-\(.seq)  (\(.priority))  \(.name)"
          + (if (.labels|length)>0 then "  #" + (.labels | join(" #")) else "" end)
          + (if .parent_seq then "  [↳ TT-\(.parent_seq)]" else "" end)
          + (if .children then "  [parent: \(.children.done)/\(.children.total) done]" else "" end)
      '
}

cmd_show() {
  need_project; [[ $# -ge 1 ]] || die "usage: plane.sh show <seq|uuid>"
  local id; id=$(resolve_work_item "$1")
  api GET "/projects/$PLANE_PROJECT_ID/work-items/$id/" | jq '.'
}

cmd_children() {
  need_project; [[ $# -ge 1 ]] || die "usage: plane.sh children <seq|uuid>"
  local parent_id; parent_id=$(resolve_work_item "$1")
  local states all_items
  states=$(api GET "/projects/$PLANE_PROJECT_ID/states/")
  all_items=$(api GET "/projects/$PLANE_PROJECT_ID/work-items/?per_page=500")
  local parent_seq
  parent_seq=$(jq -r --arg p "$parent_id" '.results[] | select(.id == $p) | .sequence_id' <<<"$all_items")
  [[ -n "$parent_seq" ]] || die "no work item with id $parent_id"
  local rendered total done_count
  rendered=$(jq -r --argjson s "$states" --arg p "$parent_id" '
      ($s.results | map({key:.id, value:.name}) | from_entries) as $smap
      | [.results[] | select(.parent == $p)]
      | sort_by(.sequence_id)
      | .[] | "[\($smap[.state] // "?" | .[0:4])] TT-\(.sequence_id)  (\(.priority))  \(.name)"
    ' <<<"$all_items")
  total=$(jq --arg p "$parent_id" '[.results[] | select(.parent == $p)] | length' <<<"$all_items")
  done_count=$(jq --arg p "$parent_id" '[.results[] | select(.parent == $p) | select(.completed_at != null)] | length' <<<"$all_items")
  if [[ "$total" -eq 0 ]]; then
    echo "TT-$parent_seq has no children"
    return
  fi
  echo "$rendered"
  echo "$done_count/$total complete"
  local parent_done
  parent_done=$(jq -r --arg p "$parent_id" '.results[] | select(.id == $p) | .completed_at // ""' <<<"$all_items")
  if [[ "$done_count" == "$total" && -z "$parent_done" ]]; then
    echo "hint: parent TT-$parent_seq is ready to close — ./scripts/plane.sh done TT-$parent_seq"
  fi
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
  need_project; [[ $# -ge 1 ]] || die "usage: plane.sh new \"Title\" [--priority P] [--label NAME ...] [--description TEXT | --description-file PATH] [--parent <seq|uuid>]"
  local title="$1"; shift
  local priority="none"
  local description_html=""
  local parent_id=""
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
      --parent)           parent_id=$(resolve_work_item "$2"); shift 2;;
      *) die "unknown flag: $1";;
    esac
  done
  local labels_json
  labels_json=$(printf '%s\n' "${label_ids[@]}" | jq -R . | jq -s .)
  [[ "${#label_ids[@]}" -eq 0 ]] && labels_json="[]"
  local payload
  payload=$(jq -n --arg n "$title" --arg p "$priority" --argjson l "$labels_json" \
    '{name:$n, priority:$p, labels:$l}')
  if [[ -n "$description_html" ]]; then
    payload=$(jq --argjson d "$description_html" '. + {description_html:$d}' <<<"$payload")
  fi
  if [[ -n "$parent_id" ]]; then
    payload=$(jq --arg pid "$parent_id" '. + {parent:$pid}' <<<"$payload")
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

cmd_update() {
  need_project; [[ $# -ge 1 ]] || die "usage: plane.sh update <seq|uuid> [flags] (run 'plane.sh update --help' for the full list)"
  local id; id=$(resolve_work_item "$1"); shift
  local title="" priority="" description_html="" parent_id="" clear_parent=""
  local add_label_ids=() remove_label_ids=()
  while (($#)); do
    case "$1" in
      --title)            title="$2"; shift 2;;
      --priority)         priority="$2"; shift 2;;
      --description)      description_html=$(read_description_arg "$2"); shift 2;;
      --description-file) description_html=$(read_description_file "$2"); shift 2;;
      --parent)           parent_id=$(resolve_work_item "$2"); shift 2;;
      --no-parent)        clear_parent=1; shift;;
      --add-label)
        local lid; lid=$(resolve_named labels "$2")
        [[ -n "$lid" ]] || die "no label called '$2' (use 'plane.sh labels')"
        add_label_ids+=("$lid"); shift 2;;
      --remove-label)
        local lid; lid=$(resolve_named labels "$2")
        [[ -n "$lid" ]] || die "no label called '$2' (use 'plane.sh labels')"
        remove_label_ids+=("$lid"); shift 2;;
      *) die "unknown flag: $1 (run 'plane.sh update --help')";;
    esac
  done

  local payload="{}"
  [[ -n "$title" ]]            && payload=$(jq --arg n "$title" '. + {name:$n}' <<<"$payload")
  [[ -n "$priority" ]]         && payload=$(jq --arg p "$priority" '. + {priority:$p}' <<<"$payload")
  [[ -n "$description_html" ]] && payload=$(jq --argjson d "$description_html" '. + {description_html:$d}' <<<"$payload")
  if [[ -n "$clear_parent" ]]; then
    payload=$(jq '. + {parent:null}' <<<"$payload")
  elif [[ -n "$parent_id" ]]; then
    payload=$(jq --arg p "$parent_id" '. + {parent:$p}' <<<"$payload")
  fi

  # Labels are an array — fetch the current set so add/remove operate on it
  # rather than overwriting the whole list.
  if [[ "${#add_label_ids[@]}" -gt 0 || "${#remove_label_ids[@]}" -gt 0 ]]; then
    local current add_json remove_json merged
    current=$(api GET "/projects/$PLANE_PROJECT_ID/work-items/$id/" | jq -c '.labels')
    if [[ "${#add_label_ids[@]}" -gt 0 ]]; then
      add_json=$(printf '%s\n' "${add_label_ids[@]}" | jq -R . | jq -s .)
    else
      add_json="[]"
    fi
    if [[ "${#remove_label_ids[@]}" -gt 0 ]]; then
      remove_json=$(printf '%s\n' "${remove_label_ids[@]}" | jq -R . | jq -s .)
    else
      remove_json="[]"
    fi
    merged=$(jq -nc --argjson cur "$current" --argjson add "$add_json" --argjson rem "$remove_json" \
      '($cur + $add) | unique | map(select(. as $x | $rem | index($x) | not))')
    payload=$(jq --argjson l "$merged" '. + {labels:$l}' <<<"$payload")
  fi

  if [[ "$payload" == "{}" ]]; then
    die "no fields to update — see 'plane.sh update --help' for the available flags"
  fi

  api PATCH "/projects/$PLANE_PROJECT_ID/work-items/$id/" -d "$payload" \
    | jq -r '"TT-\(.sequence_id) updated"'
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
  local id states done_state state_id
  id=$(resolve_work_item "$1")
  states=$(api GET "/projects/$PLANE_PROJECT_ID/states/")
  done_state=$(jq -r '[.results[] | select(.group=="completed")] | sort_by(.sequence) | .[0].name' <<<"$states")
  [[ -n "$done_state" && "$done_state" != "null" ]] || die "no state in 'completed' group"
  state_id=$(jq -r --arg n "$done_state" '.results[] | select((.name | ascii_downcase) == ($n | ascii_downcase)) | .id' <<<"$states")
  [[ -n "$state_id" ]] || die "no state UUID for '$done_state'"

  local result
  result=$(api PATCH "/projects/$PLANE_PROJECT_ID/work-items/$id/" \
    -d "$(jq -n --arg s "$state_id" '{state:$s}')")
  jq -r --arg name "$done_state" '"TT-\(.sequence_id) → \($name)"' <<<"$result"

  # Parent-complete hint: if the closed item has a parent, and all of that
  # parent's children are now closed (and the parent itself isn't), suggest
  # closing the parent. Parents are container-only on this project — see
  # .claude/skills/plane/SKILL.md.
  local parent_id
  parent_id=$(jq -r '.parent // ""' <<<"$result")
  [[ -z "$parent_id" ]] && return
  local all_items total done_count parent_seq parent_done
  all_items=$(api GET "/projects/$PLANE_PROJECT_ID/work-items/?per_page=500")
  total=$(jq --arg p "$parent_id" '[.results[] | select(.parent == $p)] | length' <<<"$all_items")
  done_count=$(jq --arg p "$parent_id" '[.results[] | select(.parent == $p) | select(.completed_at != null)] | length' <<<"$all_items")
  parent_seq=$(jq -r --arg p "$parent_id" '.results[] | select(.id == $p) | .sequence_id' <<<"$all_items")
  parent_done=$(jq -r --arg p "$parent_id" '.results[] | select(.id == $p) | .completed_at // ""' <<<"$all_items")
  if [[ "$done_count" == "$total" && "$total" -gt 0 && -z "$parent_done" ]]; then
    echo "hint: parent TT-$parent_seq now has all $total children complete — close with ./scripts/plane.sh done TT-$parent_seq" >&2
  fi
}

cmd_labels() {
  need_project
  api GET "/projects/$PLANE_PROJECT_ID/labels/" | jq -r '.results[] | "\(.color)  \(.name)  (\(.id))"'
}

cmd_states() {
  need_project
  api GET "/projects/$PLANE_PROJECT_ID/states/" | jq -r '.results[] | "\(.group | .[0:4])  \(.name)  (\(.id))"'
}

cmd_delete() {
  need_project; [[ $# -ge 1 ]] || die "usage: plane.sh delete <seq|uuid> [--yes]"
  local ref="$1"; shift
  local force=""
  while (($#)); do
    case "$1" in
      --yes|-y) force=1; shift;;
      *) die "unknown flag: $1 (run 'plane.sh delete --help')";;
    esac
  done
  local id item seq name
  id=$(resolve_work_item "$ref")
  item=$(api GET "/projects/$PLANE_PROJECT_ID/work-items/$id/")
  seq=$(jq -r '.sequence_id' <<<"$item")
  name=$(jq -r '.name' <<<"$item")
  if [[ -z "$force" ]]; then
    if [[ -t 0 ]]; then
      local ans
      read -r -p "Really delete TT-$seq \"$name\"? [y/N] " ans
      [[ "$ans" =~ ^[yY]$ ]] || die "aborted"
    else
      die "delete refused without --yes (no tty for interactive confirmation)"
    fi
  fi
  if ! api DELETE "/projects/$PLANE_PROJECT_ID/work-items/$id/" -f >/dev/null; then
    die "delete failed (Plane API returned an error)"
  fi
  echo "deleted TT-$seq  $name"
}

sub="${1:-}"; shift || true

# Generic help when invoked with no command, or `--help` / `-h` / `help` in
# the command slot. `plane.sh help <cmd>` shows command-specific help.
if [[ -z "$sub" || "$sub" == "--help" || "$sub" == "-h" || "$sub" == "help" ]]; then
  show_help "${1:-}"; exit 0
fi

# Per-command help: intercept `--help` / `-h` anywhere in the args, except
# when it's the value of a flag that takes a value (so e.g.
# `update TT-5 --description "--help"` keeps "--help" as content).
prev=""
for arg in "$@"; do
  case "$prev" in
    --priority|--label|--add-label|--remove-label|--description|--description-file|--parent|--state|--title)
      ;;
    *)
      if [[ "$arg" == "--help" || "$arg" == "-h" ]]; then
        show_help "$sub"; exit 0
      fi
      ;;
  esac
  prev="$arg"
done

case "$sub" in
  projects) cmd_projects "$@";;
  list)     cmd_list "$@";;
  show)     cmd_show "$@";;
  children) cmd_children "$@";;
  new)      cmd_new "$@";;
  describe) cmd_describe "$@";;
  update)   cmd_update "$@";;
  state)    cmd_state "$@";;
  done)     cmd_done "$@";;
  delete)   cmd_delete "$@";;
  labels)   cmd_labels "$@";;
  states)   cmd_states "$@";;
  *) die "unknown command: $sub (run 'plane.sh --help' for the command list)";;
esac
