-- Seed data for TT Reviews database

-- Insert equipment (blades)
INSERT INTO equipment (name, slug, category, manufacturer, specifications) VALUES
('Butterfly Timo Boll ALC', 'butterfly-timo-boll-alc', 'blade', 'Butterfly', 
 '{"plies": 5, "material": "Arylate Carbon", "weight": "85g", "thickness": "5.9mm", "speed": 9.5, "control": 8.8}'),
('TSP Curl P-1R', 'tsp-curl-p1-r', 'blade', 'TSP', 
 '{"plies": 5, "material": "Wood", "weight": "84g", "thickness": "5.7mm", "speed": 8.5, "control": 9.2}'),
('Stiga Carbonado 145', 'stiga-carbonado-145', 'blade', 'Stiga', 
 '{"plies": 5, "material": "Carbon", "weight": "87g", "thickness": "5.9mm", "speed": 9.7, "control": 8.5}'),
('Yasaka Ma Lin Extra Offensive', 'yasaka-ma-lin-extra-offensive', 'blade', 'Yasaka', 
 '{"plies": 5, "material": "Wood", "weight": "88g", "thickness": "6.1mm", "speed": 9.0, "control": 8.5}'),
('XIOM Vega X', 'xiom-vega-x', 'blade', 'XIOM', 
 '{"plies": 7, "material": "Carbon", "weight": "89g", "thickness": "6.2mm", "speed": 9.8, "control": 8.0}');

-- Insert equipment (rubbers)
INSERT INTO equipment (name, slug, category, subcategory, manufacturer, specifications) VALUES
('Butterfly Tenergy 64', 'butterfly-tenergy-64', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "High Tension", "sponge": "Spring Sponge", "speed": 9.5, "spin": 9.8, "control": 8.5, "hardness": "36-38"}'),
('Yasaka Mark V', 'yasaka-mark-v', 'rubber', 'inverted', 'Yasaka', 
 '{"topsheet": "Natural", "sponge": "Medium", "speed": 8.0, "spin": 8.5, "control": 9.5, "hardness": "40-42"}'),
('DHS Hurricane 3', 'dhs-hurricane-3', 'rubber', 'inverted', 'DHS', 
 '{"topsheet": "Tacky", "sponge": "Hard", "speed": 8.5, "spin": 9.7, "control": 8.0, "hardness": "39-41"}'),
('XIOM Vega Pro', 'xiom-vega-pro', 'rubber', 'inverted', 'XIOM', 
 '{"topsheet": "Tensor", "sponge": "Elastic", "speed": 9.0, "spin": 9.2, "control": 8.8, "hardness": "47.5"}'),
('Tibhar Grass D.TecS', 'tibhar-grass-dtecs', 'rubber', 'long_pips', 'Tibhar', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.0, "spin": 9.5, "control": 9.0, "hardness": "35"}');

-- Insert players
INSERT INTO players (name, slug, highest_rating, active_years, active) VALUES
('Ma Long', 'ma-long', '3750', '2009-2023', true),
('Fan Zhendong', 'fan-zhendong', '3800', '2012-present', true),
('Timo Boll', 'timo-boll', '3300', '1998-present', true),
('Xu Xin', 'xu-xin', '3500', '2008-2023', false),
('Dimitrij Ovtcharov', 'dimitrij-ovtcharov', '3200', '2007-present', true),
('Lin Gaoyuan', 'lin-gaoyuan', '3400', '2014-present', true),
('Tomokazu Harimoto', 'tomokazu-harimoto', '3300', '2017-present', true),
('Hugo Calderano', 'hugo-calderano', '3150', '2015-present', true);

-- Get IDs for equipment setups (we'll use these in the next inserts)
-- Note: In a real seed script, you'd typically handle this differently, but for simplicity we'll use subqueries

-- Insert player equipment setups
INSERT INTO player_equipment_setups (player_id, year, blade_id, forehand_rubber_id, forehand_thickness, forehand_color, backhand_rubber_id, backhand_thickness, backhand_color, source_type, verified) VALUES
-- Ma Long setups
((SELECT id FROM players WHERE slug = 'ma-long'), 2024, 
 (SELECT id FROM equipment WHERE slug = 'butterfly-timo-boll-alc'),
 (SELECT id FROM equipment WHERE slug = 'dhs-hurricane-3'), '2.15mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-64'), '2.1mm', 'black',
 'tournament_footage', true),
 
-- Fan Zhendong setups
((SELECT id FROM players WHERE slug = 'fan-zhendong'), 2024,
 (SELECT id FROM equipment WHERE slug = 'stiga-carbonado-145'),
 (SELECT id FROM equipment WHERE slug = 'dhs-hurricane-3'), '2.15mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-64'), '2.1mm', 'black',
 'official_website', true),

-- Timo Boll setups  
((SELECT id FROM players WHERE slug = 'timo-boll'), 2024,
 (SELECT id FROM equipment WHERE slug = 'butterfly-timo-boll-alc'),
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-64'), '2.1mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-64'), '2.1mm', 'black',
 'official_website', true),

-- Xu Xin setups (backhand long pips)
((SELECT id FROM players WHERE slug = 'xu-xin'), 2023,
 (SELECT id FROM equipment WHERE slug = 'yasaka-ma-lin-extra-offensive'),
 (SELECT id FROM equipment WHERE slug = 'dhs-hurricane-3'), '2.2mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'tibhar-grass-dtecs'), '1.0mm', 'black',
 'tournament_footage', true),

-- Dimitrij Ovtcharov setups
((SELECT id FROM players WHERE slug = 'dimitrij-ovtcharov'), 2024,
 (SELECT id FROM equipment WHERE slug = 'butterfly-timo-boll-alc'),
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-64'), '2.1mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-64'), '2.1mm', 'black',
 'interview', true);

-- Insert sample equipment reviews (we'll need actual user IDs, but for now we'll create some dummy ones)
-- Note: In production, these would be real authenticated users

-- Create some test users first (these would normally be created through auth)
-- We'll skip this for now as it requires actual Supabase auth setup

-- Insert player sponsorships
INSERT INTO player_sponsorships (player_id, sponsor_name, start_year, end_year) VALUES
((SELECT id FROM players WHERE slug = 'ma-long'), 'Butterfly', 2009, NULL),
((SELECT id FROM players WHERE slug = 'fan-zhendong'), 'Stiga', 2018, NULL),
((SELECT id FROM players WHERE slug = 'timo-boll'), 'Butterfly', 2000, NULL),
((SELECT id FROM players WHERE slug = 'xu-xin'), 'Yasaka', 2012, 2023),
((SELECT id FROM players WHERE slug = 'dimitrij-ovtcharov'), 'Butterfly', 2015, NULL);

-- Insert player footage
INSERT INTO player_footage (player_id, url, title, platform, active) VALUES
((SELECT id FROM players WHERE slug = 'ma-long'), 'https://youtube.com/watch?v=example1', 'Ma Long vs Fan Zhendong - WTT Finals 2023', 'youtube', true),
((SELECT id FROM players WHERE slug = 'fan-zhendong'), 'https://youtube.com/watch?v=example2', 'Fan Zhendong Training Session', 'youtube', true),
((SELECT id FROM players WHERE slug = 'timo-boll'), 'https://youtube.com/watch?v=example3', 'Timo Boll Equipment Review', 'youtube', true),
((SELECT id FROM players WHERE slug = 'xu-xin'), 'https://youtube.com/watch?v=example4', 'Xu Xin Chopping Highlights', 'youtube', true),
((SELECT id FROM players WHERE slug = 'dimitrij-ovtcharov'), 'https://youtube.com/watch?v=example5', 'Ovtcharov Forehand Analysis', 'youtube', true);

-- Add some additional equipment for variety
INSERT INTO equipment (name, slug, category, subcategory, manufacturer, specifications) VALUES
('Butterfly Dignics 05', 'butterfly-dignics-05', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "Spring Sponge X", "sponge": "High Tension", "speed": 9.8, "spin": 9.7, "control": 8.2, "hardness": "40"}'),
('Donic Bluestorm Z1', 'donic-bluestorm-z1', 'rubber', 'inverted', 'Donic', 
 '{"topsheet": "Tensor", "sponge": "Dynamic", "speed": 9.3, "spin": 9.0, "control": 8.7, "hardness": "42.5"}'),
('Andro Rasanter R47', 'andro-rasanter-r47', 'rubber', 'inverted', 'Andro', 
 '{"topsheet": "Tensor", "sponge": "Energy Cell", "speed": 9.5, "spin": 9.4, "control": 8.3, "hardness": "47.5"}');

-- More blades
INSERT INTO equipment (name, slug, category, manufacturer, specifications) VALUES
('Butterfly Viscaria', 'butterfly-viscaria', 'blade', 'Butterfly', 
 '{"plies": 5, "material": "Arylate Carbon", "weight": "86g", "thickness": "5.7mm", "speed": 9.8, "control": 8.3}'),
('Donic Ovtcharov Senso V1', 'donic-ovtcharov-senso-v1', 'blade', 'Donic', 
 '{"plies": 7, "material": "Carbon", "weight": "85g", "thickness": "5.8mm", "speed": 9.6, "control": 8.5}'),
('Tibhar Stratus Power Wood', 'tibhar-stratus-power-wood', 'blade', 'Tibhar', 
 '{"plies": 5, "material": "Wood", "weight": "82g", "thickness": "5.6mm", "speed": 8.8, "control": 9.0}');