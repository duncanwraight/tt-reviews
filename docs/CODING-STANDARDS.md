# Coding standards

Rules for all code under `app/` and `workers/`. CI + Husky hooks enforce the lintable subset (`no-explicit-any`, `no-console`, `no-floating-promises`, `react-hooks/*`); the rest is on you. For tech-stack rationale see `docs/DECISIONS.md`. For permission/interaction rules see `CLAUDE.md`.

## Mechanical enforcement

Each rule below has a matching enforcer that runs in `.github/workflows/main.yml`:

| Rule                                                                             | Enforcer                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `no-explicit-any`, `no-console`, `no-floating-promises`, `react-hooks/*`         | ESLint (`npm run lint`) — error-level, lint-staged runs `--fix` on commit |
| No RLS self-approval / `process.env` on server / admin action without CSRF gate  | `scripts/security-sweep.sh`                                               |
| No raw `console.*` / `Record<string, any[]>` generic-any casts                   | `scripts/quality-sweep.sh`                                                |
| Single source of truth for `SUBMISSION_TYPE_VALUES` (registry keys + DB `CHECK`) | `app/lib/submissions/__tests__/registry.test.ts`                          |
| No hard-coded compound submission-type literals in new files                     | `scripts/quality-sweep.sh` (allow-listed files in the script)             |
| Form-UX copy rules: no "(Optional)" in labels, edit-form placeholder shape       | `app/lib/submissions/__tests__/registry.test.ts`                          |
| Dead exports / unused deps                                                       | `npm run deadcode` (knip) — non-blocking CI warning                       |
| File length > 400 LOC under `app/lib/`, `app/routes/`                            | `scripts/quality-sweep.sh` — non-fatal report, prompt to split            |

## TypeScript

- Prefer `unknown` over `any` and narrow. If `any` is genuinely unavoidable, an `eslint-disable-next-line @typescript-eslint/no-explicit-any` is required.
- Always define an explicit `interface Props` for React components. No `React.FC`, no inline prop types.
- Use type guards for runtime checks — optional chaining can't narrow `unknown`:

  ```ts
  if (actionData && "success" in actionData && actionData.success) { ... }
  if (typeof value === "string") { ... }
  ```

  Optional chaining (`obj?.field`) is fine for UI state checks in JSX.

- When you add a value to a union or registry (e.g. `FieldType` in `app/lib/submissions/registry.ts`, `SubmissionType` in `app/lib/types.ts`), update **every** consumer — moderation, database, form rendering. Drift between unions and call sites is the most common bug class in this repo.

## Logging

```ts
import { Logger, createLogContext } from "~/lib/logger.server";

const ctx = createLogContext(requestId);
Logger.info("loader.equipment.fetched", { ...ctx, slug });
Logger.error("loader.equipment.failed", { ...ctx, slug }, err);
```

`Logger.error` is the only allowed `console.*` path; lint blocks the rest.

## Routes (React Router v7)

- File-based via `flatRoutes()`. Naming: `equipment.$slug.tsx`, `equipment._index.tsx`, `admin.player-submissions.tsx`. Dot = nested, `$foo` = dynamic, `_index` = layout's index.
- Child routes render in the parent's `<Outlet />`. Don't re-wrap `Navigation` / `PageLayout` in children.
- Specificity is automatic — `/equipment/submit` matches before `/equipment/:slug`.
- When deleting/renaming a route file, also delete the stale generated types under `.react-router/types/app/routes/+types/`.

### Loaders & actions

- Auth fail → `throw redirect("/login", { headers })`.
- 404 / structural error → `throw new Response("not found", { status: 404 })`.
- Validation error → `return data({ error, fieldErrors }, { status: 400 })`.
- Success → `return data({ success: true, message? }, headers)`.

## Components

- One component per file. PascalCase filename matches the export.
- Shared UI in `app/components/ui/`. Feature-specific in `app/components/<feature>/`.
- Compose from `PageLayout` (top-level) and `PageSection` (sections inside a route). Don't write inline JSX walls in route files — break into focused sub-components, single responsibility per component.

## Submission forms

`app/components/forms/UnifiedSubmissionForm.tsx` drives every `/submissions/<type>/submit` route. Per-type field configs live in `app/lib/submissions/registry.ts`. Keep the rules below consistent across types — registry-level tests in `app/lib/submissions/__tests__/registry.test.ts` enforce the copy ones; design rules are on you.

### Required vs optional

- **Required**: red asterisk after the label, rendered automatically when `field.required: true`. Don't add "(Required)" to the label.
- **Optional**: no marker. Don't add "(Optional)" to the label — the absence of the asterisk already conveys it.
- **Edit forms** (`equipment_edit`, `player_edit`): pre-fill all editable fields from the current row via a `preSelectionHandler` in `field-loaders.server.ts`; the submit action diffs submitted-vs-current and only writes changed fields into `edit_data`. Empty after pre-fill = explicit clear (encoded as `null`) on nullable columns. For columns that are `NOT NULL` on the underlying row (e.g. `players.name`, `equipment.name`), mark the form field `required: true` so the form-level validation prevents a clear from reaching the applier as a constraint violation. Don't use "Leave blank to keep current X" placeholders — pre-fill makes them unnecessary, and the copy would lie once a user manually clears a field.
  - For required selects, `FormField.tsx` suppresses the default `Select X` placeholder once a value is set so pre-filled selects don't show a vestigial "Select category" entry above the real options.

### Errors

- Field-level form errors render below the field in `FormField.tsx`. Image fields are the exception — they render their error inline via the `externalError` prop on `ImageUpload` so the form-level message doesn't stack against the file picker's own type/size error.
- Hidden-by-`dependencies` fields are skipped during `validateForm`. When a hidden field becomes visible and is `required: true`, the error surfaces inline next to it on the next submit attempt.

### Submit-button state

- **Public forms** (via `UnifiedSubmissionForm`): the submit button disables and the label switches to "Submitting…" while `RouterFormModalWrapper.isLoading` is true.
- **Admin moderation forms**: use `useNavigation()` from `react-router` and disable approve/reject buttons while `state !== "idle"`. Prevents a fast double-click from double-submitting.

### "No change" detection on edit forms

Edit-style submissions (`equipment_edit`, `player_edit`) reject empty edits server-side in `app/routes/submissions.$type.submit.tsx` — return 400 with `{ error: "No changes detected. Edit at least one field before submitting." }`. The server is the source of truth; don't gate at the client.

## Discord moderation cards

Every submission type's Discord card must carry enough context for a Discord-only moderator to decide on the submission without admin-UI access. Per-type formatters live in `app/lib/submissions/registry.ts` (`formatForDiscord`) and use the helpers in `app/lib/submissions/discord-format.ts`. Card shape canonicalised by tests in `app/lib/submissions/__tests__/registry.test.ts`.

### Canonical field order

1. **Subject identifier** — what's being submitted/changed. `Equipment` (name + manufacturer), `Player` (name), `Reviewer`, etc. Always first so the moderator's eye lands on the subject.
2. **Slug** — when the submission row has one, or it can be derived from a related row (e.g. the equipment being edited). Lets a Discord-only moderator construct the public URL without opening the admin queue. Use `createOptionalDiscordField` for absent slugs.
3. **Submitted by** — via `createSubmitterField`. Email or "Anonymous". Always present.
4. **Values OR diff** — pick the right shape for the type:
   - **New submissions** (equipment, player, video, review, player_equipment_setup): enumerated key/value fields for the submission's attributes, plus compound fields where appropriate (`createSpecificationsField` for equipment specs, per-rubber/blade fields for setups, top-3 video titles + "and N more" for video lists).
   - **Edit submissions** (equipment_edit, player_edit): a single `Changes` field listing `**field**: old → new` lines, computed by diffing `edit_data` against the current row. Order changes the way the registry orders the editable fields. If the diff would exceed 1024 chars, truncate to 1020 + `…`.
5. **Reason** — when the form captures one (`edit_reason` on edit forms). Surfaced as a separate field, not folded into the description, since moderators read it independently of the change set. Truncate to 1024 chars.

### Truncation rules

Discord's per-field value cap is 1024 chars. Use the helpers — don't hand-truncate:

- `createTruncatedTextField(name, text, maxLength = 200)` — defaults to 200 chars for short text fields (description, review body). Pass a higher `maxLength` for content that's expected to be longer (e.g. specs at 800).
- For edit-diff field values that aggregate multiple lines, hard-cap at 1020 + `…` so a wall of spec edits doesn't get rejected by Discord's API.

### Submit-handler enrichment

`formatForDiscord` is env-agnostic and pure — it can't fetch rows. Anything the formatter needs that isn't on the submission row (the player's name for a video submission, the country's flag emoji for a player submission, the current player row for a player_edit diff) gets fetched **once** in `app/lib/submissions/enrichment.server.ts` and merged into the notification payload before `discordService.notifySubmission` runs. New submission types that need extra context add an entry to that helper, not a new ad-hoc branch in `submissions.$type.submit.tsx`.

## Imports

Use the `~/` alias (configured in `tsconfig.cloudflare.json`):

```ts
import { Logger } from "~/lib/logger.server";
import { PageLayout } from "~/components/layout/PageLayout";
```

No relative walks above the current directory (`../../`).

## Env access

```ts
const env = context.cloudflare.env as unknown as Record<string, string>;
const url = env.SUPABASE_URL;
```

Cast inline at the call site. Never assume a variable exists — guard or default before use.

## Tests

- E2E: Playwright, `e2e/*.spec.ts`. Helpers in `e2e/utils/`.
- Unit: vitest, `__tests__/*.test.ts(x)` co-located with the code under test.
- Any change touching UI / routes / forms / submissions / admin queues / moderation / Discord interactions ships with a Playwright spec — see `docs/E2E.md`. No exceptions.
- Run `npm run test:e2e` before declaring a feature done.
- Tests must be runnable locally; don't gate on `process.env.CI`.

## Comments

- Code says **what**. Comments say **why** — and only when the why isn't obvious.
- JSDoc on exported helpers and non-trivial types.
- Don't leave commented-out blocks or `// TODO: remove once X` markers for work that's already done.

## See also

- `CLAUDE.md` — interaction rules, permission boundaries, commit-message style
- `docs/DECISIONS.md` — tech-stack rationale
- `docs/AUTH.md` — auth & RBAC patterns
- `docs/RLS.md` — RLS policy patterns
- `docs/E2E.md` — E2E test requirements
- `docs/OBSERVABILITY.md` — production logging
