# E2E Test Requirements

Playwright is the pipeline's safety net for UI and integration bugs. Referenced from `CLAUDE.md`.

## The rule

Any new feature — or any change that touches UI, routes, forms, submission flows, admin queues, moderation, or Discord interactions — must be accompanied by a Playwright spec that covers it end-to-end. **The test is part of the feature, not a follow-up.**

## Non-negotiables

1. **Write or update the spec alongside the code.** A feature that lands without a passing test is not done. If the feature's primary value is UI behaviour, the test must drive the UI (clicks, fills, assertions against rendered content), not just poke the database.
2. **Run `npm run test:e2e` before declaring the task complete** and include the result in the task summary. CI will block the deploy on failure, but find out locally so iteration is fast.
3. **If the test fails because of a real bug, fix the bug — do not paper over it in the test.** "Workarounds to get green" are forbidden. The whole point is that tests surface what's broken.
4. **Keep the full suite under ~60 seconds.** If a new spec pushes past that, look for a faster seeding path (service-role REST insert instead of multi-page UI setup) before accepting the slowdown.

## Where things live

- Specs: `e2e/` and `e2e-smoke/` (smoke runs against deployed URLs; see `e2e-smoke/README.md`).
- Playwright config: `playwright.config.ts` — chromium only, `reuseExistingServer: !CI`, readiness probe at `/e2e-health`.

### Reusable helpers

- `e2e/utils/auth.ts` — `createUser`, `deleteUser`, `setUserRole("admin"|"moderator"|"user")`, `login`, `logout`, `generateTestEmail`, `TEST_PASSWORD`.
- `e2e/utils/data.ts` — `getFirstEquipment`, `insertPendingEquipmentReview`, `getEquipmentReviewStatus`.
- `e2e/utils/discord.ts` — `signDiscordRequest`, `buildButtonInteraction` (Ed25519 signing for `/api/discord/interactions`).
- `e2e/utils/supabase.ts` — demo `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus `adminHeaders()` for bespoke REST fetches.

### Specs to copy the pattern from

- `e2e/anon-browse.spec.ts` — anon reads.
- `e2e/user-submits-review.spec.ts` — auth'd form submission.
- `e2e/admin-approves-review.spec.ts` — admin UI click + public visibility in a fresh anon context.
- `e2e/discord-approve-review.spec.ts` — signed API POST.

## Authoring rules

- Use `getByRole` / `getByLabel` with exact or anchored regex matches (`/^Review\*?$/` rather than `"Review"`, since required fields render their label as `"Label*"`).
- Seeding is best done via service-role REST (cheap, deterministic). Driving the feature under test must go through the real UI.
- Always put cleanup in `finally`: delete any users created, delete any rows inserted that don't cascade.
- `moderator_approvals.moderator_id` has no `ON DELETE CASCADE` — `deleteUser` clears approvals first, but keep that in mind if you add new approval-touching helpers.
- JWT `user_role` only updates at login. After `setUserRole`, re-login.
- Generate unique emails per test (`generateTestEmail("prefix")`) so parallel runs don't collide.
