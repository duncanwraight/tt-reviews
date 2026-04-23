---
name: plane
description: Check the Plane board and start/continue/complete work items. Plane is the source of truth for planned work on this project — invoke when the user asks what's next, what's on the board, or says to pick up a work item. Also use at the end of a session to keep item states in sync with reality.
---

# Plane — board workflow

All board operations go through `./scripts/plane.sh`. Wrapper docs: `docs/PLANE.md`. The project is `TT Reviews` (identifier `TT`), already wired via `.env`.

## States and what they mean

- **Backlog** — not yet picked up.
- **In Progress** — someone is actively working on it _now_. Never leave an item here when you stop working.
- **Blocked** — picked up but stalled on something external (spec unclear, waiting on user input, flaky repro). Blocker reason goes in the next user-facing message.
- **Completed** — the change is merged / live. Don't close an item while a PR is still open or a migration hasn't applied.

## When invoked

1. Show what's in flight: `./scripts/plane.sh list --state "In Progress"`.
2. Show what's blocked: `./scripts/plane.sh list --state Blocked`.
3. Show the backlog, sorted the way the output already sorts (sequence): `./scripts/plane.sh list --state Backlog`.
4. Suggest a next item based on priority (`high` first), labels, and any dependency hints in the description. Don't just pick the top of the list — read descriptions for prerequisites.
5. If the user agrees, move it to In Progress (`./scripts/plane.sh state TT-N "In Progress"`) and read the linked plan in `archive/<file>.md` before starting code changes.

## While working

- **Move to In Progress the moment you pick up an item**, not after you've made progress. Reserves it and signals intent.
- If you hit a blocker (spec ambiguity, external dep, unreproducible): `./scripts/plane.sh state TT-N Blocked` and surface the blocker to the user.
- If you discover sub-work that isn't tracked, create it rather than silently expanding scope:
  ```sh
  ./scripts/plane.sh new "Short title" --priority high --label bug \
    --description "Context/repro/acceptance. Blank lines become paragraphs."
  ```
  For longer briefs, use `--description-file PATH`. Use a description whenever the title alone won't tell future-you what "done" looks like — acceptance criteria, repro steps, and links to the relevant code or archived plan section belong there.
- To enrich an existing item's description: `./scripts/plane.sh describe TT-N --description "..."` (or `--description-file`).
- Don't tack unrelated work onto an item. If you spot a second bug while fixing the first, file it as a new item.

## Completing

- `./scripts/plane.sh done TT-N` only after the change is merged and deployed (or, for non-code work, actually delivered).
- Don't batch-close — close each item as it ships so the board stays accurate mid-stream.

## End-of-session audit

Before ending any session where you touched a Plane item, run `./scripts/plane.sh list --state "In Progress"` and confirm:

- Items you finished are now **Completed**.
- Items you paused are **Blocked** (with the blocker stated in the user message so it's visible).
- Nothing is left **In Progress** that you're not actively working on.

If the list matches reality, say so explicitly ("In Progress is clean") rather than silently moving on. If it doesn't, fix it before ending.

## Archived plans

Work item descriptions link to `archive/SECURITY.md`, `archive/QUALITY.md`, `archive/DISCORD-HARDENING.md`, `archive/REFACTORS.md`. Those are the detailed plans — each Plane card is an entry point, not the full brief. Read the linked section before writing code.

## Gotchas

- Sequence IDs don't reclaim on delete. If TT-1 is deleted, the next item is still TT-2.
- `state` / `done` on an already-closed item is a no-op, not an error. Check the output.
- The wrapper resolves state names case-insensitively, so `state TT-5 "in progress"` works.
