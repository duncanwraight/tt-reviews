-- Add RLS policies for updates
-- Allow anyone to update players (updates will be reviewed)
CREATE POLICY "Allow public update on players" ON players FOR UPDATE USING (true);

-- Allow anyone to update equipment
CREATE POLICY "Allow public update on equipment" ON equipment FOR UPDATE USING (true);

-- Allow anyone to update player equipment setups  
CREATE POLICY "Allow public update on player equipment setups" ON player_equipment_setups FOR UPDATE USING (true);