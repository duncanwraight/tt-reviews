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
- **Edit forms** (`player_edit`, `equipment_edit`) where the user is editing pre-filled data: text/textarea fields use `placeholder: "Leave blank to keep current X"` so empty unambiguously means "keep current value". Selects don't need this — `FormField.tsx` suppresses the default `Select X` placeholder once a required select has a pre-filled value.

### Errors

- Field-level form errors render below the field in `FormField.tsx`. Image fields are the exception — they render their error inline via the `externalError` prop on `ImageUpload` so the form-level message doesn't stack against the file picker's own type/size error.
- Hidden-by-`dependencies` fields are skipped during `validateForm`. When a hidden field becomes visible and is `required: true`, the error surfaces inline next to it on the next submit attempt.

### Submit-button state

- **Public forms** (via `UnifiedSubmissionForm`): the submit button disables and the label switches to "Submitting…" while `RouterFormModalWrapper.isLoading` is true.
- **Admin moderation forms**: use `useNavigation()` from `react-router` and disable approve/reject buttons while `state !== "idle"`. Prevents a fast double-click from double-submitting.

### "No change" detection on edit forms

Edit-style submissions (`equipment_edit`, `player_edit`) reject empty edits server-side in `app/routes/submissions.$type.submit.tsx` — return 400 with `{ error: "No changes detected. Edit at least one field before submitting." }`. The server is the source of truth; don't gate at the client.

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
