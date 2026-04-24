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

**Status:** ✅ Shipped 2026-04-23 across commits `9c450b5` (main work), `98dcd5e` + `17da434` (CI fallout). CSP tightening deferred to Phase 5 as originally planned.

**Resolution:** Both stored-XSS paths closed. `sanitize.tsx` now wraps `sanitize-html` (htmlparser2-backed) with a narrow allowlist per profile (`p`/`br`/`b`/`i`/`strong`/`em`[/`u`], zero attributes). JSON-LD serialisation in `schema.ts` and the inlined globalSchemas in `root.tsx` now escape every `<` to `<` so a review body containing `</script>…` cannot break out of the `<script type="application/ld+json">` block. Route-level `meta` JSON-LD moved to the `<StructuredData />` component on 4 routes because React Router's meta serializer still does not escape `<` in 7.14.2.

**Steps:**

- ✅ **JSON-LD escape.** `schema.ts:288-291` (`toJsonLd`) and `schema.ts:386-389` (`generateMultipleSchemas`) both apply `.replace(/</g, "\\u003c")`. `root.tsx`'s inlined `globalSchemas` uses the same escape. Unit tests in `app/lib/__tests__/schema.test.ts` cover a `</script>` payload round-trip.
- ✅ **Sanitizer replacement.** `sanitize.tsx` rewritten around `sanitize-html` 2.17.3 + `@types/sanitize-html` 2.16.1. Regex list gone. `sanitize.tsx` slimmed to `SafeHtml` + `sanitizeReviewText` + `sanitizeAdminContent`. `app/lib/__tests__/sanitize.test.tsx` adds 28 tests including a 14-payload mXSS corpus (OWASP / PortSwigger / Sonar): svg/style, math/mglyph, noscript, foreignObject/annotation-xml, iframe srcdoc, nonTextTags entity bypass, zero-padded char refs, etc. All neutralised by the narrow allowlist.
- ✅ `dangerouslySetInnerHTML` audit complete. Three sanctioned call sites: `root.tsx:92` (escaped globalSchemas), `components/seo/StructuredData.tsx:20` (escaped jsonLd), `lib/sanitize.tsx:71` (sanitize-html output in `SafeHtml`). No others in the tree.
- ❌ CSP tightening deferred. `security.server.ts:123` still emits `'unsafe-inline' 'unsafe-eval'` on script-src. Moved to Phase 5 per the original dep note — strict CSP can't apply in prod until the `process.env.NODE_ENV` / `ENVIRONMENT` detection is fixed, otherwise Workers always falls through to the dev branch.
- ✅ E2E: `e2e/security-xss.spec.ts` submits a review body with a stored XSS payload, approves it, and asserts no dialog fires, no `window.__xss` gets set, the DOM contains no `img`/`svg`/`on*=`, and every JSON-LD block's textContent has no `</script`.

**Collateral shipped in the same push (per user guidance "always make the correct code fix"):**

- `react-router` 7.6.2 → 7.14.2 (+ matching `@react-router/dev/fs-routes/node`, `@testing-library/dom` added as an explicit peer). `future.unstable_viteEnvironmentApi` renamed to `v8_viteEnvironmentApi` per stabilisation.
- `app/lib/date.ts` — new hydration-stable `formatDate` / `formatDateLong` helpers. 13 call sites (PlayerCard, 6 admin routes, ContentManager) previously called `toLocaleDateString()` with no locale, producing `01/01/2026` on Workers (en-GB default) vs `1/1/2026` in the browser — a hydration mismatch that was silently breaking homepage link handlers.

**CI fallout (fixed in follow-up commits):**

- `98dcd5e` — The Phase 4 change made `<StructuredData />` (a client-reachable component) import `~/lib/schema.server`. Under RR 7.14.2's tightened server-only module enforcement, the build fails with `commonjs--resolver: Server-only module referenced by client`. Nothing in the schema module was actually server-only, so renamed `schema.server.ts` → `schema.ts` and updated the 6 imports.
- `17da434` — Once `schema.ts` started loading in the browser, `process.env.SITE_URL` in the constructor threw `ReferenceError: process is not defined` at module init. React Router's client-side route module fetch silently fell back to a full reload at `/`, breaking homepage → `/equipment` navigation (caught by `e2e/anon-browse.spec.ts`). Dropped the `process.env` read; the fallback URL is the production host anyway. Phase 5 will thread `context.cloudflare.env` through the rest of the `process.env` reads across the codebase.

**Acceptance:**

- Stored XSS payloads from common cheatsheets render as text on the equipment-review page. ✅ (`security-xss.spec.ts` + the mXSS corpus in `sanitize.test.tsx`.)
- Lighthouse / `csp-evaluator` report no `'unsafe-*'` on script-src. ❌ Deferred to Phase 5 — `'unsafe-inline' 'unsafe-eval'` still live at `security.server.ts:123`.
- E2E spec would fail if the sanitizer or escape were reverted. ✅ (`security-xss.spec.ts` asserts no dialog, no `window.__xss`, DOM-level absence of `img`/`svg`/`on*=`, and JSON-LD textContent-level absence of `</script`.)

**Follow-up spotted (out of scope for Phase 4):** the `process.env` removal in `schema.ts` is a single point fix; `security.server.ts` and `env.server.ts` still read `process.env.NODE_ENV` / `ENVIRONMENT` and are the actual subject of Phase 5. Nothing else surfaced in this pass.

---

## Phase 5 — Fix environment detection

**Status:** ✅ Shipped 2026-04-23 in commit `0650340` (TT-14).

**Resolution:** `process.env` reads eliminated from server-side code paths in favour of `context.cloudflare.env.ENVIRONMENT` threaded from the Worker entry. `isDevelopment(context)` now fails closed to the strict/prod branch when `ENVIRONMENT` is unset. Strict CSP + HSTS headers are emitted on prod responses; `createSecureResponse`, `addSecurityHeaders`, and `addApiSecurityHeaders` all take an explicit `isDevelopment` boolean. A CI grep (`scripts/security-sweep.sh`, Phase 10 / TT-19) now rejects any new `process.env.X` read in `*.server.ts` / `*.server.tsx` outside the vitest fallback in `env.server.ts`.

**Acceptance:**

- Prod response headers include `Strict-Transport-Security` and the tightened CSP. ✅
- No test in the suite relies on `process.env.NODE_ENV`. ✅

---

## Phase 6 — Upload & storage hardening

**Status:** ✅ Shipped 2026-04-23 in commit `4a95724` (TT-15).

**Resolution:** Upload validation rewritten around magic-byte detection of the first 12 bytes, matched against JPEG/PNG/WebP signatures. `file.type` (browser-supplied) is no longer trusted — the validated MIME is what ends up in `httpMetadata.contentType`, and the extension stored in the key comes from the detected type, not `file.name`. Reader now guards keys against non-allowlisted prefixes, `..`, null bytes, and absolute paths before touching R2.

**Steps:**

- ✅ `app/routes/api.images.$.tsx` — calls new `isValidImageKey(splat)` before `IMAGE_BUCKET.get`; bad keys return 400. `..` inside URL paths is collapsed client-side so the check is defense-in-depth; the reader also rejects URL-encoded `%2E%2E`, keys outside `equipment/` + `player/`, absolute paths, and null bytes.
- ✅ `app/lib/r2-native.server.ts` — `validateImageFile` is now async and reads the first 12 bytes. Returns `{ valid, detectedType, extension, error? }`. `generateImageKey(category, id, extension)` takes the validated extension and sanitises the id segment. `uploadImageToR2Native(bucket, key, file, contentType, metadata)` takes an explicit validated `contentType` and writes that to `httpMetadata.contentType`. `customMetadata.originalName` is also sanitised.
- ✅ 10MB size cap and empty-file reject enforced in `validateImageFile` — reached on both call sites (`handleImageUploadNative` and `submissions.$type.submit.tsx`) before any R2 put.
- ✅ `app/routes/submissions.$type.submit.tsx` — migrated to the async signature + (extension, contentType) parameters.

**Tests:**

- `app/lib/__tests__/r2-native.server.test.ts` — 20 cases covering: JPEG/PNG/WebP magic-byte accept, SVG-disguised-as-JPEG rejected, oversize/empty/too-small rejected, content-type-mismatch accepted if magic matches (filename extension ignored), filename traversal stripped from key id, stored `httpMetadata.contentType` is the validated one, `customMetadata.originalName` sanitised. `isValidImageKey` tests: allowed prefixes, path traversal (`..`, `..\`), absolute paths, null bytes, empty string, unlisted prefixes.
- `e2e/security-uploads.spec.ts` — 3 probes: bad prefix → 400, URL-encoded traversal inside a valid prefix → 400, well-formed absent key → 404.

**Acceptance:**

- Upload of a `.svg` renamed to `.jpg` with `Content-Type: image/jpeg` is rejected at the action. ✅ (`r2-native.server.test.ts` integration case; no object reaches R2.)
- GET to `/api/images/<bad prefix>` returns 400. ✅ (e2e spec; `../` path is client-normalised so isn't reachable over HTTP — unit test covers the defense anyway.)
- E2E spec covers happy path and a malicious attempt. ✅ (happy path is existing `user-submits-review.spec.ts` which uses the upload pipeline; malicious attempts pinned in `security-uploads.spec.ts`.)

---

## Phase 7 — Input validation at submission boundary

**Status:** ✅ Shipped 2026-04-23 (TT-16).

**Resolution:** Added a dedicated validator in `app/lib/submissions/validate.server.ts`. It carries per-(type, field) constraints (length, UUID, enum, integer/decimal range, URL) and runs before the service-role insert in `submissions.$type.submit.tsx`. URL fields reject `javascript:`, `data:`, non-`https://`, and private/loopback/link-local addresses (SSRF guard). DB-side `CHECK (length(col) <= N)` constraints on the widest text/JSONB columns give belt-and-braces protection if a future code path ever writes to the submission tables without calling the validator.

**Steps:**

- ✅ New module `app/lib/submissions/validate.server.ts`. Exports `validateSubmission(type, formData)` returning `{ valid, errors? }`. Constraint map keyed per submission type covers: text (maxLength), URL (with scheme + private-host rejection), UUID (regex), integer/decimal ranges, enum sets, and JSON payload length. `validateUrl` is exported as a reusable helper.
- ✅ `submissions.$type.submit.tsx` calls the validator before the insert. Review submissions stitch `equipment_id` from the URL into the FormData first so the required-field check passes for legit requests. 400 response returns `fieldErrors: Record<field, message>` so the client can surface per-field issues.
- ✅ Migration `20260423120000_submission_length_caps.sql` — `CHECK (length(col) <= N)` on `equipment_reviews.review_text` (5000), `equipment.specifications` + `equipment_submissions.specifications` (10000 of JSONB text), `player_edits.edit_data` (10000), `player_equipment_setups.source_url` + `player_equipment_setup_submissions.source_url` (2048), `player_footage.url` (2048), `video_submissions.videos` (30000 JSONB text), and `moderator_notes` (2000) across all submission tables.
- ✅ pgTAP `supabase/tests/submission_length_caps.sql` — 6 assertions: oversize review_text / edit_data / source_url (two tables) / videos JSON all raise `23514` (check_violation); a within-limit review row still writes cleanly.

**Tests:**

- `app/lib/submissions/__tests__/validate.server.test.ts` — 24 cases: well-formed review accepted, oversize review_text rejected, non-UUID FK rejected, out-of-enum `playing_level` / `experience_duration` / `active` rejected, `overall_rating` out-of-range / non-numeric rejected, missing-required fields flagged. For `player_equipment_setup`: accepts https URL; rejects `javascript:` / `data:` / plain http / loopback / RFC1918 / link-local (169.254) / `.local` / IPv6 loopback. URL over 2048 chars rejected. Year outside 1900-2100 rejected, non-integer year rejected. `player_edit` and `equipment` length caps tested. `validateUrl` helper tested directly.
- Full unit suite: 383 passed (2 pre-existing `discord.test.ts` flakes, tracked as TT-23). E2E: 14/14 — including `user-submits-review.spec.ts` which runs the whole submission pipeline through the new validator.

**Acceptance:**

- A submission with a 1 MB `review_text` is rejected at the action. ✅ (unit + DB CHECK both enforce the 5000 cap.)
- A submission with `source_url = "javascript:alert(1)"` is rejected. ✅ (unit test).
- Tests cover each field type's boundary. ✅ (unit test per field kind + pgTAP for DB caps.)

---

## Phase 8 — Real rate limiting on Workers

**Status:** ✅ Shipped 2026-04-23 (TT-17).

**Resolution:** Added two Cloudflare Rate Limiting bindings (`[[unsafe.bindings]]`) — `FORM_RATE_LIMITER` (5/60s, fronts the submission endpoint) and `DISCORD_RATE_LIMITER` (20/10s, fronts `/api/discord/interactions`). `rateLimit()` now prefers the binding and only falls back to the in-memory Map when the binding is missing (tests, CI without wrangler). Budgets in `RATE_LIMITS` mirror the binding limits so the fallback stays in sync. The Map was also the origin of the "dead config" note on `RATE_LIMITS` — the API_STRICT/API_MODERATE/LOGIN entries remain intentionally not wired to bindings; see below.

**Steps:**

- ✅ `wrangler.toml` — added `[[unsafe.bindings]]` blocks for `FORM_RATE_LIMITER` and `DISCORD_RATE_LIMITER`, mirrored under `[env.dev]`. namespace_ids are scoped per Worker. `npm run cf-typegen` regenerated `worker-configuration.d.ts` with the `RateLimit` bindings on `Cloudflare.Env`.
- ✅ `app/lib/security.server.ts` — `RateLimitConfig.binding` names which CF binding fronts the budget. `rateLimit()` resolves `context.cloudflare.env[bindingName]` and calls `.limit({ key })`; if the binding throws or is absent, falls back to the Map. `RATE_LIMITS.FORM_SUBMISSION` + `RATE_LIMITS.DISCORD_WEBHOOK` now carry the binding name via `as const satisfies Record<string, RateLimitConfig>`.
- ✅ `api.discord.interactions.tsx` passed `context` to `rateLimit` correctly at the time of this phase.
- 🐛 `submissions.$type.submit.tsx` did **not** pass `context` — both call sites silently fell through to the in-memory Map in prod, negating the binding. Caught and fixed in TT-24 (see §Phase 11); the `rateLimit` signature is now `(request, config, context)` with `context` non-optional so any new caller is a TS error until wired correctly.
- ⚠️ **Login rate limiting** — intentionally deferred. `login.tsx` uses `createBrowserClient` to call `supabase.auth.signInWithPassword` directly from the browser; there's no route action to gate. Adding one would require restructuring auth to run through a server action, which is out of scope for this phase. Supabase's project-level rate limits already protect the auth endpoints (configurable in the Supabase dashboard).
- ✅ **Admin-action rate limiting** — shipped in TT-24 (see §Phase 11).

**Tests:**

- `app/lib/__tests__/security.server.test.ts` — 5 new cases: `rateLimit` calls `env.FORM_RATE_LIMITER.limit` when the binding is present, returns `success:false` when the binding denies, falls back to the Map when no binding is present (exhausts the 5/60s budget at the 6th call), falls back if the binding throws, and routes to the correct binding (FORM vs DISCORD) by config.
- `e2e/security-rate-limit.spec.ts` — Playwright burst: 10 rapid POSTs to `/submissions/review/submit` from a single `cf-connecting-ip` (spoofed per-test to avoid polluting the shared bucket used by other e2e tests) must include at least one 429. The spec exercises the in-memory fallback since the CF binding isn't available under Vite/dev.
- Full suites: 388 unit passed (2 pre-existing `discord.test.ts` flakes, TT-23), 15/15 e2e including `user-submits-review.spec.ts` (verified no rate-limit bucket leaks).

**Acceptance:**

- Rate limiting is enforced across Worker isolates. ✅ (CF binding in prod; in-memory fallback for dev only.)
- Spec fails without the binding (or its fallback). ✅ (e2e asserts blocked count > 0; unit test asserts binding delegation path is correct.)

---

## Phase 9 — Auth hardening (auto-promote, session flows)

**Status:** ✅ Shipped 2026-04-23 (TT-18).

**Resolution:**

- **Auto-promote guard.** `checkAndPromoteAdmin` now takes `emailConfirmed` and exits early when false. `getUserWithRole` derives the flag from `user.email_confirmed_at` via Supabase's `auth.getUser()` response and refuses to promote an unverified admin. Without this, an attacker could sign up with an email matching `AUTO_ADMIN_EMAILS`, never click the confirmation link, and be promoted on their first authenticated request (the session cookie is enough for `auth.getUser()` to return the user row).
- **Redirect audit.** Swept every `redirect()` / `throw redirect()` call under `app/routes/` and `app/lib/`. Every target is a hardcoded literal path — no attacker-influenced URL is ever passed through. No open-redirect surface. The `handleForgotPassword` flow in `login.tsx` passes `${window.location.origin}/reset-password` to Supabase, which is browser-origin-derived and safe.
- **Moderator audit-trail.** Every insert into `moderator_approvals` passes a `moderatorId` sourced either from `user.id` (server-decoded JWT in admin routes) or from the signature-verified Discord interaction payload (`discordModeratorId` in `app/lib/discord/moderation.ts`). No call site reads the field from a request body, form field, or URL parameter. `grep "formData.get.*moderator\|body.moderator\|params.moderator" app/` returns zero hits — pinned as a regression guard in the test suite.
- **Cookie-flag hardening.** `getServerClient` now wraps Supabase's `setAll` through a `hardenCookieOptions` pass that fills in `httpOnly: true`, `sameSite: "lax"`, `secure: true` (off in dev so local HTTP cookies still set), and `path: "/"` whenever the SDK's options are missing them. Belt-and-braces against a future SDK regression or a different cookie source ever being threaded through this path.

**Tests:**

- `app/lib/__tests__/auto-promote.server.test.ts` — 4 cases: refuses when `emailConfirmed: false`, refuses when email not in allowlist, refuses when allowlist is empty, happy-path matches case-insensitively.
- `app/lib/__tests__/supabase.server.test.ts` — 6 cases: fills in all 4 safe flags on empty options, handles undefined, forces `secure: false` in development, preserves explicit stricter `sameSite`, preserves explicit non-root path, honours explicit `httpOnly: false` (so the fallback doesn't override caller intent).
- Full suites: 398 unit passed (2 pre-existing `discord.test.ts` flakes, TT-23), 15/15 e2e including `user-submits-review.spec.ts` which exercises the full auth/cookie flow.

**Deferred (not Phase 9 scope):**

- Login rate-limiting — handled by Supabase's project-level rate limits; app-side login is client-side via `createBrowserClient` with no server action to gate. Noted in Phase 8 resolution.
- A boot-time check that Supabase's email-confirmation setting is enabled — would require the Supabase Admin API and still wouldn't be meaningful if an operator changes the setting post-deploy. The `emailConfirmed` guard above is the primary defence; operators enabling confirmation-off in Supabase bypass it intentionally.

**Acceptance:**

- An unverified signup with `AUTO_ADMIN_EMAILS`-matching email does not gain admin on first login. ✅ (unit test).
- Session cookies have the correct flags on production response headers. ✅ (`hardenCookieOptions` tests — forces `HttpOnly; Secure; SameSite=Lax; Path=/` by default).

---

## Phase 10 — Mechanical enforcement

**Status:** ✅ Shipped 2026-04-23 (TT-19).

**Resolution:**

- `scripts/security-sweep.sh` packages the three grep checks in one runnable script, locally and from CI:
  - **RLS self-approval** — flags `FOR UPDATE USING (auth.uid() IS NOT NULL)` in migrations dated 2026-04-23 onwards. Older migrations included the pattern and were later dropped by `20260423100000_lock_submission_self_approve.sql` / `20260423100100_lock_core_table_writes.sql`; excluding them by date avoids rewriting audit history.
  - **Write-true policies** — flags `CREATE/ALTER POLICY ... FOR INSERT/UPDATE/DELETE ... WITH CHECK (true)` in the same date window. Public SELECT with `USING (true)` is legitimate (equipment/player browsing) so the grep is narrowed to write ops. A `-- security: reviewed` line sentinel admits the rare intentional open policy.
  - **process.env on server** — flags `process.env.X` reads in any `*.server.ts` / `*.server.tsx` file except `app/lib/env.server.ts` (the vitest fallback). Comments are skipped so file-level docstrings describing the old pattern don't trip it.
  - **Admin CSRF coverage** — every `app/routes/admin.*.tsx` with an exported action must reference `validateCSRF`. `admin.tsx` (layout) and `admin._index.tsx` (loader-only) are exempt.
- `npm audit --audit-level=high` added as a separate CI step. Current state: 7 moderate findings, 0 high/critical; gate passes.
- `SECURITY.md` at repo root points at `duncan@wraight-consulting.co.uk` for disclosure + links to `archive/SECURITY.md` for the internal plan.

**Collateral fix shipped in the same push:** `app/lib/sitemap.server.ts` previously fell through to `process.env.SITE_URL` in its module-level singleton — always undefined on Workers, so prod/dev quietly used the production host as a default. Refactored to a `getSitemapService(context)` factory that pulls `SITE_URL` via `getEnvVar(context, "SITE_URL")`, matching the Phase 5 (TT-14) env-access pattern. The new grep would have caught this if it had been running earlier.

**Deferred / not implemented:**

- **pgTAP per-table enforcement** — already covered structurally: all 7 user-writable tables have `rls_<table>.sql` files. A future CI grep could require that any new `CREATE TABLE ... ENABLE ROW LEVEL SECURITY` is accompanied by a new `rls_*.sql`, but that's a lower-priority follow-up.
- **Pinning GitHub Actions to commit SHAs** — the current major-pin policy is fine for functional safety; SHA pinning is supply-chain hardening that's a separate workstream.

**Acceptance:**

- A PR that loosens RLS or adds a CSRF-free admin action fails CI. ✅ (`security-sweep.sh` flags both classes).
- Dependency audits run on every push. ✅ (`npm audit --audit-level=high` gate).
- Root `SECURITY.md` exists with a disclosure process. ✅

---

## Phase 11 — Admin rate limiting + FORM binding wiring

**Status:** ✅ Shipped 2026-04-24 (TT-24).

**Resolution:**

- New CF rate-limit binding `ADMIN_RATE_LIMITER` (30/60s) declared in `wrangler.toml` for both the root env and `[env.dev]`. `RATE_LIMITS.ADMIN_ACTION` in `security.server.ts` mirrors the budget for the in-memory fallback.
- New `enforceAdminActionGate(request, context, userId)` helper in `security.server.ts` bundles `validateCSRF` + per-admin `rateLimit`. The rate-limit key is `admin:${userId}`, not client IP — rotating IPs can't bypass the cap on a compromised admin cred. CSRF failure short-circuits before the rate-limit check so a forged request never consumes the admin's budget.
- All 9 admin routes with a state-changing action (`admin.content`, `admin.categories`, `admin.equipment-reviews`, `admin.equipment-submissions`, `admin.import`, `admin.player-edits`, `admin.player-equipment-setups`, `admin.player-submissions`, `admin.video-submissions`) replaced their inline CSRF block with a single `enforceAdminActionGate` call.
- The Phase 10 admin-gate CI grep (`scripts/security-sweep.sh` check 3) was widened from `validateCSRF` to `validateCSRF|enforceAdminActionGate`.

**Collateral fix shipped in the same push (latent Phase 8 bug):**

- `rateLimit`'s `context` parameter was previously typed `any` and optional. `submissions.$type.submit.tsx` omitted it at both call sites, so `FORM_RATE_LIMITER` was never consulted in prod and every submission fell through to the per-isolate in-memory Map — exactly the failure mode Phase 8 claimed was fixed. `rateLimit` is now typed `(request, config, context: AppLoadContext)` with `context` non-optional, and both call sites in the submission route now pass it. Any new caller that forgets `context` is a TS error before it ships.

**Tests:**

- `app/lib/__tests__/security.server.test.ts` — 3 new cases: binding routing expanded to include ADMIN vs FORM vs DISCORD; `enforceAdminActionGate` keys on `admin:${userId}`; returns 429 when the admin binding denies. 19 total.
- `e2e/security-admin-rate-limit.spec.ts` — burst of 35 authed admin POSTs with a valid CSRF token to `/admin/equipment-reviews` must include at least one 429. Exercises the in-memory fallback since the CF binding is unavailable under Vite dev.

**Acceptance:**

- 31st admin action in a 60-second window returns 429. ✅
- `rateLimit` cannot be called without `context` — catch at compile time. ✅
- FORM_SUBMISSION POSTs now actually hit `FORM_RATE_LIMITER` in prod. ✅ (fix to `submissions.$type.submit.tsx` call sites).

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
