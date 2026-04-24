# Plane

[Plane](https://plane.so) is the tracker for planned work on this project. This doc covers the API and the wrapper script. The `/plane` skill (`.claude/skills/plane/SKILL.md`) is the workflow guide — use that when picking up work.

## TL;DR

- Wrapper script: `./scripts/plane.sh` — `projects`, `list`, `show`, `new`, `describe`, `state`, `done`, `labels`, `states`. Needs `jq`. Loads `.env` automatically.
- Workspace slug: `tt-reviews` (workspace UUID: `abbfec5b-9317-48d3-8dc6-db4c9be15da9`)
- Project: **TT Reviews** — identifier `TT`, UUID `dbcecf38-c6fc-482e-bbc1-ebbff0cb2001`
- Auth: personal access token in `X-API-Key` header. `.env` holds `PLANE_ACCESS_TOKEN`, `PLANE_WORKSPACE`, `PLANE_PROJECT_ID`.
- Base URL: `https://api.plane.so/api/v1/`
- No official CLI. REST only. No public OpenAPI spec (tried `/openapi.json` and `/api/v1/schema/` — both 404).

## Project layout

States (ordered):

| Order | Name        | Group       |
| ----- | ----------- | ----------- |
| 1     | Backlog     | `backlog`   |
| 2     | In Progress | `started`   |
| 3     | Blocked     | `started`   |
| 4     | Completed   | `completed` |

No `unstarted` or `cancelled` state — a work item either sits in Backlog, is being worked on (In Progress / Blocked), or is Completed. If we need "abandoned / won't fix" later, add a state in the `cancelled` group.

Labels: `bug` (red), `feature` (blue), `polish` (purple).

## Wrapper usage

Day-to-day, use `./scripts/plane.sh`. The REST reference further down is for when the wrapper doesn't cover what you need.

```sh
# Listing
./scripts/plane.sh list                           # everything, sorted by TT-N
./scripts/plane.sh list --state Backlog           # one state
./scripts/plane.sh show TT-14                     # full JSON for one item

# Creating
./scripts/plane.sh new "Short title"
./scripts/plane.sh new "Fix CSRF on admin.content" --priority high --label bug \
  --description "CSRF token missing on the category rename form.

Steps:
- Add _csrf hidden input to CategoryManager
- Add validateCSRF() to the action
- Regression test in e2e/security-csrf.spec.ts"

# Or pass a file (handy for anything multi-paragraph)
./scripts/plane.sh new "Rewrite upload pipeline" --priority medium --label feature \
  --description-file ./tmp/upload-plan.md

# Parent an item to an existing one (epic / sub-issue relationship)
./scripts/plane.sh new "Phase 1: schema" --parent TT-25 --priority high

# Updating an existing item's description
./scripts/plane.sh describe TT-14 --description "..."
./scripts/plane.sh describe TT-14 --description-file ./notes.md

# State transitions
./scripts/plane.sh state TT-14 "In Progress"
./scripts/plane.sh state TT-14 Blocked
./scripts/plane.sh done TT-14                     # resolves to the `completed`-group state
```

Description input is plain text by default — blank lines become paragraph breaks, single newlines become `<br>`, and `<`/`>`/`&` are HTML-escaped. If the input already looks like HTML (contains `<p>` or `<h1>`..`<h6>`), it's passed through as-is so you can hand-author rich content.

## Authentication

Personal access tokens are workspace-scoped. Generate from `Profile → Personal Access Tokens` in the Plane UI.

```sh
curl -H "X-API-Key: $PLANE_ACCESS_TOKEN" https://api.plane.so/api/v1/workspaces/tt-reviews/projects/
```

Header is `X-API-Key`, **not** `Authorization: Bearer` — `Bearer` is only for OAuth app installs. Getting this wrong returns a generic 401.

## Rate limits

60 requests / minute per token. Response headers to watch:

- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` (UTC epoch seconds)

Paginated list endpoints default to `per_page=100` and return cursor tokens (`next_cursor`, `prev_cursor`) — use `?per_page=N&cursor=<token>` to page.

## Resource model

```
Workspace (tt-reviews)
└── Project
    ├── States         (workflow columns — have a `group`: backlog/unstarted/started/completed/cancelled)
    ├── Labels         (colored tags)
    ├── Modules        (feature/area groupings of work items)
    ├── Cycles         (time-boxed sprints)
    ├── Pages          (doc pages within the project)
    └── Work Items     (the tasks themselves — formerly called "issues")
```

Default states on a new project: `Backlog`, `Todo`, `In Progress`, `Done`, `Cancelled`. The `group` field is fixed (5 values); the visible `name` is editable.

Work items have: `name` (required), `description_html`, `priority` (`none|low|medium|high|urgent`), `state` (state UUID), `labels` (array of label UUIDs), `assignees` (array of member UUIDs), `parent`, `start_date`, `target_date`, `sequence_id` (auto, used in URLs like `TT-42`), `is_draft`.

## Key endpoints

All paths below are relative to `https://api.plane.so/api/v1/workspaces/tt-reviews`. Set `P` to the project UUID.

```sh
export TOKEN="$PLANE_ACCESS_TOKEN"
export BASE="https://api.plane.so/api/v1/workspaces/tt-reviews"
export P="$PLANE_PROJECT_ID"   # TT Reviews project UUID, already in .env
```

### Projects

```sh
# List
curl -H "X-API-Key: $TOKEN" "$BASE/projects/"

# Create (minimum: name + identifier — identifier is the TT-### prefix, <= 5 chars, uppercase)
curl -X POST -H "X-API-Key: $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"TT Reviews","identifier":"TT"}' "$BASE/projects/"
```

### Work items

```sh
# List (paginated)
curl -H "X-API-Key: $TOKEN" "$BASE/projects/$P/work-items/?per_page=100"

# Create — only `name` is required; defaults to the project's default state (Backlog)
curl -X POST -H "X-API-Key: $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Wire Plane sync script","priority":"medium","labels":["<label-uuid>"]}' \
  "$BASE/projects/$P/work-items/"

# Get one
curl -H "X-API-Key: $TOKEN" "$BASE/projects/$P/work-items/<work-item-uuid>/"

# Update (PATCH — send only fields you want to change)
curl -X PATCH -H "X-API-Key: $TOKEN" -H "Content-Type: application/json" \
  -d '{"state":"<state-uuid>","priority":"high"}' \
  "$BASE/projects/$P/work-items/<work-item-uuid>/"

# Delete (returns 204)
curl -X DELETE -H "X-API-Key: $TOKEN" "$BASE/projects/$P/work-items/<work-item-uuid>/"
```

### States, labels, modules

```sh
curl -H "X-API-Key: $TOKEN" "$BASE/projects/$P/states/"
curl -H "X-API-Key: $TOKEN" "$BASE/projects/$P/labels/"
curl -H "X-API-Key: $TOKEN" "$BASE/projects/$P/modules/"
```

Creating a label:

```sh
curl -X POST -H "X-API-Key: $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"bug","color":"#e11d48"}' "$BASE/projects/$P/labels/"
```

### Query shaping

Two query params exist on most endpoints (per Plane's docs):

- `fields=id,name,priority` — trim response to only listed fields.
- `expand=state,labels,assignees` — inline related objects instead of just UUIDs.

Useful for listing views where we'd otherwise have to resolve state/label UUIDs client-side.

## Gotchas and unknowns

- **No OpenAPI spec** is served publicly, so schema discovery is by probing. Official reference: <https://developers.plane.so/api-reference/introduction>.
- **Search endpoint path is not `/work-items/search/`** — that 404s. If we need search, check the API reference page under "Search" / "Advanced Search" for the current path.
- **State `sequence` on POST is ignored** — Plane auto-assigns. To position a new state in the ordering, create it, then PATCH `sequence` to the value you want.
- **`POST /work-items/` with just `{name}` succeeds** and drops into the default state. Don't assume you need to look up state UUIDs first.
- **Work item IDs** are UUIDs in API responses, but the UI shows `TT-42`-style references built from `sequence_id` + the project's `identifier`. To resolve a user-facing `TT-42`, look up by `sequence_id` within the project.
- **Sequence IDs don't reclaim** — deleting TT-1 doesn't free the number; the next item is still TT-2.

## Next steps

Open:

- **Migrate backlog.** One-shot import of `todo/BUGS.md` + `todo/FEATURES.md` into Plane. Decide whether markdown stays the source of truth (with sync) or we cut over entirely. Worth a week of dogfooding before committing either way.
- **Add a `cancelled`-group state if we need it.** Currently the project has no "won't fix / abandoned" bucket — items we drop would just sit in Backlog or get deleted.

## Reference

- API introduction: <https://developers.plane.so/api-reference/introduction>
- Create work item spec: <https://developers.plane.so/api-reference/work-items/create-work-item>
- Self-hosted docs (if we ever move off cloud): <https://developers.plane.so/>
