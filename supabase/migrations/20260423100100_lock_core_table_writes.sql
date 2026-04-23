-- SECURITY.md Phase 3, part 2: lock down anon writes to core tables.
--
-- Migrations 20250609220200 / 20250610195700 / 20250609220300 collectively
-- granted anon INSERT and UPDATE on players, equipment,
-- player_equipment_setups, player_sponsorships, and player_footage. With
-- the anon key embedded in every page, anyone could add or rewrite rows
-- from a browser console (including setting player_equipment_setups.verified
-- = true, bypassing moderation).
--
-- Drop every WITH CHECK (true) / USING (true) write policy on these tables.
-- All legitimate writes in this codebase go through the service-role client
-- in app/lib/database/client.ts (createSupabaseAdminClient), which bypasses
-- RLS — verified for admin.equipment-submissions, admin.player-submissions,
-- admin.player-edits, admin.player-equipment-setups, admin.import,
-- api.discord.interactions, and submissions.$type.submit.
--
-- The public SELECT policies from 20250610195700 are kept: anon needs to
-- read equipment/players for browsing and submission-form lookups.

-- ---------------------------------------------------------------------
-- Anon INSERT (from 20250609220200 and 20250610195700)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public insert on players" ON players;
DROP POLICY IF EXISTS "Allow public insert on equipment" ON equipment;
DROP POLICY IF EXISTS "Allow public insert on player equipment setups" ON player_equipment_setups;
DROP POLICY IF EXISTS "Allow public insert on player sponsorships" ON player_sponsorships;
DROP POLICY IF EXISTS "Allow public insert on player footage" ON player_footage;

DROP POLICY IF EXISTS "Allow public insert players" ON players;
DROP POLICY IF EXISTS "Allow public insert equipment" ON equipment;
DROP POLICY IF EXISTS "Allow public insert player_equipment_setups" ON player_equipment_setups;

-- ---------------------------------------------------------------------
-- Anon UPDATE (from 20250609220300)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public update on players" ON players;
DROP POLICY IF EXISTS "Allow public update on equipment" ON equipment;
DROP POLICY IF EXISTS "Allow public update on player equipment setups" ON player_equipment_setups;

-- ---------------------------------------------------------------------
-- The duplicate "Allow public select equipment for lookup" and "Allow
-- public select players for lookup" policies from 20250610195700 are
-- redundant with the broader public-read policies from the initial
-- schema (20250608181927). Drop them to keep the policy list clean;
-- the initial-schema policies remain in force.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public select equipment for lookup" ON equipment;
DROP POLICY IF EXISTS "Allow public select players for lookup" ON players;
