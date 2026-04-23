# Security Hardening Plan

## Context

Audit (2026-04-23) turned up several live vulnerabilities, not just hardening gaps. Threat model: public-facing product with user submissions, admin moderation, Discord webhooks; Cloudflare Workers + Supabase (Postgres + RLS) + R2. Anon key is embedded in every page, so any RLS gap is directly exploitable from a browser console.

Top live issues at time of writing:

- CSRF tokens are signed with a hardcoded fallback in prod (`process.env.SESSION_SECRET` is always undefined on Workers).
- Two Discord endpoints take arbitrary unauthenticated input.
- Submission tables allow self-approval by any authenticated user.
- `equipment`, `players`, `player_equipment_setups` accept public INSERTs via the anon key.
- Stored XSS via JSON-LD and via a bypassable regex HTML sanitizer.

Goal: make each of these non-exploitable, and turn the classes of mistake that created them into mechanical checks.

## Guiding principles

- Each phase lands something useful on its own.
- Fix root cause (env wiring, RLS policy shape) over defense-in-depth patches.
- Every new policy or endpoint gate needs a pgTAP or Playwright test that would fail without it.
- Prefer platform primitives (Durable Objects, Cloudflare Rate Limiting, Supabase RLS) over hand-rolled in-memory state.

---

## Phase 1 — Kill unauthenticated Discord endpoints

**Status:** ✅ Shipped 2026-04-23 in commit `04c6e4c`. Prod smoke tests green.

**Resolution:** Both routes deleted outright. Nothing in-app called them via HTTP — submission routes use `DiscordService` directly, and the only authenticated Discord surface is `/api/discord/interactions` (Ed25519-signed). Confirmed with the user that no external bot forwards messages to this app, so `api.discord.messages` had no legitimate caller either.

**Steps:**

- ~~`app/routes/api.discord.messages.tsx`~~ — deleted. Generated types under `.react-router/types/app/routes/+types/api.discord.messages.ts` also removed.
- ~~`app/routes/api.discord.notify.tsx`~~ — deleted along with its generated types.
- CSRF exemption at `csrf.server.ts:228` left as-is — the `/api/discord/` prefix still correctly matches the surviving `/api/discord/interactions` route, which uses Ed25519 signatures instead of CSRF.
- E2E: `e2e/security-discord-endpoints.spec.ts` asserts both paths reject unauthenticated POSTs (404/405), guarding against re-introduction.

**Follow-up (out of scope for Phase 1):** these `DiscordService` methods are now unreachable from any route and can be cleaned up in a separate pass: `notifyNewReview`, `notifyNewPlayerEdit`, `notifyNewEquipmentSubmission`, `notifyNewPlayerSubmission`, `notifyReviewApproved`, `notifyReviewRejected`, `handlePrefixCommand` (plus their unit tests under `app/lib/discord/__tests__/` and `app/lib/__tests__/discord.test.ts`). Submissions use `notifySubmission` instead.

**Acceptance:**

- Both endpoints return a rejection without doing any work when called without a valid signature/secret. ✅ (404 — route removed)
- Spec covers both. ✅

---

## Phase 2 — CSRF actually works

**Status:** ✅ Shipped 2026-04-23 in commit `04c6e4c`. `SESSION_SECRET` rotated post-deploy via `wrangler secret put`. Prod smoke tests green.

**Resolution:** Rewired the whole CSRF module around `context.cloudflare.env.SESSION_SECRET` and expanded coverage to every admin route with a state-changing action. Signing moved from naive `sha256(payload + key)` to HMAC-SHA256 with a constant-time (`timingSafeEqual`) signature compare.

**Steps:**

- `app/lib/csrf.server.ts` — rewritten. `process.env.SESSION_SECRET` reference is gone. Secret is an explicit parameter to `generateCSRFToken`, `validateCSRFToken`, `validateCSRFFromRequest`. New `getSessionSecret(env)` helper throws loudly if `SESSION_SECRET` is missing or shorter than 16 chars — no silent fallback.
- `app/lib/security.server.ts` — added `issueCSRFToken(request, context, userId)` wrapper so route loaders don't each have to resolve secret + sessionId. `validateCSRF` now takes `context` and resolves the secret internally.
- Session-id fallback at `csrf.server.ts:142-151` replaced. `getSessionId` now hashes the concatenated `sb-*-auth-token(.N)?` Supabase auth cookies; if none are present, it returns `null` and callers fail closed. The old `sha256(IP+UA)` collision surface is gone.
- `validateCSRF` wired into the four previously-unprotected admin routes: `admin.content.tsx`, `admin.categories.tsx`, `admin.equipment-reviews.tsx`, `admin.import.tsx`. All their forms (raw `<Form>`, `useSubmit`, `useFetcher.Form`) now carry `_csrf`.
- `ContentManager` and `CategoryManager` take a `csrfToken` prop and emit `<input name="_csrf">` in every form; `useSubmit` call sites in `ContentManager` append `_csrf` to FormData before submit.
- Unit tests: `app/lib/__tests__/csrf.server.test.ts` — 27 tests covering roundtrip, tampered signature, swapped userId, wrong session, wrong secret, expired token, Supabase-cookie session-id derivation (single & split chunks, ordering, no-auth-cookie null, no-IP/UA fallback), `validateCSRFFromRequest` integration, and `requiresCSRFProtection` exemptions.
- Playwright: `e2e/security-csrf.spec.ts` — as-admin POST with no `_csrf` → 403; as-admin POST with tampered `_csrf` → 403. Positive-path regression is covered by the existing `admin-approves-review.spec.ts` (valid CSRF roundtrip).
- Env wiring: `env.d.ts` declares `SESSION_SECRET`; `.dev.vars.example` includes an entry with generation instructions.

**Follow-up spotted (out of scope for Phase 2):** `RejectionModal` emits form fields `submissionId` / `action` / `category` / `reason`, but `admin.equipment-reviews.tsx`'s action reads `reviewId` / `intent` / `rejectionCategory` / `rejectionReason`. The reject button on equipment reviews has been silently broken (hits the action's `default: throw Response("Invalid action", {status: 400})`). CSRF is now wired correctly on both halves — fixing the field-name mismatch is a separate bug ticket.

**Acceptance:**

- `grep process.env.SESSION_SECRET app/` returns zero hits. ✅
- Every admin route's action calls `validateCSRF`. ✅ (10/10 state-changing admin routes; `admin._index.tsx` is loader-only.)
- Forgery spec fails without the fix applied (confirmed by mutating token → 403 returned by `createCSRFFailureResponse`). ✅
- Unit + e2e all green; 286 unit / 10 e2e. ✅

**Manual / operational record (2026-04-23):**

- [x] Confirmed `SESSION_SECRET` was already a Cloudflare secret via `npx wrangler secret list` before the deploy.
- [x] Rotated post-push with `openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET`. Pre-deploy tokens had been signed with the public fallback string and were trivially forgeable — rotation guaranteed they stopped validating on the first cold-start of the new Worker.
- [x] Deploy succeeded (GHA run 24826415846). Boot-time `getSessionSecret` check did not trip, which is itself confirmation the secret resolved.
- [x] Prod smoke tests (the CI-run Playwright suite against the prod URL post-promote) passed. Any admin sessions opened before the rotation would see CSRF failures on their first form POST and need to reload — but the user is the only admin, so no user-visible impact.

---

## Phase 3 — Close RLS lockdown on submission + core tables

**Status:** ✅ Shipped 2026-04-23 in commit `0ed5475`. CI green (Checks + Deploy). Migrations auto-applied to prod via the deploy workflow.

**Resolution:** Two migrations. The first rewires the four submission tables to mirror `player_equipment_setup_submissions` (admin-only UPDATE/SELECT/DELETE via `auth.jwt() ->> 'user_role'`). The second drops every `WITH CHECK (true)` / `USING (true)` write policy on `players`, `equipment`, `player_equipment_setups`, `player_sponsorships`, and `player_footage`. Every app-side write to those tables goes through `createSupabaseAdminClient` (service-role, bypasses RLS), so no legitimate path broke. The `verified` audit is handled implicitly — once anon INSERT/UPDATE is gone, only the server moderation code can set `verified=true`.

**Steps:**

- `supabase/migrations/20260423100000_lock_submission_self_approve.sql` — drops `FOR UPDATE USING (auth.uid() IS NOT NULL)` on `equipment_submissions`, `player_edits`, `player_submissions`, `video_submissions`; adds admin-only SELECT + UPDATE (`USING` and `WITH CHECK`) + DELETE policies on each.
- `supabase/migrations/20260423100100_lock_core_table_writes.sql` — drops the anon INSERT policies from `20250609220200` + `20250610195700` **and** the anon UPDATE policies from `20250609220300` (not originally scoped in the plan but same class of bug — `USING (true)` let anyone with the anon key rewrite any row). Covers `players`, `equipment`, `player_equipment_setups`, `player_sponsorships`, `player_footage`. Public SELECT policies kept (equipment/players browsing + submission-form lookups need them).
- Audit recorded: every `.from("players" | "equipment" | "player_equipment_setups").insert/update` in `app/` is behind `createSupabaseAdminClient`. Sites checked: `admin.equipment-submissions.tsx`, `admin.player-submissions.tsx`, `admin.player-edits.tsx`, `admin.player-equipment-setups.tsx`, `admin.import.tsx`, `submissions.$type.submit.tsx`, `api.discord.interactions.tsx` (via `discord.server.ts` → `createSupabaseAdminClient`).
- Trigger `update_submission_status` (latest `20260101120000`) only UPDATEs submission tables and runs inside the service-role transaction, so the lockdown does not affect moderation propagation.
- pgTAP: seven new files in `supabase/tests/` — one per user-writable table. Each asserts anon denied INSERT (via `throws_ok '42501'`), anon denied UPDATE (persistence check), authenticated user denied cross-user UPDATE, authenticated user denied self-approval (for submission tables), admin UPDATE persists. The `player_equipment_setups` file also asserts a regular user cannot flip `verified=false → true`.
- Fixed pre-existing flake in `rls.sql` test 4: the "admin sees all submissions" assertion used `count(*)` across the whole table, which fails on a non-clean DB. Scoped to the seeded id.
- CI: existing `RLS tests (pgTAP)` step in `.github/workflows/main.yml:123` runs `supabase test db` and picks up all `supabase/tests/*.sql` automatically. No workflow change needed.

**Acceptance:**

- `supabase test db` covers every user-writable table. ✅ (8 files, 39 tests, all green locally and in CI.)
- Repro in a browser console using the anon key returns a policy violation for each of the above operations. ✅ (pgTAP asserts the equivalent at the SQL layer via `SET LOCAL ROLE anon` + JWT-less session.)
- Adding a new migration that flips RLS off or loosens a policy is caught by the new tests. ✅ (anon-INSERT / self-approve assertions would fail immediately; Phase 10 will add a CI grep for the `auth.uid() IS NOT NULL` anti-pattern in new migrations.)

**Follow-up spotted (out of scope for Phase 3):** `equipment_reviews` has `FOR UPDATE USING (auth.uid() = user_id AND status = 'pending')` with no explicit `WITH CHECK`. Postgres defaults WITH CHECK to the USING expression for UPDATE, so a user attempting to flip their own review to `status='approved'` is rejected (the new row no longer satisfies `status = 'pending'`). Safe as-is, but worth pinning with a pgTAP test in a later sweep so an explicit `WITH CHECK` addition (or removal) can't regress it silently.

---

## Phase 4 — Stored XSS fixes

**Status:** Not Started.

**Goal:** Two independent stored-XSS paths from review content to DOM.

**Steps:**

- **JSON-LD escape.** `app/lib/schema.server.ts:226/288` serialises user content via `JSON.stringify` then dumps it into `<script type="application/ld+json">` in `app/components/seo/StructuredData.tsx:20` via `dangerouslySetInnerHTML`. `JSON.stringify` does not escape `</script>`. Replace with the standard pattern: `JSON.stringify(value).replace(/</g, "\\u003c")`. Add a unit test with a `</script>` payload.
- **Sanitizer replacement.** `app/lib/sanitize.tsx:41-71` is a regex list that fails on nested tags, unclosed attributes, SVG animation, and HTML entities. Replace with a parser (e.g. `isomorphic-dompurify` or render to text and drop the `review` HTML profile entirely). Keep the `profile="plain"` path as-is — it's already safe.
- Audit every `dangerouslySetInnerHTML` call site. Expected callers: `SafeHtml` (sanitized) and structured-data (now escaped). Anything else should be deleted or justified in a comment.
- Tighten CSP — remove `'unsafe-inline'` and `'unsafe-eval'` from the script-src directive in `app/lib/security.server.ts:116`. Move inline event handlers to listeners, use nonces for legitimate inline scripts. This depends on Phase 5 so the CSP actually applies in prod.
- E2E spec: submit a review with `</script><img src=x onerror>` content, assert no script executes and the escaped text renders.

**Acceptance:**

- Payloads from common XSS cheatsheets render as text on the equipment-review page.
- Lighthouse / `csp-evaluator` report no `'unsafe-*'` on script-src.
- E2E spec would fail if the sanitizer or escape were reverted.

---

## Phase 5 — Fix environment detection

**Status:** Not Started.

**Goal:** Two modules assume `process.env.NODE_ENV === "production"`. On Workers that's always `undefined`, so prod runs in dev mode — looser CSP, no HSTS, verbose errors.

**Steps:**

- `app/lib/security.server.ts:107` and `app/lib/env.server.ts:47` — stop reading `process.env`. Pass `context.cloudflare.env.ENVIRONMENT` (or `ENV`) through from the Worker entry. Default to the stricter branch when the var is missing.
- Confirm `wrangler.toml` sets `ENVIRONMENT = "production"` for the prod deploy and `"development"` locally. Check preview deploys (from Phase 4 of RELIABILITY.md) — they should run in prod mode.
- `app/lib/env.server.ts:29` — remove the baked-in fallback anon key. If `SUPABASE_ANON_KEY` is missing, fail closed.
- Unit test: a request where `ENVIRONMENT` is unset gets the strict CSP and HSTS headers.

**Acceptance:**

- Prod response headers include `Strict-Transport-Security` and the tightened CSP.
- No test in the suite relies on `process.env.NODE_ENV`.

---

## Phase 6 — Upload & storage hardening

**Status:** Not Started.

**Goal:** R2 reads and writes currently trust path and MIME from the client.

**Steps:**

- `app/routes/api.images.$.tsx:19` — `env.IMAGE_BUCKET.get(splat)` has no prefix constraint. Restrict to `equipment/` and `player/` prefixes and reject `..`.
- `app/lib/image-upload.server.ts` / `app/lib/r2-native.server.ts:39-47`:
  - Validate by magic bytes (read the first 8–12 bytes) in addition to the MIME header, which is browser-supplied.
  - Whitelist extensions (`jpg`, `jpeg`, `png`, `webp`); reject the rest.
  - Enforce a max file size server-side (currently only client-side, if at all).
  - Normalise filenames before appending to the key — strip path separators, null bytes, unicode control chars.
- Ensure `httpMetadata.contentType` stored on upload comes from the validated type, not the client header.

**Acceptance:**

- Upload of a `.svg` renamed to `.jpg` with `Content-Type: image/jpeg` is rejected at the action.
- GET to `/api/images/../../something` returns 400.
- E2E spec covers the happy path and one malicious attempt.

---

## Phase 7 — Input validation at submission boundary

**Status:** Not Started.

**Goal:** `app/routes/submissions.$type.submit.tsx:373-381` writes form fields via the service-role client (bypassing RLS) with no length, type, or URL validation. The sanitizer in Phase 4 handles rendering, but storage-layer limits are independent.

**Steps:**

- Define per-field constraints in `app/lib/submissions/registry.ts` (it already carries the field registry): `maxLength`, `type: "url" | "year" | "text" | …`, `pattern`.
- Add a server-side validator that runs before the insert in `submissions.$type.submit.tsx:188-218`. Reject oversized or malformed fields with a 400.
- URL fields (`source_url`, etc.) — require `https://`, reject `javascript:`, `data:`, and local IPs (prevents SSRF from later enrichers).
- Add a DB-side length cap via `CHECK (length(col) <= N)` on the largest text columns as belt-and-braces.
- Unit tests in `app/lib/submissions/__tests__/` for each field type.

**Acceptance:**

- A submission with a 1 MB `review_text` is rejected at the action.
- A submission with `source_url = "javascript:alert(1)"` is rejected.
- Tests cover each field type's boundary.

---

## Phase 8 — Real rate limiting on Workers

**Status:** Not Started.

**Goal:** `app/lib/security.server.ts:20` is an in-memory `Map`. Workers isolates don't share memory across requests in any reliable way, so the rate limiter effectively does nothing.

**Steps:**

- Replace with Cloudflare's native Rate Limiting binding (`[[unsafe.bindings]]` or the newer `ratelimit` binding) for IP-scoped limits on login, submission, and admin-action endpoints.
- Use the defined limits in `RATE_LIMITS` (`security.server.ts:94`) as the budget — they're currently dead config.
- Wire login rate-limiting through a server-action shim so it's actually enforced (today `login.tsx:75` calls Supabase directly from the browser; consider also setting project-level limits in the Supabase dashboard).
- For submission endpoints, scope by `user.id` for authenticated users and IP for anon.
- Playwright spec: 20 rapid submission attempts get blocked.

**Acceptance:**

- Rate limiting is enforced across Worker isolates (verified by hitting the endpoint from two regions or parallel connections).
- Spec fails without the binding.

---

## Phase 9 — Auth hardening (auto-promote, session flows)

**Status:** Not Started.

**Goal:** A couple of smaller auth-layer issues worth closing.

**Steps:**

- `app/lib/auto-promote.server.ts` promotes any user whose email is in `ADMIN_EMAILS` at login time. Confirm Supabase email verification is required in the project config — otherwise sign-up with someone's email then clicking the unverified link grants admin. Add a boot-time check that verification is on, or skip auto-promote for unverified users.
- Login redirect chain — audit `login.tsx`, `auth.callback.tsx`, `reset-password.tsx` for any `redirect(url)` where `url` is attacker-influenced. Restrict to a same-origin allowlist.
- Ensure session cookies have `Secure`, `HttpOnly`, `SameSite=Lax` (or `Strict` for admin routes). Check `app/lib/auth.server.ts`.
- Ensure `moderator_approvals.moderator_id` audit trail can't be forged — the column is written from the server-side user record, not the request body.

**Acceptance:**

- An unverified signup with `ADMIN_EMAILS`-matching email does not gain admin on first login.
- Session cookies have the correct flags on production response headers.

---

## Phase 10 — Mechanical enforcement

**Status:** Not Started.

**Goal:** Turn the classes of mistake in Phases 1–9 into checks that fail loudly when a future change re-introduces them. This is the "hook layer" equivalent from RELIABILITY.md Phase 2.

**Steps:**

- CI grep (add to `checks` job): fail if a new migration contains `FOR UPDATE USING (auth.uid() IS NOT NULL)` or `WITH CHECK (true)` without an explicit `// security: reviewed` comment.
- CI grep: fail if `app/` contains `process.env.` (hint: always broken on Workers).
- CI grep: fail if a new route action under `app/routes/admin.*.tsx` doesn't reference `validateCSRF`.
- Require a pgTAP test file per user-writable table; fail the build if a migration creates a new table without a matching test addition.
- Add `npm audit --audit-level=high` to the `checks` job; block on high/critical.
- Pin GitHub Actions to commit SHAs (current major-pin policy is fine for functional safety but not for supply-chain — revisit if/when audit frequency warrants).
- Add a `SECURITY.md` stub at repo root pointing at the vulnerability-disclosure process (even if it's just "email me").

**Acceptance:**

- A PR that loosens RLS or adds a CSRF-free admin action fails CI.
- A new submission table without its test is blocked.
- Dependency audits run on every push.

---

## Phase dependencies

- Phase 1 and Phase 2 are independent; both small, do first.
- Phase 3 is independent but benefits from Phase 10's grep checks landing alongside.
- Phase 4 depends on Phase 5 for CSP tightening to actually apply in prod.
- Phase 6 is independent.
- Phase 7 reuses the Phase 3 registry changes.
- Phase 8 is independent but needs account-level Cloudflare config.
- Phase 9 is independent.
- Phase 10 should land incrementally as each earlier phase closes — a check per class of fix.

Recommended order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10**, with Phase 10 checks landing alongside the phase they enforce.
