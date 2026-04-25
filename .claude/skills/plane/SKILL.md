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
4. **Ask the user which item to work on.** Surface priority (`high` first), labels, parent/child markers (`[↳ TT-25]` means it's a sub-issue; `[parent: 2/3 done]` means it's a container), and any dependency hints from descriptions so the user can choose, but don't silently pick — the user drives selection. If they ask for a recommendation, give one and wait for confirmation. Don't propose a parent item itself as work — propose its open children.
5. Once the user confirms, move it to In Progress (`./scripts/plane.sh state TT-N "In Progress"`) and read the linked plan in `archive/<file>.md` before starting code changes. If the chosen item is a child, also read the parent's description — locked-in scoping decisions often live there.

## Typical workflow for a work item

Follow this loop per item. Don't skip steps; don't start the next item until the current one is merged and CI is green.

1. **Plan.** Read the Plane description and any linked `archive/<file>.md` section. Sketch the approach in the conversation (what files, what tests, what's out of scope). For non-trivial work, get user buy-in on the plan before writing code.
2. **Research online if needed** — only when external references genuinely help (e.g., writing a code-quality doc, checking a library's current API, resolving an ambiguous spec). Skip for well-scoped code changes where the repo already has the context.
3. **Write / update tests.** Every behavior change ships with tests. Run the full relevant suite (`npm run test`, `npm run test:e2e`, `npm run test:discord` as applicable) and make sure **all** tests pass — not just the new ones.
   - If an **unrelated** test fails, don't fix it inline and don't silently skip it. File a new Plane item (`./scripts/plane.sh new ...`) capturing the failure and a repro, mention it to the user, and keep the current item focused.
4. **Commit and push.** Follow the commit-message style in `CLAUDE.md` (`Fix:` / `Test:` / `Docs:` / etc., Co-Authored-By trailer). Ask before committing — code commits are destructive per `CLAUDE.md`.
5. **Wait for CI to pass** before moving on. Check with `gh run list --branch <branch> --limit 3` / `gh run watch`. If CI fails, fix on the same item — don't open the next one on top of a red build. Only after CI is green (and, where applicable, the PR is merged / deployed) move the item to Completed with `./scripts/plane.sh done TT-N`.
6. **Then** loop back to step 1 for the next item — re-invoke this skill so the board view and user selection happen fresh.

## While working

- **Move to In Progress the moment you pick up an item**, not after you've made progress. Reserves it and signals intent.
- If you hit a blocker (spec ambiguity, external dep, unreproducible): `./scripts/plane.sh state TT-N Blocked` and surface the blocker to the user.
- If you discover sub-work that isn't tracked, create it rather than silently expanding scope:
  ```sh
  ./scripts/plane.sh new "Short title" --priority high --label bug \
    --description "Context/repro/acceptance. Blank lines become paragraphs."
  ```
  For longer briefs, use `--description-file PATH`. Use a description whenever the title alone won't tell future-you what "done" looks like — acceptance criteria, repro steps, and links to the relevant code or archived plan section belong there.
- To enrich an existing item's description: `./scripts/plane.sh describe TT-N --description "..."` (or `--description-file`). For other fields (priority, labels, title, parent), use `./scripts/plane.sh update TT-N --priority high --add-label bug` etc. — see `plane.sh update --help`.
- Don't tack unrelated work onto an item. If you spot a second bug while fixing the first, file it as a new item. Same rule applies to failing tests that aren't caused by your change — new item, don't expand scope.

## Completing

- `./scripts/plane.sh done TT-N` only after the change is merged, CI is green, and (for code) the deploy workflow has applied. For non-code work, after it's actually delivered.
- Don't batch-close — close each item as it ships so the board stays accurate mid-stream.
- Don't start the next item until the current one is closed. One active item at a time keeps the board honest.
- If `done` prints a `hint: parent TT-N now has all M children complete …` line, surface it to the user and offer to close the parent in the same turn. Parents are container-only on this project (see below), so once their children all ship there is no further work to verify — just close them.

## Parent items and sub-issues

On this project, parents are **container-only**. They exist to group a set of children that ship together; they don't carry their own implementation work, verification steps, or follow-ups. Anything that needs doing should live in a child item, not in the parent's body.

What this means in practice:

- **Don't pick up a parent directly.** A parent's `In Progress` state is meaningless because there's nothing to implement on it. Pick up an open child instead.
- **Don't add residual work to a parent.** If you discover work the parent description implies but no child captures, file a new child (`./scripts/plane.sh new "..." --parent TT-N`) rather than expanding the parent's description into a to-do list.
- **Read the parent before starting a child.** Parents typically hold the locked-in scope decisions (URL shape, data model, out-of-scope list). Use `./scripts/plane.sh show TT-N` on the parent UUID printed in the child's `[↳ TT-N]` marker.
- **Close the parent the moment its last child is done.** `./scripts/plane.sh done TT-child` will print a hint when this happens; act on it the same turn — don't leave a 100%-complete parent open.
- **Use `./scripts/plane.sh children TT-N`** to see a parent's full set of sub-issues with states. If all are done it also tells you the parent is ready to close.

If you're tempted to write something on a parent that isn't "this is the umbrella for X, Y, Z" — stop and file a child instead.

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
