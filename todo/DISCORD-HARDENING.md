# Discord moderation hardening & dev-environment separation

## Context

Surfaced while verifying Phase 1 of `todo/SECURITY.md` (kill unauthenticated Discord endpoints, 2026-04-23). A local-dev review submission produced a moderation embed in the shared Discord channel; clicking "Approve" sent the interaction to the **prod** `/api/discord/interactions` URL — because Discord only allows one Interactions Endpoint URL per application, and it's registered against `tabletennis.reviews`.

The prod click tried to approve a review ID that only exists in local Supabase. Two consequences:

1. **Audit pollution**: `moderator_approvals.submission_id` has no FK to the review tables (polymorphic reference, see `20250614000000_enhanced_moderation.sql:21`), so the INSERT succeeded in prod — an orphan approval row now references a review that doesn't exist in prod.
2. **Misleading UX**: the ephemeral bot reply said "Review received first approval" even though no real review was ever touched. `getSubmissionStatus` returned null for the missing row and the response text fell through to the default.

Impact ceiling is bounded — an attacker with Discord approver role still can't promote a review that doesn't exist, since the status-flip trigger keys off actual submission rows. But the audit trail is muddied and every dev click leaks a row into prod.

## Sub-problem A — Harden the interactions handler

**Status:** Not Started.

**Goal:** Reject Discord button clicks for submission IDs that don't exist in the target environment. Make both the DB and the handler refuse to create orphan audit rows.

**Steps:**

- In `app/lib/discord/moderation.ts` (each `approve*` / `reject*` handler), look up the submission before recording the approval. If the row is missing, return an ephemeral `❌ Submission not found — this click may have come from a different environment` and skip the insert.
- OR (preferred, belt-and-braces) add a trigger on `moderator_approvals` that validates `(submission_type, submission_id)` points at a real row per the per-type table map. Rejection at the DB level means any future code path that forgets the check still can't pollute.
- Consider tightening `moderator_approvals` with a CHECK or trigger-enforced existence constraint — full FK is hard because of the polymorphic column, but a trigger can do the equivalent.
- Update `app/lib/discord/__tests__/moderation.test.ts` (or create one if absent) with a "submission not found → ephemeral error, no row written" case.
- Extend pgTAP once Phase 3 of SECURITY.md lands: `INSERT INTO moderator_approvals (…non-existent submission_id…)` must fail.

**Acceptance:**

- A Discord click for an unknown submission ID returns an ephemeral error and writes nothing.
- Backfilled test in `moderation.test.ts` + pgTAP assertion.

## Sub-problem B — Clean up existing orphans

**Status:** Not Started.

**Goal:** Remove orphan rows from prod's `moderator_approvals`. Use the audit queries in this doc's "Investigation queries" section to scope the blast radius first.

**Steps:**

- Run query #3 from the investigation section against prod to list orphans across every submission type. If the count is small (<50) and unambiguous, delete them in a one-off migration with `DELETE FROM moderator_approvals WHERE ...` gated on the LEFT JOIN returning NULL.
- If the count is large or spans a long time range, investigate whether any were real approvals against rows that were later hard-deleted (rare — rejections normally soft-delete via status, not row removal).
- Add the Sub-problem A trigger in the same migration so the cleanup is permanent.

**Acceptance:**

- Prod `moderator_approvals` has zero rows whose `submission_id` doesn't resolve in its typed table.
- Migration is idempotent (re-running the trigger add is a no-op).

## Sub-problem C — Dev Discord isolation

**Status:** Not Started.

**Goal:** Stop local-dev Discord round-trips from hitting prod. Today, local dev posts notifications into the shared moderation channel via the shared bot token, and clicking buttons there routes to prod.

**Steps:**

- Create a second Discord application in the Discord Developer Portal, dev-only. New bot token, new public key, new guild/channel for moderation testing (an invite-only test server or a private channel in the existing guild).
- Register the dev app's Interactions Endpoint URL as an ngrok/cloudflared tunnel pointing at `tt-reviews.local:5173/api/discord/interactions`. Cloudflared Tunnels are free and don't need an account for quick runs.
- Replace the local `.dev.vars` Discord block (`DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_GUILD_ID`, `DISCORD_ALLOWED_ROLES`) with the dev-app values. Update `.dev.vars.example` so other developers copy the dev-app shape, not the prod shape.
- Document the tunnel workflow in `docs/DISCORD.md` — how to start cloudflared, how to re-register the URL if the tunnel hostname changes.
- Once dev is isolated, delete any orphan prod rows from dev testing (overlaps with Sub-problem B).

**Acceptance:**

- Submitting a review in local dev posts to the dev Discord channel, not the prod one.
- Clicking approve in the dev channel flips the *local* review status.
- Prod Discord + prod DB see no traffic from local development.

## Investigation queries

Run these against **prod** Supabase to scope the pollution.

```sql
-- 1. A specific orphan (substitute the review ID you're chasing)
SELECT id, submission_type, submission_id, source, action,
       discord_moderator_id, moderator_id, created_at
FROM moderator_approvals
WHERE submission_id = '82ab1692-89f9-431a-89bc-f0a4d8f73a7d';

-- 2. All orphan review approvals
SELECT ma.id, ma.submission_id, ma.source, ma.action, ma.created_at
FROM moderator_approvals ma
LEFT JOIN equipment_reviews er ON er.id = ma.submission_id
WHERE ma.submission_type = 'review' AND er.id IS NULL
ORDER BY ma.created_at DESC;

-- 3. Orphans across every submission type
SELECT 'review'                  AS typ, ma.id, ma.submission_id, ma.source, ma.created_at
FROM moderator_approvals ma LEFT JOIN equipment_reviews    er ON er.id = ma.submission_id
WHERE ma.submission_type = 'review' AND er.id IS NULL
UNION ALL
SELECT 'equipment',              ma.id, ma.submission_id, ma.source, ma.created_at
FROM moderator_approvals ma LEFT JOIN equipment_submissions es ON es.id = ma.submission_id
WHERE ma.submission_type = 'equipment' AND es.id IS NULL
UNION ALL
SELECT 'player',                 ma.id, ma.submission_id, ma.source, ma.created_at
FROM moderator_approvals ma LEFT JOIN player_submissions   ps ON ps.id = ma.submission_id
WHERE ma.submission_type = 'player' AND ps.id IS NULL
UNION ALL
SELECT 'player_edit',            ma.id, ma.submission_id, ma.source, ma.created_at
FROM moderator_approvals ma LEFT JOIN player_edits         pe ON pe.id = ma.submission_id
WHERE ma.submission_type = 'player_edit' AND pe.id IS NULL
UNION ALL
SELECT 'video',                  ma.id, ma.submission_id, ma.source, ma.created_at
FROM moderator_approvals ma LEFT JOIN video_submissions    vs ON vs.id = ma.submission_id
WHERE ma.submission_type = 'video' AND vs.id IS NULL
UNION ALL
SELECT 'player_equipment_setup', ma.id, ma.submission_id, ma.source, ma.created_at
FROM moderator_approvals ma LEFT JOIN player_equipment_setup_submissions pess ON pess.id = ma.submission_id
WHERE ma.submission_type = 'player_equipment_setup' AND pess.id IS NULL
ORDER BY created_at DESC;

-- 4. Confirm no FK exists (expected: zero rows)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.moderator_approvals'::regclass AND contype = 'f';
```

## Findings (2026-04-23)

- **Query #1** — orphan from the Phase 1 verification click confirmed: `moderator_approvals.id = b2f2b9c2-5b78-4e47-b114-564fdc98cd02`, `submission_type=review`, `submission_id=82ab1692-89f9-431a-89bc-f0a4d8f73a7d`, `source=discord`, `discord_moderator_id=1c766443-6aee-4222-8066-800341afa535`, `created_at=2026-04-23 08:22:08Z`.
- **Query #2** — two orphan review approvals total: the row above plus `id=015de34c-6865-47e7-9da4-d8fde139b0ac` / `submission_id=5139feaa-0e9b-4c40-a9fa-648ea865736b` / `created_at=2026-04-22 21:07Z`. Both via `source=discord` — so both originated from dev testing leaking into the prod Discord channel.
- **Query #3** — zero orphans for `equipment`, `player`, `player_edit`, `video`, `player_equipment_setup`. Review is the only polluted type.
- **Query #4** — confirmed: FKs exist on `moderator_id` → `auth.users(id)` and `discord_moderator_id` → `discord_moderators(id)`. No FK on `submission_id` (polymorphic column), which is the gap that lets orphans in.

**Sub-problem B cleanup** is therefore a small DELETE — just these two IDs. Suggested wording for the migration, to be run after Sub-problem A's trigger is in place:

```sql
DELETE FROM moderator_approvals
WHERE id IN (
  'b2f2b9c2-5b78-4e47-b114-564fdc98cd02',
  '015de34c-6865-47e7-9da4-d8fde139b0ac'
);
```

Or safer — re-run the LEFT JOIN so it stays correct if a new orphan sneaks in between now and the migration:

```sql
DELETE FROM moderator_approvals ma
WHERE ma.submission_type = 'review'
  AND NOT EXISTS (SELECT 1 FROM equipment_reviews er WHERE er.id = ma.submission_id);
```

## Relation to SECURITY.md

- Sub-problem A (handler hardening) belongs alongside SECURITY.md Phase 9 ("Auth hardening"), which already calls out the need to protect `moderator_approvals` integrity. Land it there if Phase 9 runs before this doc's cleanup.
- Sub-problem C (dev isolation) is pure dev ergonomics and isn't security-critical, but it's the prerequisite for safely exercising Phase 9's acceptance tests locally.
