-- Add RLS policies for player and equipment submissions
-- Allow anyone to insert new players (they will be reviewed)
CREATE POLICY "Allow public insert on players" ON players FOR INSERT WITH CHECK (true);

-- Allow anyone to insert new equipment (they will be reviewed)  
CREATE POLICY "Allow public insert on equipment" ON equipment FOR INSERT WITH CHECK (true);

-- Allow anyone to insert player equipment setups (they will be unverified until reviewed)
CREATE POLICY "Allow public insert on player equipment setups" ON player_equipment_setups FOR INSERT WITH CHECK (true);

-- Allow anyone to insert player sponsorships
CREATE POLICY "Allow public insert on player sponsorships" ON player_sponsorships FOR INSERT WITH CHECK (true);

-- Allow anyone to insert player footage
CREATE POLICY "Allow public insert on player footage" ON player_footage FOR INSERT WITH CHECK (true);