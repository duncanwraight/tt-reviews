-- Fix RLS policies for player submission workflow
-- The issue is that when submitting equipment by name (not ID), we need to allow 
-- upsert operations and lookups during the submission process

-- Drop existing policies that might be too restrictive
DROP POLICY IF EXISTS "Allow public insert on players" ON players;
DROP POLICY IF EXISTS "Allow public insert on equipment" ON equipment;
DROP POLICY IF EXISTS "Allow public insert on player equipment setups" ON player_equipment_setups;

-- Recreate with better policies
-- Allow anyone to insert new players (they will be unverified until reviewed)
CREATE POLICY "Allow public insert players" ON players FOR INSERT WITH CHECK (true);

-- Allow anyone to insert new equipment (they will be unverified until reviewed)  
CREATE POLICY "Allow public insert equipment" ON equipment FOR INSERT WITH CHECK (true);

-- Allow anyone to insert player equipment setups (they will be unverified until reviewed)
CREATE POLICY "Allow public insert player_equipment_setups" ON player_equipment_setups FOR INSERT WITH CHECK (true);

-- Also ensure we can select equipment during the lookup process
-- (this might be needed when creating equipment relationships)
CREATE POLICY "Allow public select equipment for lookup" ON equipment FOR SELECT USING (true);

-- Allow public select on players for lookups during submission
CREATE POLICY "Allow public select players for lookup" ON players FOR SELECT USING (true);