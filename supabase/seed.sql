-- Seed data for TT Reviews database

-- Insert configurable categories (admins can modify these through the admin interface)
INSERT INTO categories (type, name, value, display_order, flag_emoji, is_active) VALUES
-- Equipment categories
('equipment_category', 'Blades', 'blade', 1, NULL, true),
('equipment_category', 'Rubbers', 'rubber', 2, NULL, true),
('equipment_category', 'Balls', 'ball', 3, NULL, true),

-- Equipment subcategories (rubber types). Display order runs
-- short → medium → long pips, with anti-spin trailing.
('equipment_subcategory', 'Inverted', 'inverted', 1, NULL, true),
('equipment_subcategory', 'Short Pips', 'short_pips', 2, NULL, true),
('equipment_subcategory', 'Medium Pips', 'medium_pips', 3, NULL, true),
('equipment_subcategory', 'Long Pips', 'long_pips', 4, NULL, true),
('equipment_subcategory', 'Anti-Spin', 'anti', 5, NULL, true),

-- Playing styles (accurate table tennis categories)
('playing_style', 'Shakehand Attacker', 'shakehand_attacker', 1, NULL, true),
('playing_style', 'Penhold Attacker (Traditional)', 'penhold_traditional', 2, NULL, true),
('playing_style', 'Penhold Attacker (RPB)', 'penhold_rpb', 3, NULL, true),
('playing_style', 'Modern Defender', 'modern_defender', 4, NULL, true),
('playing_style', 'Classical Defender', 'classical_defender', 5, NULL, true),
('playing_style', 'Anti-spin', 'anti_spin', 6, NULL, true),
('playing_style', 'Short Pips Hitter', 'short_pips_hitter', 7, NULL, true),

-- Countries with flag emojis (major table tennis nations - using ISO 3166-1 alpha-3 codes to match players table)
('country', 'China', 'CHN', 1, '🇨🇳', true),
('country', 'Japan', 'JPN', 2, '🇯🇵', true),
('country', 'Germany', 'GER', 3, '🇩🇪', true),
('country', 'South Korea', 'KOR', 4, '🇰🇷', true),
('country', 'Sweden', 'SWE', 5, '🇸🇪', true),
('country', 'France', 'FRA', 6, '🇫🇷', true),
('country', 'Chinese Taipei', 'TPE', 7, '🇹🇼', true),
('country', 'Brazil', 'BRA', 8, '🇧🇷', true),
('country', 'Slovenia', 'SLO', 9, '🇸🇮', true),
('country', 'Denmark', 'DEN', 10, '🇩🇰', true),
('country', 'Austria', 'AUT', 11, '🇦🇹', true),
('country', 'Romania', 'ROU', 12, '🇷🇴', true),
('country', 'Egypt', 'EGY', 13, '🇪🇬', true),
('country', 'Ukraine', 'UKR', 14, '🇺🇦', true),
('country', 'Macau', 'MAC', 15, '🇲🇴', true),
('country', 'Puerto Rico', 'PUR', 16, '🇵🇷', true),
('country', 'United States', 'USA', 17, '🇺🇸', true),
('country', 'Singapore', 'SGP', 18, '🇸🇬', true),
('country', 'Hong Kong', 'HKG', 19, '🇭🇰', true),
('country', 'Great Britain', 'GBR', 20, '🇬🇧', true),
('country', 'Belgium', 'BEL', 21, '🇧🇪', true),
('country', 'Netherlands', 'NLD', 22, '🇳🇱', true),
('country', 'Czech Republic', 'CZE', 23, '🇨🇿', true),
('country', 'Poland', 'POL', 24, '🇵🇱', true),
('country', 'Hungary', 'HUN', 25, '🇭🇺', true),
('country', 'Belarus', 'BLR', 26, '🇧🇾', true),
('country', 'Russia', 'RUS', 27, '🇷🇺', true),
('country', 'Portugal', 'PRT', 28, '🇵🇹', true),
('country', 'Spain', 'ESP', 29, '🇪🇸', true),
('country', 'Italy', 'ITA', 30, '🇮🇹', true),
('country', 'Croatia', 'HRV', 31, '🇭🇷', true),
('country', 'Luxembourg', 'LUX', 32, '🇱🇺', true),
('country', 'India', 'IND', 33, '🇮🇳', true),
('country', 'Australia', 'AUS', 34, '🇦🇺', true),
('country', 'Canada', 'CAN', 35, '🇨🇦', true),
('country', 'Nigeria', 'NGA', 36, '🇳🇬', true),
('country', 'Iran', 'IRN', 37, '🇮🇷', true),
('country', 'Thailand', 'THA', 38, '🇹🇭', true),
('country', 'Malaysia', 'MYS', 39, '🇲🇾', true),
('country', 'Indonesia', 'IDN', 40, '🇮🇩', true),
('country', 'Philippines', 'PHL', 41, '🇵🇭', true),
('country', 'North Korea', 'PRK', 42, '🇰🇵', true),

-- Rejection categories for moderation
('rejection_category', 'Duplicate Entry', 'duplicate', 1, NULL, true),
('rejection_category', 'Insufficient Information', 'insufficient_info', 2, NULL, true),
('rejection_category', 'Poor Image Quality', 'poor_image_quality', 3, NULL, true),
('rejection_category', 'Inappropriate Content', 'inappropriate_content', 4, NULL, true),
('rejection_category', 'Invalid Data', 'invalid_data', 5, NULL, true),
('rejection_category', 'Spam', 'spam', 6, NULL, true),
('rejection_category', 'Other', 'other', 7, NULL, true);

-- General review rating categories removed - using equipment-specific ones instead

-- Review rating categories for equipment categories (blade, rubber, ball)
-- These will be used for the new equipment review system

-- Blade rating categories
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Speed', 'speed', 'How fast the blade feels during play', 1, c.id, true
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Control', 'control', 'How easy it is to place the ball precisely', 2, c.id, true
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Feel', 'feel', 'The tactile feedback and touch sensation', 3, c.id, true
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Consistency', 'consistency', 'How predictable the blade performs', 4, c.id, true
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Power', 'power', 'Ability to generate powerful shots', 5, c.id, true
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

-- General rubber categories removed - using subcategory-specific ones instead

-- Ball rating categories
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Bounce Consistency', 'bounce_consistency', 'Uniformity of ball bounce', 1, c.id, true
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'ball';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Durability', 'durability', 'How long the ball lasts during play', 2, c.id, true
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'ball';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Feel', 'feel', 'Touch and impact sensation', 3, c.id, true
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'ball';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Roundness', 'roundness', 'Spherical precision of the ball', 4, c.id, true
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'ball';

-- Subcategory-specific rating categories

-- Inverted rubber specific categories (parent: inverted subcategory)
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Speed', 'speed', 'How fast the rubber is for offensive play', 1, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Spin', 'spin', 'Ability to generate and receive spin', 2, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Control', 'control', 'Precision and placement capability', 3, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Throw Angle', 'throw_angle', 'Arc trajectory of the ball', 4, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Tackiness', 'tackiness', 'Grip level of the rubber surface', 5, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Durability', 'durability', 'How long the rubber maintains performance', 6, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

-- Anti-spin rubber specific categories (parent: anti subcategory)  
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Anti Effect', 'anti_effect', 'Effectiveness at neutralizing incoming spin', 1, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Control', 'control', 'Precision for placement shots', 2, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Deception', 'deception', 'Ability to disguise shots', 3, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Slickness', 'slickness', 'How slippery the surface feels', 4, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Durability', 'durability', 'How long anti effect lasts', 5, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

-- Long pips rubber specific categories (parent: long_pips subcategory)
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Disruption', 'disruption', 'Ability to disrupt opponent rhythm', 1, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Control', 'control', 'Precision when blocking and pushing', 2, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Spin Reversal', 'spin_reversal', 'Effectiveness at reversing incoming spin', 3, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Pip Length', 'pip_length', 'Length and effectiveness of pips', 4, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Durability', 'durability', 'How long pips maintain effectiveness', 5, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

-- Short pips rubber specific categories (parent: short_pips subcategory)
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Speed', 'speed', 'How fast shots come off the rubber', 1, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Control', 'control', 'Precision for close-to-table play', 2, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Blocking', 'blocking', 'Effectiveness for aggressive blocking', 3, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Spin Insensitivity', 'spin_insensitivity', 'Resistance to incoming spin', 4, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active)
SELECT 'review_rating_category', 'Durability', 'durability', 'How long pips maintain effectiveness', 5, c.id, true
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

-- Equipment spec fields (TT-25 / TT-72)
-- Drives the DB-driven spec table in the comparison UI. Each row = a key in the
-- equipment.specifications JSONB blob; value MUST match the JSON key exactly
-- (e.g. 'thickness' matches equipment.specifications->>'thickness'). Parented by
-- equipment_category for blade/ball, equipment_subcategory for rubber types.
--
-- field_type / unit / scale_min / scale_max define the typed shape — see
-- archive/EQUIPMENT-SPECS.md for the locked design.

-- Blade spec fields
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, unit)
SELECT 'equipment_spec_field', 'Thickness', 'thickness', 'Blade thickness', 1, c.id, true, 'float', 'mm'
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Plies (wood)', 'plies_wood', 'Number of wood plies', 2, c.id, true, 'int'
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Plies (composite)', 'plies_composite', 'Number of composite plies (carbon, ALC, etc.). NULL for pure-wood blades.', 3, c.id, true, 'int'
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, unit)
SELECT 'equipment_spec_field', 'Weight', 'weight', 'Blade weight', 4, c.id, true, 'int', 'g'
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Material', 'material', 'Core material composition', 5, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Speed', 'speed', 'Manufacturer speed rating', 6, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Control', 'control', 'Manufacturer control rating', 7, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_category' AND c.value = 'blade';

-- Inverted rubber spec fields
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Sponge', 'sponge', 'Sponge material or description', 1, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Topsheet', 'topsheet', 'Topsheet material or type', 2, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Speed', 'speed', 'Manufacturer speed rating', 3, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Spin', 'spin', 'Manufacturer spin rating', 4, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Control', 'control', 'Manufacturer control rating', 5, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Hardness', 'hardness', 'Sponge hardness', 6, c.id, true, 'range'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Year', 'year', 'Release year', 7, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'inverted';

-- Anti-spin rubber spec fields
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Sponge', 'sponge', 'Sponge material or description', 1, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Topsheet', 'topsheet', 'Topsheet material or type', 2, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Speed', 'speed', 'Manufacturer speed rating', 3, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Spin', 'spin', 'Manufacturer spin rating', 4, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Control', 'control', 'Manufacturer control rating', 5, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'anti';

-- Long pips rubber spec fields
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Sponge', 'sponge', 'Sponge material or description', 1, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Topsheet', 'topsheet', 'Topsheet material or type', 2, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Speed', 'speed', 'Manufacturer speed rating', 3, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Spin', 'spin', 'Manufacturer spin rating', 4, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Control', 'control', 'Manufacturer control rating', 5, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'long_pips';

-- Short pips rubber spec fields
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Sponge', 'sponge', 'Sponge material or description', 1, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Topsheet', 'topsheet', 'Topsheet material or type', 2, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Speed', 'speed', 'Manufacturer speed rating', 3, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Spin', 'spin', 'Manufacturer spin rating', 4, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Control', 'control', 'Manufacturer control rating', 5, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'short_pips';

-- Medium pips rubber spec fields
INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Sponge', 'sponge', 'Sponge material or description', 1, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'medium_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type)
SELECT 'equipment_spec_field', 'Topsheet', 'topsheet', 'Topsheet material or type', 2, c.id, true, 'text'
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'medium_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Speed', 'speed', 'Manufacturer speed rating', 3, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'medium_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Spin', 'spin', 'Manufacturer spin rating', 4, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'medium_pips';

INSERT INTO categories (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
SELECT 'equipment_spec_field', 'Control', 'control', 'Manufacturer control rating', 5, c.id, true, 'float', 0, 10
FROM categories c WHERE c.type = 'equipment_subcategory' AND c.value = 'medium_pips';

-- Ball spec fields: intentionally none seeded. No ball specs exist in data yet;
-- admin can add them later via the configurable categories UI.

-- Insert equipment (popular blades from revspin.net)
INSERT INTO equipment (name, slug, category, manufacturer, specifications) VALUES
-- Top 20 most popular blades
('Viscaria', 'butterfly-viscaria', 'blade', 'Butterfly', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Arylate Carbon", "weight": 86, "thickness": 5.7, "speed": 9.8, "control": 8.3}'),
('Timo Boll ALC', 'butterfly-timo-boll-alc', 'blade', 'Butterfly', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Arylate Carbon", "weight": 85, "thickness": 5.9, "speed": 9.5, "control": 8.8}'),
('Ma Lin Extra Offensive', 'yasaka-ma-lin-extra-offensive', 'blade', 'Yasaka', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 88, "thickness": 6.1, "speed": 9.0, "control": 8.5}'),
('Power-G PG7', 'dhs-power-g-pg7', 'blade', 'DHS', 
 '{"plies_wood": 7, "plies_composite": null, "material": "Carbon", "weight": 86, "thickness": 6.0, "speed": 9.5, "control": 8.2}'),
('Timo Boll Spirit', 'butterfly-timo-boll-spirit', 'blade', 'Butterfly', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 85, "thickness": 5.9, "speed": 8.8, "control": 9.0}'),
('Stratus Power Wood', 'tibhar-stratus-power-wood', 'blade', 'Tibhar', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 82, "thickness": 5.6, "speed": 8.8, "control": 9.0}'),
('Infinity VPS V Diamond Touch', 'stiga-infinity-vps-v-diamond-touch', 'blade', 'Stiga', 
 '{"plies_wood": 7, "plies_composite": null, "material": "Carbon", "weight": 90, "thickness": 6.2, "speed": 9.6, "control": 8.4}'),
('Hurricane 301', 'dhs-hurricane-301', 'blade', 'DHS', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 85, "thickness": 5.8, "speed": 8.9, "control": 8.7}'),
('Petr Korbel', 'butterfly-petr-korbel', 'blade', 'Butterfly', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 85, "thickness": 5.8, "speed": 8.5, "control": 9.2}'),
('T-11+', 'yinhe-galaxy-milkyway-t11-plus', 'blade', 'Yinhe (Galaxy/Milkyway)', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 83, "thickness": 5.7, "speed": 8.7, "control": 8.9}'),
('Primorac', 'butterfly-primorac', 'blade', 'Butterfly', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 85, "thickness": 5.8, "speed": 8.8, "control": 9.0}'),
('Hurricane Long 5', 'dhs-hurricane-long-5', 'blade', 'DHS', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 87, "thickness": 6.0, "speed": 9.2, "control": 8.5}'),
('Sweden Extra', 'yasaka-sweden-extra', 'blade', 'Yasaka', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 85, "thickness": 5.9, "speed": 8.6, "control": 9.1}'),
('Sardius', 'butterfly-sardius', 'blade', 'Butterfly', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 84, "thickness": 5.7, "speed": 8.7, "control": 8.9}'),
('Allround Classic', 'stiga-allround-classic', 'blade', 'Stiga', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 85, "thickness": 5.8, "speed": 8.0, "control": 9.5}'),
('Waldner Senso Carbon', 'donic-waldner-senso-carbon', 'blade', 'Donic', 
 '{"plies_wood": 7, "plies_composite": null, "material": "Carbon", "weight": 85, "thickness": 5.9, "speed": 9.3, "control": 8.6}'),
('Gergely Carbon', 'butterfly-gergely-carbon', 'blade', 'Butterfly', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Carbon", "weight": 86, "thickness": 5.8, "speed": 9.4, "control": 8.4}'),
('Amultart ZL Carbon', 'butterfly-amultart-zl-carbon', 'blade', 'Butterfly', 
 '{"plies_wood": 5, "plies_composite": null, "material": "ZL Carbon", "weight": 86, "thickness": 5.8, "speed": 9.6, "control": 8.2}'),
('Zhang Jike ALC', 'butterfly-zhang-jike-alc', 'blade', 'Butterfly', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Arylate Carbon", "weight": 85, "thickness": 5.8, "speed": 9.7, "control": 8.1}'),
('Acoustic', 'nittaku-acoustic', 'blade', 'Nittaku', 
 '{"plies_wood": 5, "plies_composite": null, "material": "Wood", "weight": 86, "thickness": 6.0, "speed": 8.4, "control": 9.3}');

-- Insert equipment (popular rubbers from revspin.net - all inverted type)
INSERT INTO equipment (name, slug, category, subcategory, manufacturer, specifications) VALUES
-- Top 25 most popular rubbers
('Tenergy 05', 'butterfly-tenergy-05', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "High Tension", "sponge": "Spring Sponge", "speed": 9.7, "spin": 9.9, "control": 8.3, "hardness": {"min": 36, "max": 36}}'),
('NEO Hurricane 3', 'dhs-neo-hurricane-3', 'rubber', 'inverted', 'DHS', 
 '{"topsheet": "Tacky", "sponge": "Hard", "speed": 8.5, "spin": 9.9, "control": 8.2, "hardness": {"min": 40, "max": 40}}'),
('Mark V', 'yasaka-mark-v', 'rubber', 'inverted', 'Yasaka', 
 '{"topsheet": "Natural", "sponge": "Medium", "speed": 8.0, "spin": 8.5, "control": 9.5, "hardness": {"min": 40, "max": 42}}'),
('Rakza 7', 'yasaka-rakza-7', 'rubber', 'inverted', 'Yasaka', 
 '{"topsheet": "Tensor", "sponge": "Dynamic", "speed": 9.0, "spin": 9.0, "control": 8.8, "hardness": {"min": 47.5, "max": 47.5}}'),
('Tenergy 05 FX', 'butterfly-tenergy-05-fx', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "High Tension", "sponge": "Spring Sponge FX", "speed": 9.5, "spin": 9.8, "control": 8.7, "hardness": {"min": 36, "max": 36}}'),
('Fastarc G-1', 'nittaku-fastarc-g1', 'rubber', 'inverted', 'Nittaku', 
 '{"topsheet": "Tensor", "sponge": "High Energy", "speed": 9.2, "spin": 9.3, "control": 8.5, "hardness": {"min": 47.5, "max": 47.5}}'),
('Evolution MX-P', 'tibhar-evolution-mx-p', 'rubber', 'inverted', 'Tibhar', 
 '{"topsheet": "Tensor", "sponge": "Dynamic", "speed": 9.4, "spin": 9.2, "control": 8.2, "hardness": {"min": 47.5, "max": 47.5}}'),
('Rakza 7 Soft', 'yasaka-rakza-7-soft', 'rubber', 'inverted', 'Yasaka', 
 '{"topsheet": "Tensor", "sponge": "Soft Dynamic", "speed": 8.7, "spin": 9.0, "control": 9.0, "hardness": {"min": 42.5, "max": 42.5}}'),
('Vega Europe', 'xiom-vega-europe', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Tensor", "sponge": "Elastic", "speed": 8.8, "spin": 8.8, "control": 9.0, "hardness": {"min": 47.5, "max": 47.5}}'),
('Tenergy 64', 'butterfly-tenergy-64', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "High Tension", "sponge": "Spring Sponge", "speed": 9.5, "spin": 9.8, "control": 8.5, "hardness": {"min": 36, "max": 38}}'),
('Vega Pro', 'xiom-vega-pro', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Tensor", "sponge": "Elastic", "speed": 9.0, "spin": 9.2, "control": 8.8, "hardness": {"min": 47.5, "max": 47.5}}'),
('Bluefire M2', 'donic-bluefire-m2', 'rubber', 'inverted', 'Donic', 
 '{"topsheet": "Tensor", "sponge": "Energy Cell", "speed": 9.1, "spin": 9.0, "control": 8.6, "hardness": {"min": 45, "max": 45}}'),
('Baracuda', 'donic-baracuda', 'rubber', 'inverted', 'Donic', 
 '{"topsheet": "Tensor", "sponge": "Energy Cell", "speed": 9.3, "spin": 8.8, "control": 8.4, "hardness": {"min": 42.5, "max": 42.5}}'),
('Tenergy 80', 'butterfly-tenergy-80', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "High Tension", "sponge": "Spring Sponge", "speed": 9.8, "spin": 9.5, "control": 8.0, "hardness": {"min": 36, "max": 36}}'),
('Dignics 09C', 'butterfly-dignics-09c', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "Spring Sponge X", "sponge": "High Tension", "speed": 9.6, "spin": 9.8, "control": 8.4, "hardness": {"min": 40, "max": 40}}'),
('Dignics 05', 'butterfly-dignics-05', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "Spring Sponge X", "sponge": "High Tension", "speed": 9.8, "spin": 9.7, "control": 8.2, "hardness": {"min": 40, "max": 40}}'),
('Hurricane 3 (H3)', 'dhs-hurricane-3-h3', 'rubber', 'inverted', 'DHS', 
 '{"topsheet": "Tacky", "sponge": "Hard", "speed": 8.5, "spin": 9.7, "control": 8.0, "hardness": {"min": 39, "max": 41}}'),
('Rozena', 'butterfly-rozena', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "High Tension", "sponge": "Spring Sponge", "speed": 9.0, "spin": 9.0, "control": 8.8, "hardness": {"min": 35, "max": 35}}'),
('Gold Arc 8', 'dhs-gold-arc-8', 'rubber', 'inverted', 'DHS', 
 '{"topsheet": "Tacky", "sponge": "Medium Hard", "speed": 8.8, "spin": 9.5, "control": 8.5, "hardness": {"min": 38, "max": 38}}'),
('Acuda S2', 'donic-acuda-s2', 'rubber', 'inverted', 'Donic', 
 '{"topsheet": "Tensor", "sponge": "Energy Cell", "speed": 9.0, "spin": 9.2, "control": 8.7, "hardness": {"min": 45, "max": 45}}'),
('Sriver', 'butterfly-sriver', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "Natural", "sponge": "Medium", "speed": 8.2, "spin": 8.8, "control": 9.0, "hardness": {"min": 35, "max": 35}}'),
('Evolution EL-P', 'tibhar-evolution-el-p', 'rubber', 'inverted', 'Tibhar', 
 '{"topsheet": "Tensor", "sponge": "Elastic", "speed": 8.8, "spin": 9.0, "control": 8.9, "hardness": {"min": 42.5, "max": 42.5}}'),
('Rasant', 'andro-rasant', 'rubber', 'inverted', 'Andro', 
 '{"topsheet": "Tensor", "sponge": "Energy Cell", "speed": 9.2, "spin": 8.9, "control": 8.5, "hardness": {"min": 47.5, "max": 47.5}}'),
('Sriver FX', 'butterfly-sriver-fx', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "Natural", "sponge": "Soft", "speed": 8.0, "spin": 8.8, "control": 9.2, "hardness": {"min": 25, "max": 25}}'),
('Rakza Z', 'yasaka-rakza-z', 'rubber', 'inverted', 'Yasaka', 
 '{"topsheet": "Tensor", "sponge": "Energy", "speed": 9.3, "spin": 9.2, "control": 8.3, "hardness": {"min": 50, "max": 50}}');

-- Insert equipment (popular pips rubbers from revspin.net)
INSERT INTO equipment (name, slug, category, subcategory, manufacturer, specifications) VALUES
-- Popular pips rubbers with correct subcategories
('Curl P-1R', 'tsp-curl-p1r', 'rubber', 'long_pips', 'TSP', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.5, "spin": 9.0, "control": 9.2}'),
('Grass D.TecS', 'tibhar-grass-dtecs', 'rubber', 'long_pips', 'Tibhar', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.0, "spin": 9.5, "control": 9.0}'),
('Feint Long 3', 'butterfly-feint-long-3', 'rubber', 'long_pips', 'Butterfly', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.2, "spin": 9.3, "control": 8.8}'),
('802-40', 'friendship-729-802-40', 'rubber', 'short_pips', 'Friendship/729', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 8.5, "spin": 6.0, "control": 8.5}'),
('Dornenglanz', 'spinlord-dornenglanz', 'rubber', 'long_pips', 'SpinLord', 
 '{"topsheet": "Long Pips", "sponge": "Medium", "speed": 5.5, "spin": 9.8, "control": 8.5}'),
('388D-1', 'dawei-388d-1', 'rubber', 'long_pips', 'Dawei', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.3, "spin": 9.2, "control": 8.7}'),
('Curl P1V', 'victas-curl-p1v', 'rubber', 'long_pips', 'Victas', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.8, "spin": 8.8, "control": 9.0}'),
('Challenger Attack', 'butterfly-challenger-attack', 'rubber', 'short_pips', 'Butterfly', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 8.2, "spin": 6.5, "control": 8.3}'),
('Rakza PO', 'yasaka-rakza-po', 'rubber', 'short_pips', 'Yasaka', 
 '{"topsheet": "Short Pips", "sponge": "Tensor", "speed": 8.8, "spin": 6.8, "control": 8.0}'),
('Spectol', 'tsp-spectol', 'rubber', 'short_pips', 'TSP', 
 '{"topsheet": "Short Pips", "sponge": "Soft", "speed": 6.5, "spin": 4.0, "control": 9.5}'),
('Feint Long 2', 'butterfly-feint-long-2', 'rubber', 'long_pips', 'Butterfly', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.0, "spin": 9.4, "control": 8.9}'),
('Cloud and Fog 3', 'dhs-cloud-and-fog-3', 'rubber', 'long_pips', 'DHS', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.5, "spin": 9.1, "control": 8.6}'),
('Killer', 'dr-neubauer-killer', 'rubber', 'short_pips', 'Dr. Neubauer', 
 '{"topsheet": "Short Pips", "sponge": "Hard", "speed": 8.0, "spin": 5.5, "control": 8.2}'),
('Dr. Evil', 'friendship-729-dr-evil', 'rubber', 'short_pips', 'Friendship/729', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 8.3, "spin": 6.2, "control": 8.4}'),
('802', 'friendship-729-802', 'rubber', 'short_pips', 'Friendship/729', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 8.4, "spin": 6.0, "control": 8.5}'),
('Blitzschlag', 'spinlord-blitzschlag', 'rubber', 'long_pips', 'SpinLord', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.8, "spin": 9.6, "control": 9.2}'),
('755', 'friendship-729-755', 'rubber', 'long_pips', 'Friendship/729', 
 '{"topsheet": "Long Pips", "sponge": "Medium", "speed": 5.0, "spin": 9.0, "control": 8.8}'),
('955', 'yinhe-galaxy-milkyway-955', 'rubber', 'long_pips', 'Yinhe (Galaxy/Milkyway)', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.5, "spin": 9.3, "control": 9.0}'),
('Royal', 'stiga-royal', 'rubber', 'short_pips', 'Stiga', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 7.5, "spin": 5.0, "control": 9.0}'),
('Radical', 'stiga-radical', 'rubber', 'short_pips', 'Stiga', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 8.0, "spin": 5.5, "control": 8.5}'),
('Impartial XS', 'butterfly-impartial-xs', 'rubber', 'short_pips', 'Butterfly', 
 '{"topsheet": "Short Pips", "sponge": "Soft", "speed": 6.0, "spin": 4.5, "control": 9.5}'),
('Killer Pro', 'dr-neubauer-killer-pro', 'rubber', 'short_pips', 'Dr. Neubauer', 
 '{"topsheet": "Short Pips", "sponge": "Hard", "speed": 8.2, "spin": 5.8, "control": 8.0}'),
('Saviga V', 'dawei-saviga-v', 'rubber', 'long_pips', 'Dawei', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.0, "spin": 9.0, "control": 8.5}'),
('Neptune', 'yinhe-galaxy-milkyway-neptune', 'rubber', 'long_pips', 'Yinhe (Galaxy/Milkyway)', 
 '{"topsheet": "Long Pips", "sponge": "Medium", "speed": 4.8, "spin": 8.9, "control": 8.7}'),
('Piranja Formula Tec', 'donic-piranja-formula-tec', 'rubber', 'long_pips', 'Donic', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.5, "spin": 9.2, "control": 8.8}'),
('388C-1', 'dawei-388c-1', 'rubber', 'long_pips', 'Dawei', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.2, "spin": 9.1, "control": 8.9}'),
('Degu', 'spinlord-degu', 'rubber', 'short_pips', 'SpinLord', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 7.8, "spin": 6.0, "control": 8.2}'),
('Prasidha 1615', 'double-fish-prasidha-1615', 'rubber', 'long_pips', 'Double Fish', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.3, "spin": 8.8, "control": 8.6}'),
('Spinfire', 'der-materialspezialist-spinfire', 'rubber', 'anti', 'Der Materialspezialist', 
 '{"topsheet": "Anti-Spin", "sponge": "Soft", "speed": 6.5, "spin": 2.0, "control": 9.0}'),
('Waran II', 'spinlord-waran-ii', 'rubber', 'short_pips', 'SpinLord', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 7.5, "spin": 5.8, "control": 8.3}'),
('Waran', 'spinlord-waran', 'rubber', 'short_pips', 'SpinLord', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 7.8, "spin": 5.5, "control": 8.1}'),
('C8', 'dhs-c8', 'rubber', 'long_pips', 'DHS', 
 '{"topsheet": "Long Pips", "sponge": "Hard", "speed": 5.0, "spin": 8.5, "control": 8.0}'),
('Zeitgeist', 'spinlord-zeitgeist', 'rubber', 'long_pips', 'SpinLord', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.0, "spin": 9.5, "control": 9.0}'),
('Express Ultra', 'joola-express-ultra', 'rubber', 'short_pips', 'JOOLA', 
 '{"topsheet": "Short Pips", "sponge": "Hard", "speed": 8.5, "spin": 6.0, "control": 7.8}'),
('Impartial XB', 'butterfly-impartial-xb', 'rubber', 'short_pips', 'Butterfly', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 6.2, "spin": 4.8, "control": 9.2}'),
('Phantom 0011 Infinity', 'yasaka-phantom-0011-infinity', 'rubber', 'long_pips', 'Yasaka', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.5, "spin": 9.2, "control": 8.8}'),
('Keiler', 'spinlord-keiler', 'rubber', 'short_pips', 'SpinLord', 
 '{"topsheet": "Short Pips", "sponge": "Hard", "speed": 8.0, "spin": 5.5, "control": 8.0}'),
('WP1013', 'palio-wp1013', 'rubber', 'short_pips', 'Palio', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 7.8, "spin": 5.8, "control": 8.5}'),
('837', 'friendship-729-837', 'rubber', 'long_pips', 'Friendship/729', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.2, "spin": 9.0, "control": 8.7}'),
('SUPER BLOCK', 'dr-neubauer-super-block', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 3.8, "spin": 9.3, "control": 9.2}'),
('Saviga Monster 77', 'dawei-saviga-monster-77', 'rubber', 'long_pips', 'Dawei', 
 '{"topsheet": "Long Pips", "sponge": "Medium", "speed": 4.5, "spin": 8.8, "control": 8.3}'),
('Monkey', 'sauer-troger-monkey', 'rubber', 'long_pips', 'Sauer & Troger', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.0, "spin": 9.1, "control": 8.9}'),
('Phantom 009', 'yasaka-phantom-009', 'rubber', 'long_pips', 'Yasaka', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.3, "spin": 9.0, "control": 8.6}'),
('CK531A', 'palio-ck531a', 'rubber', 'long_pips', 'Palio', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.1, "spin": 8.9, "control": 8.8}'),
('Pluto', 'yinhe-galaxy-milkyway-pluto', 'rubber', 'long_pips', 'Yinhe (Galaxy/Milkyway)', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.0, "spin": 9.2, "control": 9.0}'),
('Curl P-4 Chop', 'tsp-curl-p4-chop', 'rubber', 'long_pips', 'TSP', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.2, "spin": 9.1, "control": 9.1}'),
('Qing', 'yinhe-galaxy-milkyway-qing', 'rubber', 'long_pips', 'Yinhe (Galaxy/Milkyway)', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.3, "spin": 8.8, "control": 8.9}'),
('Pistol', 'dr-neubauer-pistol', 'rubber', 'short_pips', 'Dr. Neubauer', 
 '{"topsheet": "Short Pips", "sponge": "Hard", "speed": 7.5, "spin": 5.0, "control": 8.5}'),
('Viper Soft', 'dr-neubauer-viper-soft', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.0, "spin": 9.0, "control": 9.1}'),
('Clippa', 'stiga-clippa', 'rubber', 'short_pips', 'Stiga', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 7.8, "spin": 5.5, "control": 8.8}'),

-- Additional Victas rubbers
('Curl P3aV', 'victas-curl-p3av', 'rubber', 'long_pips', 'Victas', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.5, "spin": 8.8, "control": 9.0}'),
('Curl P4V', 'victas-curl-p4v', 'rubber', 'long_pips', 'Victas', 
 '{"topsheet": "Long Pips", "sponge": "Medium", "speed": 4.8, "spin": 8.5, "control": 8.8}'),
('Curl P5V', 'victas-curl-p5v', 'rubber', 'long_pips', 'Victas', 
 '{"topsheet": "Long Pips", "sponge": "Hard", "speed": 5.0, "spin": 8.2, "control": 8.5}'),

-- Additional Victas short pips rubbers
('VO > 101', 'victas-vo-101', 'rubber', 'short_pips', 'Victas', 
 '{"topsheet": "Short Pips", "sponge": "Hard", "speed": 8.5, "spin": 6.0, "control": 8.0}'),
('VO > 102', 'victas-vo-102', 'rubber', 'short_pips', 'Victas', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 8.2, "spin": 6.2, "control": 8.3}'),
('VO > 103', 'victas-vo-103', 'rubber', 'short_pips', 'Victas', 
 '{"topsheet": "Short Pips", "sponge": "Soft", "speed": 7.8, "spin": 6.5, "control": 8.6}'),
('SPECTOL S1', 'victas-spectol-s1', 'rubber', 'short_pips', 'Victas', 
 '{"topsheet": "Short Pips", "sponge": "Soft", "speed": 7.0, "spin": 5.0, "control": 9.0}'),
('SPECTOL S2', 'victas-spectol-s2', 'rubber', 'short_pips', 'Victas', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 7.5, "spin": 5.2, "control": 8.8}'),
('SPECTOL S3', 'victas-spectol-s3', 'rubber', 'short_pips', 'Victas', 
 '{"topsheet": "Short Pips", "sponge": "Hard", "speed": 8.0, "spin": 5.5, "control": 8.5}'),
('SPINPIPS D1', 'victas-spinpips-d1', 'rubber', 'short_pips', 'Victas', 
 '{"topsheet": "Short Pips", "sponge": "Soft", "speed": 7.8, "spin": 6.8, "control": 8.5}'),
('SPINPIPS D2', 'victas-spinpips-d2', 'rubber', 'short_pips', 'Victas', 
 '{"topsheet": "Short Pips", "sponge": "Medium", "speed": 8.2, "spin": 7.0, "control": 8.2}'),
('SPINPIPS D3', 'victas-spinpips-d3', 'rubber', 'short_pips', 'Victas', 
 '{"topsheet": "Short Pips", "sponge": "Hard", "speed": 8.5, "spin": 7.2, "control": 8.0}');

-- Insert equipment (latest inverted rubbers 2019-2024 from premium brands)
INSERT INTO equipment (name, slug, category, subcategory, manufacturer, specifications) VALUES
-- Butterfly Dignics Series (2019-2020)
('Dignics 64', 'butterfly-dignics-64', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "Spring Sponge X", "sponge": "High Tension", "speed": 9.8, "spin": 9.5, "control": 8.0, "hardness": {"min": 40, "max": 40}, "year": "2019"}'),
('Dignics 80', 'butterfly-dignics-80', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "Spring Sponge X", "sponge": "High Tension", "speed": 9.6, "spin": 9.6, "control": 8.2, "hardness": {"min": 40, "max": 40}, "year": "2019"}'),

-- Victas V Series (2019-2024)
('V15 Extra', 'victas-v15-extra', 'rubber', 'inverted', 'Victas', 
 '{"topsheet": "Tensor", "sponge": "Offensive", "speed": 9.3, "spin": 9.2, "control": 8.9, "hardness": {"min": 47.5, "max": 47.5}, "year": "2020"}'),
('V20 Double Extra', 'victas-v20-double-extra', 'rubber', 'inverted', 'Victas', 
 '{"topsheet": "Tensor", "sponge": "Premium", "speed": 9.5, "spin": 9.0, "control": 8.5, "hardness": {"min": 53, "max": 53}, "year": "2021"}'),
('V22 Double Extra', 'victas-v22-double-extra', 'rubber', 'inverted', 'Victas', 
 '{"topsheet": "Tensor", "sponge": "Premium", "speed": 9.4, "spin": 9.3, "control": 8.7, "hardness": {"min": 50, "max": 50}, "year": "2022"}'),

-- Andro Rasanter Series (2019-2023)
('Rasanter R53', 'andro-rasanter-r53', 'rubber', 'inverted', 'Andro', 
 '{"topsheet": "Energy Cell", "sponge": "Dynamic", "speed": 9.2, "spin": 9.8, "control": 8.3, "hardness": {"min": 53, "max": 53}, "year": "2020"}'),
('Rasanter C53', 'andro-rasanter-c53', 'rubber', 'inverted', 'Andro', 
 '{"topsheet": "Energy Cell", "sponge": "Counterspin", "speed": 9.0, "spin": 9.5, "control": 9.0, "hardness": {"min": 53, "max": 53}, "year": "2021"}'),
('Rasanter C48', 'andro-rasanter-c48', 'rubber', 'inverted', 'Andro', 
 '{"topsheet": "Energy Cell", "sponge": "Counterspin", "speed": 8.8, "spin": 9.3, "control": 9.2, "hardness": {"min": 48, "max": 48}, "year": "2021"}'),

-- Xiom Omega VII & VIII Series (2022-2024)
('Omega VII Pro', 'xiom-omega-vii-pro', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Tensor", "sponge": "Premium", "speed": 9.4, "spin": 9.4, "control": 8.8, "hardness": {"min": 47.5, "max": 47.5}, "year": "2022"}'),
('Omega VII Euro', 'xiom-omega-vii-euro', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Tensor", "sponge": "European", "speed": 9.1, "spin": 9.6, "control": 9.0, "hardness": {"min": 45, "max": 45}, "year": "2022"}'),
('Omega VII Asia', 'xiom-omega-vii-asia', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Tensor", "sponge": "Asian", "speed": 8.8, "spin": 9.8, "control": 8.5, "hardness": {"min": 42, "max": 42}, "year": "2022"}'),
('Omega VIII Pro', 'xiom-omega-viii-pro', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Advanced Tensor", "sponge": "Next-Gen", "speed": 9.6, "spin": 9.5, "control": 8.9, "hardness": {"min": 47.5, "max": 47.5}, "year": "2024"}'),
('Omega VIII Euro', 'xiom-omega-viii-euro', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Advanced Tensor", "sponge": "European Style", "speed": 9.2, "spin": 9.7, "control": 9.1, "hardness": {"min": 45, "max": 45}, "year": "2024"}'),

-- Xiom Vega New Series (2023-2024)
('Vega China+', 'xiom-vega-china-plus', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Tacky Tensor", "sponge": "Medium", "speed": 8.5, "spin": 9.9, "control": 8.8, "hardness": {"min": 42, "max": 42}, "year": "2023"}'),
('Tau 3', 'xiom-tau-3', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Ultra Tacky", "sponge": "Soft", "speed": 8.0, "spin": 10.0, "control": 9.0, "hardness": {"min": 39, "max": 39}, "year": "2023"}'),
('Vega Pro H', 'xiom-vega-pro-h', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Hybrid Tensor", "sponge": "Medium Hard", "speed": 8.8, "spin": 9.4, "control": 8.9, "hardness": {"min": 47.5, "max": 47.5}, "year": "2024"}'),
('Vega Euro H', 'xiom-vega-euro-h', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Hybrid Tensor", "sponge": "European", "speed": 8.5, "spin": 9.6, "control": 9.1, "hardness": {"min": 45, "max": 45}, "year": "2024"}'),

-- Stiga Latest Series (2020-2023)
('Calibra LT Plus', 'stiga-calibra-lt-plus', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Tensor", "sponge": "Light Weight", "speed": 8.8, "spin": 9.0, "control": 9.2, "hardness": {"min": 45, "max": 45}, "year": "2020"}'),
('Mantra M', 'stiga-mantra-m', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Advanced Tensor", "sponge": "Medium", "speed": 9.2, "spin": 9.3, "control": 8.7, "hardness": {"min": 47.5, "max": 47.5}, "year": "2021"}'),
('Airoc M', 'stiga-airoc-m', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "High Performance", "sponge": "Air Cell", "speed": 9.4, "spin": 9.1, "control": 8.5, "hardness": {"min": 50, "max": 50}, "year": "2022"}'),
('DNA Platinum M', 'stiga-dna-platinum-m', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Platinum Series", "sponge": "Professional", "speed": 9.5, "spin": 9.4, "control": 8.6, "hardness": {"min": 52.5, "max": 52.5}, "year": "2023"}');

-- Insert equipment (additional inverted rubbers from comprehensive list)
INSERT INTO equipment (name, slug, category, subcategory, manufacturer, specifications) VALUES
-- New Inverted Rubbers
('Nuzn 50', 'andro-nuzn-50', 'rubber', 'inverted', 'Andro', 
 '{"topsheet": "Tensor", "sponge": "Medium", "speed": 9.0, "spin": 9.2, "control": 8.8, "hardness": {"min": 50, "max": 50}}'),
('Nuzn 55', 'andro-nuzn-55', 'rubber', 'inverted', 'Andro', 
 '{"topsheet": "Tensor", "sponge": "Hard", "speed": 9.2, "spin": 9.0, "control": 8.5, "hardness": {"min": 55, "max": 55}}'),
('Jekyll & Hyde Z52.5', 'xiom-jekyll-hyde-z525', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Hybrid", "sponge": "Zone", "speed": 9.1, "spin": 9.3, "control": 8.7, "hardness": {"min": 52.5, "max": 52.5}}'),
('DNA Hybrid H', 'stiga-dna-hybrid-h', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Hybrid", "sponge": "Hard", "speed": 9.0, "spin": 9.5, "control": 8.8, "hardness": {"min": 50, "max": 50}}'),
('DNA Hybrid M', 'stiga-dna-hybrid-m', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Hybrid", "sponge": "Medium", "speed": 8.8, "spin": 9.6, "control": 9.0, "hardness": {"min": 47.5, "max": 47.5}}'),
('Jekyll & Hyde C55', 'xiom-jekyll-hyde-c55', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Chinese", "sponge": "Hard", "speed": 8.5, "spin": 9.8, "control": 8.5, "hardness": {"min": 55, "max": 55}}'),
('Etika Pro H', 'nexy-etika-pro-h', 'rubber', 'inverted', 'Nexy', 
 '{"topsheet": "Tensor", "sponge": "Hard", "speed": 9.1, "spin": 9.2, "control": 8.6, "hardness": {"min": 50, "max": 50}}'),
('Jekyll & Hyde C52.5', 'xiom-jekyll-hyde-c525', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Chinese", "sponge": "Medium Hard", "speed": 8.3, "spin": 9.7, "control": 8.7, "hardness": {"min": 52.5, "max": 52.5}}'),
('DNA Hybrid XH', 'stiga-dna-hybrid-xh', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Hybrid", "sponge": "Extra Hard", "speed": 9.2, "spin": 9.3, "control": 8.5, "hardness": {"min": 52.5, "max": 52.5}}'),
('Jekyll & Hyde C57.5', 'xiom-jekyll-hyde-c575', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Chinese", "sponge": "Extra Hard", "speed": 8.7, "spin": 9.9, "control": 8.3, "hardness": {"min": 57.5, "max": 57.5}}'),
('BlueStar A1', 'donic-bluestar-a1', 'rubber', 'inverted', 'Donic', 
 '{"topsheet": "Tensor", "sponge": "Soft", "speed": 8.8, "spin": 9.0, "control": 9.0, "hardness": {"min": 42, "max": 42}}'),
('Omega VII Tour', 'xiom-omega-vii-tour', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Tensor", "sponge": "Tour", "speed": 9.0, "spin": 9.2, "control": 8.9, "hardness": {"min": 45, "max": 45}}'),
('Dynaryz Inferno', 'joola-dynaryz-inferno', 'rubber', 'inverted', 'JOOLA', 
 '{"topsheet": "Tensor", "sponge": "High Energy", "speed": 9.4, "spin": 9.1, "control": 8.3, "hardness": {"min": 50, "max": 50}}'),
('Etika Pro 47', 'nexy-etika-pro-47', 'rubber', 'inverted', 'Nexy', 
 '{"topsheet": "Tensor", "sponge": "Medium", "speed": 8.9, "spin": 9.3, "control": 8.8, "hardness": {"min": 47, "max": 47}}'),
('DNA Platinum XH', 'stiga-dna-platinum-xh', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Platinum Series", "sponge": "Extra Hard", "speed": 9.7, "spin": 9.2, "control": 8.3, "hardness": {"min": 55, "max": 55}}'),
('DNA Platinum H', 'stiga-dna-platinum-h', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Platinum Series", "sponge": "Hard", "speed": 9.6, "spin": 9.3, "control": 8.5, "hardness": {"min": 52.5, "max": 52.5}}'),
('DNA Dragon Power 57.5', 'stiga-dna-dragon-power-575', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Dragon Power", "sponge": "Ultra Hard", "speed": 9.8, "spin": 9.0, "control": 8.0, "hardness": {"min": 57.5, "max": 57.5}}'),
('DNA Dragon Power 52.5', 'stiga-dna-dragon-power-525', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Dragon Power", "sponge": "Hard", "speed": 9.6, "spin": 9.2, "control": 8.2, "hardness": {"min": 52.5, "max": 52.5}}'),
('DNA Platinum S', 'stiga-dna-platinum-s', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Platinum Series", "sponge": "Soft", "speed": 9.2, "spin": 9.5, "control": 9.0, "hardness": {"min": 45, "max": 45}}'),
('DNA Dragon Power 55', 'stiga-dna-dragon-power-55', 'rubber', 'inverted', 'Stiga', 
 '{"topsheet": "Dragon Power", "sponge": "Extra Hard", "speed": 9.7, "spin": 9.1, "control": 8.1, "hardness": {"min": 55, "max": 55}}'),
('BlueStar A2', 'donic-bluestar-a2', 'rubber', 'inverted', 'Donic', 
 '{"topsheet": "Tensor", "sponge": "Medium", "speed": 9.0, "spin": 9.1, "control": 8.8, "hardness": {"min": 45, "max": 45}}'),
('Rasanter C45', 'andro-rasanter-c45', 'rubber', 'inverted', 'Andro', 
 '{"topsheet": "Energy Cell", "sponge": "Counterspin", "speed": 8.6, "spin": 9.1, "control": 9.4, "hardness": {"min": 45, "max": 45}}'),
('Hybrid K3 Pro', 'tibhar-hybrid-k3-pro', 'rubber', 'inverted', 'Tibhar', 
 '{"topsheet": "Hybrid", "sponge": "Professional", "speed": 9.0, "spin": 9.4, "control": 8.8, "hardness": {"min": 50, "max": 50}}'),
('Hybrid K3', 'tibhar-hybrid-k3', 'rubber', 'inverted', 'Tibhar', 
 '{"topsheet": "Hybrid", "sponge": "Medium", "speed": 8.8, "spin": 9.3, "control": 9.0, "hardness": {"min": 47, "max": 47}}'),
('Dynaryz ZGX', 'joola-dynaryz-zgx', 'rubber', 'inverted', 'JOOLA', 
 '{"topsheet": "Tensor", "sponge": "Zero Gravity", "speed": 9.2, "spin": 9.3, "control": 8.6, "hardness": {"min": 48, "max": 48}}'),
('Omega 8 Hybrid', 'xiom-omega-8-hybrid', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Hybrid Tensor", "sponge": "Next-Gen", "speed": 9.0, "spin": 9.6, "control": 8.9, "hardness": {"min": 47.5, "max": 47.5}}'),
('Omega 8 Euro', 'xiom-omega-8-euro', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Advanced Tensor", "sponge": "European Style", "speed": 9.2, "spin": 9.7, "control": 9.1, "hardness": {"min": 45, "max": 45}}'),
('Omega 8 China', 'xiom-omega-8-china', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Chinese Style", "sponge": "Hard", "speed": 8.8, "spin": 9.9, "control": 8.4, "hardness": {"min": 52, "max": 52}}'),
('Omega 8 Pro', 'xiom-omega-8-pro', 'rubber', 'inverted', 'Xiom', 
 '{"topsheet": "Advanced Tensor", "sponge": "Next-Gen", "speed": 9.6, "spin": 9.5, "control": 8.9, "hardness": {"min": 47.5, "max": 47.5}}'),
('Bluestorm Pro', 'donic-bluestorm-pro', 'rubber', 'inverted', 'Donic', 
 '{"topsheet": "Tensor", "sponge": "Professional", "speed": 9.3, "spin": 9.2, "control": 8.5, "hardness": {"min": 50, "max": 50}}');

-- Insert equipment (anti-spin rubbers)
INSERT INTO equipment (name, slug, category, subcategory, manufacturer, specifications) VALUES
('Trick Anti', 'yasaka-trick-anti', 'rubber', 'anti', 'Yasaka', 
 '{"topsheet": "Anti-Spin", "sponge": "Medium", "speed": 6.5, "spin": 1.5, "control": 9.2}'),
('Tarantula', 'dr-neubauer-tarantula', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Soft", "speed": 6.0, "spin": 1.0, "control": 9.5}'),
('A-B-S 3 Pro', 'dr-neubauer-abs-3-pro', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Professional", "speed": 6.8, "spin": 1.2, "control": 9.3}'),
('A-B-S 2 PRO', 'dr-neubauer-abs-2-pro', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Professional", "speed": 6.5, "spin": 1.0, "control": 9.4}'),
('A-B-S 2 Evo', 'dr-neubauer-abs-2-evo', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Evolution", "speed": 6.3, "spin": 1.1, "control": 9.3}'),
('A-B-S 2 SOFT', 'dr-neubauer-abs-2-soft', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Soft", "speed": 5.8, "spin": 0.8, "control": 9.6}'),
('Anti Special', 'dr-neubauer-anti-special', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Special", "speed": 6.2, "spin": 1.0, "control": 9.4}'),
('Gorilla', 'dr-neubauer-gorilla', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Hard", "speed": 7.0, "spin": 1.5, "control": 9.0}'),
('Bison Plus', 'dr-neubauer-bison-plus', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Plus", "speed": 6.8, "spin": 1.3, "control": 9.1}'),
('Rhino Plus', 'dr-neubauer-rhino-plus', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Plus", "speed": 6.5, "spin": 1.2, "control": 9.2}'),
('Transformer', 'der-materialspezialist-transformer', 'rubber', 'anti', 'Der Materialspezialist', 
 '{"topsheet": "Anti-Spin", "sponge": "Transform", "speed": 6.0, "spin": 0.5, "control": 9.5}'),
('A-B-S 2', 'dr-neubauer-abs-2', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Standard", "speed": 6.2, "spin": 1.0, "control": 9.3}'),
('Tenaxx', 'pimplepark-tenaxx', 'rubber', 'anti', 'PimplePark', 
 '{"topsheet": "Anti-Spin", "sponge": "Medium", "speed": 6.5, "spin": 1.8, "control": 9.0}'),
('New Anti Spin', 'armstrong-new-anti-spin', 'rubber', 'anti', 'Armstrong', 
 '{"topsheet": "Anti-Spin", "sponge": "New Formula", "speed": 6.3, "spin": 1.5, "control": 9.1}'),
('Super Stop', 'sauer-troger-super-stop', 'rubber', 'anti', 'Sauer & Troger', 
 '{"topsheet": "Anti-Spin", "sponge": "Super", "speed": 5.5, "spin": 0.5, "control": 9.8}'),
('Antipower', 'yasaka-antipower', 'rubber', 'anti', 'Yasaka', 
 '{"topsheet": "Anti-Spin", "sponge": "Power", "speed": 6.8, "spin": 1.5, "control": 9.0}'),
('Neo Anti', 'juic-neo-anti', 'rubber', 'anti', 'JUIC', 
 '{"topsheet": "Anti-Spin", "sponge": "Neo", "speed": 6.0, "spin": 1.0, "control": 9.3}'),
('Buffalo Plus', 'dr-neubauer-buffalo-plus', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Plus", "speed": 6.5, "spin": 1.3, "control": 9.2}'),
('Ellen Off', 'tibhar-ellen-off', 'rubber', 'anti', 'Tibhar', 
 '{"topsheet": "Anti-Spin", "sponge": "Offensive", "speed": 7.2, "spin": 2.0, "control": 8.8}'),
('Alligator Anti', 'donic-alligator-anti', 'rubber', 'anti', 'Donic', 
 '{"topsheet": "Anti-Spin", "sponge": "Standard", "speed": 6.5, "spin": 1.5, "control": 9.1}'),
('Best Anti', 'nittaku-best-anti', 'rubber', 'anti', 'Nittaku', 
 '{"topsheet": "Anti-Spin", "sponge": "Best", "speed": 6.8, "spin": 1.8, "control": 9.0}'),
('Django', 'dr-neubauer-django', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Soft", "speed": 5.8, "spin": 0.8, "control": 9.5}'),
('Power Attack', 'dr-neubauer-power-attack', 'rubber', 'anti', 'Dr. Neubauer', 
 '{"topsheet": "Anti-Spin", "sponge": "Attack", "speed": 7.5, "spin": 2.2, "control": 8.5}'),
('Gigant', 'spinlord-gigant', 'rubber', 'anti', 'SpinLord', 
 '{"topsheet": "Anti-Spin", "sponge": "Gigant", "speed": 6.0, "spin": 1.0, "control": 9.3}'),
('Gigant II', 'spinlord-gigant-ii', 'rubber', 'anti', 'SpinLord', 
 '{"topsheet": "Anti-Spin", "sponge": "Gigant II", "speed": 6.2, "spin": 1.2, "control": 9.2}'),
('Sandwind', 'spinlord-sandwind', 'rubber', 'anti', 'SpinLord', 
 '{"topsheet": "Anti-Spin", "sponge": "Wind", "speed": 5.8, "spin": 0.8, "control": 9.4}');

-- Insert equipment (long pips rubbers - excluding acid green variants and color variants)
INSERT INTO equipment (name, slug, category, subcategory, manufacturer, specifications) VALUES
('CWX', 'joola-cwx', 'rubber', 'long_pips', 'JOOLA', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.2, "spin": 9.1, "control": 8.8}'),
('Piranja', 'donic-piranja', 'rubber', 'long_pips', 'Donic', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.5, "spin": 9.0, "control": 8.7}'),
('Trouble Maker Reloaded', 'dr-neubauer-trouble-maker-reloaded', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Reloaded", "speed": 4.0, "spin": 9.3, "control": 9.0}'),
('Aggressor Evo', 'dr-neubauer-aggressor-evo', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Evolution", "speed": 4.8, "spin": 8.8, "control": 8.5}'),
('Aggressor PRO', 'dr-neubauer-aggressor-pro', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Professional", "speed": 4.9, "spin": 8.7, "control": 8.4}'),
('Trouble Maker', 'dr-neubauer-trouble-maker', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Standard", "speed": 3.8, "spin": 9.4, "control": 9.1}'),
('K.O. Extreme', 'dr-neubauer-ko-extreme', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Extreme", "speed": 3.5, "spin": 9.6, "control": 9.3}'),
('K.O. PRO', 'dr-neubauer-ko-pro', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Professional", "speed": 3.7, "spin": 9.5, "control": 9.2}'),
('Desperado 2', 'dr-neubauer-desperado-2', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Version 2", "speed": 4.3, "spin": 9.0, "control": 8.8}'),
('Aggressor', 'dr-neubauer-aggressor', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Standard", "speed": 4.7, "spin": 8.9, "control": 8.6}'),
('Rasant Chaos', 'andro-rasant-chaos', 'rubber', 'long_pips', 'Andro', 
 '{"topsheet": "Long Pips", "sponge": "Chaos", "speed": 4.5, "spin": 9.2, "control": 8.7}'),
('Allround Premium 2', 'dr-neubauer-allround-premium-2', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Premium", "speed": 4.2, "spin": 8.8, "control": 9.0}'),
('Desperado Reloaded', 'dr-neubauer-desperado-reloaded', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Reloaded", "speed": 4.4, "spin": 8.9, "control": 8.9}'),
('Punch', 'dr-neubauer-punch', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Hard", "speed": 5.0, "spin": 8.5, "control": 8.2}'),
('DO Knuckle Long 1', 'nittaku-do-knuckle-long-1', 'rubber', 'long_pips', 'Nittaku', 
 '{"topsheet": "Long Pips", "sponge": "Knuckle", "speed": 4.0, "spin": 9.0, "control": 8.9}'),
('Grass D.TecS GS', 'tibhar-grass-dtecs-gs', 'rubber', 'long_pips', 'Tibhar', 
 '{"topsheet": "Long Pips", "sponge": "GS Technology", "speed": 4.2, "spin": 9.6, "control": 9.1}'),
('Curl P2V', 'victas-curl-p2v', 'rubber', 'long_pips', 'Victas', 
 '{"topsheet": "Long Pips", "sponge": "Medium Soft", "speed": 4.3, "spin": 8.9, "control": 8.9}'),
('Viper', 'dr-neubauer-viper', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Medium", "speed": 4.1, "spin": 9.1, "control": 9.0}'),
('Diamant', 'dr-neubauer-diamant', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Diamond", "speed": 3.8, "spin": 9.3, "control": 9.2}'),
('Long Pimple Defence', 'armstrong-long-pimple-defence', 'rubber', 'long_pips', 'Armstrong', 
 '{"topsheet": "Long Pips", "sponge": "Defence", "speed": 3.5, "spin": 9.4, "control": 9.3}'),
('Hellfire X', 'sauer-troger-hellfire-x', 'rubber', 'long_pips', 'Sauer & Troger', 
 '{"topsheet": "Long Pips", "sponge": "Hellfire X", "speed": 4.8, "spin": 8.7, "control": 8.4}'),
('Nr.1', 'dr-neubauer-nr1', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Classic", "speed": 4.0, "spin": 9.2, "control": 9.1}'),
('Gangster', 'dr-neubauer-gangster', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Hard", "speed": 4.6, "spin": 8.8, "control": 8.5}'),
('Curl P3V', 'victas-curl-p3v', 'rubber', 'long_pips', 'Victas', 
 '{"topsheet": "Long Pips", "sponge": "Medium", "speed": 4.6, "spin": 8.7, "control": 8.7}'),
('Piranja CD', 'donic-piranja-cd', 'rubber', 'long_pips', 'Donic', 
 '{"topsheet": "Long Pips", "sponge": "CD Technology", "speed": 4.3, "spin": 9.1, "control": 8.8}'),
('Monster Classic', 'dr-neubauer-monster-classic', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Classic", "speed": 3.9, "spin": 9.3, "control": 9.0}'),
('Brutal', 'metall-tt-brutal', 'rubber', 'long_pips', 'Metall TT', 
 '{"topsheet": "Long Pips", "sponge": "Brutal", "speed": 4.5, "spin": 8.9, "control": 8.3}'),
('Hellfire', 'sauer-troger-hellfire', 'rubber', 'long_pips', 'Sauer & Troger', 
 '{"topsheet": "Long Pips", "sponge": "Hellfire", "speed": 4.7, "spin": 8.8, "control": 8.5}'),
('Death', 'metall-tt-death', 'rubber', 'long_pips', 'Metall TT', 
 '{"topsheet": "Long Pips", "sponge": "Death", "speed": 4.2, "spin": 9.0, "control": 8.6}'),
('Schmerz', 'sauer-troger-schmerz', 'rubber', 'long_pips', 'Sauer & Troger', 
 '{"topsheet": "Long Pips", "sponge": "Schmerz", "speed": 4.0, "spin": 9.2, "control": 8.8}'),
('Wobbler', 'pimplepark-wobbler', 'rubber', 'long_pips', 'PimplePark', 
 '{"topsheet": "Long Pips", "sponge": "Wobble", "speed": 3.8, "spin": 9.4, "control": 9.1}'),
('Moristo LP One', 'nittaku-moristo-lp-one', 'rubber', 'long_pips', 'Nittaku', 
 '{"topsheet": "Long Pips", "sponge": "LP One", "speed": 4.1, "spin": 9.0, "control": 8.9}'),
('Feint Long III', 'butterfly-feint-long-iii', 'rubber', 'long_pips', 'Butterfly', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.0, "spin": 9.5, "control": 8.9}'),
('Phantom 0011', 'yasaka-phantom-0011', 'rubber', 'long_pips', 'Yasaka', 
 '{"topsheet": "Long Pips", "sponge": "Soft", "speed": 4.5, "spin": 9.2, "control": 8.8}'),
('Super Kim', 'yinhe-galaxy-milkyway-super-kim', 'rubber', 'long_pips', 'Yinhe (Galaxy/Milkyway)', 
 '{"topsheet": "Long Pips", "sponge": "Super", "speed": 4.3, "spin": 9.0, "control": 8.7}'),
('Keiler II', 'spinlord-keiler-ii', 'rubber', 'long_pips', 'SpinLord', 
 '{"topsheet": "Long Pips", "sponge": "Version II", "speed": 4.6, "spin": 8.8, "control": 8.5}'),
('Alligator Def', 'donic-alligator-def', 'rubber', 'long_pips', 'Donic', 
 '{"topsheet": "Long Pips", "sponge": "Defence", "speed": 3.8, "spin": 9.3, "control": 9.1}'),
('Hipster', 'sauer-troger-hipster', 'rubber', 'long_pips', 'Sauer & Troger', 
 '{"topsheet": "Long Pips", "sponge": "Hipster", "speed": 4.2, "spin": 8.9, "control": 8.8}'),
('Phantom 0012', 'yasaka-phantom-0012', 'rubber', 'long_pips', 'Yasaka', 
 '{"topsheet": "Long Pips", "sponge": "Medium", "speed": 4.4, "spin": 9.1, "control": 8.7}'),
('955 Euro', 'yinhe-galaxy-milkyway-955-euro', 'rubber', 'long_pips', 'Yinhe (Galaxy/Milkyway)', 
 '{"topsheet": "Long Pips", "sponge": "Euro", "speed": 4.2, "spin": 9.2, "control": 8.9}'),
('Orkan II', 'spinlord-orkan-ii', 'rubber', 'long_pips', 'SpinLord', 
 '{"topsheet": "Long Pips", "sponge": "Orkan II", "speed": 4.5, "spin": 8.9, "control": 8.6}'),
('Boomerang Classic', 'dr-neubauer-boomerang-classic', 'rubber', 'long_pips', 'Dr. Neubauer', 
 '{"topsheet": "Long Pips", "sponge": "Classic", "speed": 4.0, "spin": 9.1, "control": 8.9}'),
('Sternenfall Pro Version', 'spinlord-sternenfall-pro-version', 'rubber', 'long_pips', 'SpinLord', 
 '{"topsheet": "Long Pips", "sponge": "Pro", "speed": 4.3, "spin": 9.0, "control": 8.8}'),
('Tokkan', 'neottec-tokkan', 'rubber', 'long_pips', 'Neottec', 
 '{"topsheet": "Long Pips", "sponge": "Tokkan", "speed": 4.1, "spin": 9.1, "control": 8.8}'),
('Gipfelsturm', 'spinlord-gipfelsturm', 'rubber', 'long_pips', 'SpinLord', 
 '{"topsheet": "Long Pips", "sponge": "Gipfel", "speed": 4.4, "spin": 8.8, "control": 8.7}'),
('955 Euro OX', 'yinhe-galaxy-milkyway-955-euro-ox', 'rubber', 'long_pips', 'Yinhe (Galaxy/Milkyway)', 
 '{"topsheet": "Long Pips", "sponge": "OX", "speed": 3.8, "spin": 9.4, "control": 9.2}'),
('Agenda', 'spinlord-agenda', 'rubber', 'long_pips', 'SpinLord', 
 '{"topsheet": "Long Pips", "sponge": "Agenda", "speed": 4.2, "spin": 9.0, "control": 8.9}');

-- Insert players - Top 25 Men's Singles from ITTF Rankings 2025 Week #24 (most are shakehand attackers)
INSERT INTO players (name, slug, highest_rating, active_years, active, birth_country, represents, playing_style, gender) VALUES
('LIN Shidong', 'lin-shidong', 'WR1', '2019-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'M'),
('WANG Chuqin', 'wang-chuqin', 'WR2', '2017-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'M'),
('Hugo CALDERANO', 'hugo-calderano', 'WR3', '2015-present', true, 'BRA', 'BRA', 'shakehand_attacker', 'M'),
('Tomokazu HARIMOTO', 'tomokazu-harimoto', 'WR4', '2017-present', true, 'JPN', 'JPN', 'shakehand_attacker', 'M'),
('LIANG Jingkun', 'liang-jingkun', 'WR5', '2016-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'M'),
('Truls MOREGARD', 'truls-moregard', 'WR6', '2018-present', true, 'SWE', 'SWE', 'shakehand_attacker', 'M'),
('Felix LEBRUN', 'felix-lebrun', 'WR7', '2020-present', true, 'FRA', 'FRA', 'penhold_rpb', 'M'),
('XIANG Peng', 'xiang-peng', 'WR8', '2018-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'M'),
('Darko JORGIC', 'darko-jorgic', 'WR9', '2016-present', true, 'SLO', 'SLO', 'shakehand_attacker', 'M'),
('LIN Yun-Ju', 'lin-yun-ju', 'WR10', '2017-present', true, 'TPE', 'TPE', 'shakehand_attacker', 'M'),
('Alexis LEBRUN', 'alexis-lebrun', 'WR11', '2020-present', true, 'FRA', 'FRA', 'shakehand_attacker', 'M'),
('Dang QIU', 'dang-qiu', 'WR12', '2015-present', true, 'GER', 'GER', 'penhold_rpb', 'M'),
('Patrick FRANZISKA', 'patrick-franziska', 'WR13', '2010-present', true, 'GER', 'GER', 'shakehand_attacker', 'M'),
('Anton KALLBERG', 'anton-kallberg', 'WR14', '2016-present', true, 'SWE', 'SWE', 'shakehand_attacker', 'M'),
('Benedikt DUDA', 'benedikt-duda', 'WR15', '2014-present', true, 'GER', 'GER', 'shakehand_attacker', 'M'),
('LIN Gaoyuan', 'lin-gaoyuan', 'WR16', '2014-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'M'),
('AN Jaehyun', 'an-jaehyun', 'WR17', '2018-present', true, 'KOR', 'KOR', 'shakehand_attacker', 'M'),
('JANG Woojin', 'jang-woojin', 'WR18', '2014-present', true, 'KOR', 'KOR', 'shakehand_attacker', 'M'),
('OH Junsung', 'oh-junsung', 'WR19', '2017-present', true, 'KOR', 'KOR', 'shakehand_attacker', 'M'),
('Sora MATSUSHIMA', 'sora-matsushima', 'WR20', '2019-present', true, 'JPN', 'JPN', 'shakehand_attacker', 'M'),
('Dimitrij OVTCHAROV', 'dimitrij-ovtcharov', 'WR21', '2007-present', true, 'UKR', 'GER', 'shakehand_attacker', 'M'),
('Anders LIND', 'anders-lind', 'WR22', '2016-present', true, 'DEN', 'DEN', 'shakehand_attacker', 'M'),
('Omar ASSAR', 'omar-assar', 'WR23', '2012-present', true, 'EGY', 'EGY', 'shakehand_attacker', 'M'),
('Jonathan GROTH', 'jonathan-groth', 'WR24', '2011-present', true, 'DEN', 'DEN', 'shakehand_attacker', 'M'),
('KAO Cheng-Jui', 'kao-cheng-jui', 'WR25', '2018-present', true, 'TPE', 'TPE', 'shakehand_attacker', 'M'),

-- Top 25 Women's Singles from ITTF Rankings 2025 Week #24 (with playing styles)
('SUN Yingsha', 'sun-yingsha', 'WR1', '2017-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'F'),
('WANG Manyu', 'wang-manyu', 'WR2', '2016-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'F'),
('CHEN Xingtong', 'chen-xingtong', 'WR3', '2015-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'F'),
('WANG Yidi', 'wang-yidi', 'WR4', '2016-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'F'),
('KUAI Man', 'kuai-man', 'WR5', '2018-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'F'),
('Miwa HARIMOTO', 'miwa-harimoto', 'WR6', '2018-present', true, 'JPN', 'JPN', 'shakehand_attacker', 'F'),
('Mima ITO', 'mima-ito', 'WR7', '2014-present', true, 'JPN', 'JPN', 'short_pips_hitter', 'F'),
('Satsuki ODO', 'satsuki-odo', 'WR8', '2019-present', true, 'JPN', 'JPN', 'shakehand_attacker', 'F'),
('Hina HAYATA', 'hina-hayata', 'WR9', '2016-present', true, 'JPN', 'JPN', 'shakehand_attacker', 'F'),
('SHIN Yubin', 'shin-yubin', 'WR10', '2019-present', true, 'KOR', 'KOR', 'shakehand_attacker', 'F'),
('CHENG I-Ching', 'cheng-i-ching', 'WR11', '2017-present', true, 'TPE', 'TPE', 'shakehand_attacker', 'F'),
('Bernadette SZOCS', 'bernadette-szocs', 'WR12', '2014-present', true, 'ROU', 'ROU', 'shakehand_attacker', 'F'),
('Honoka HASHIMOTO', 'honoka-hashimoto', 'WR13', '2019-present', true, 'JPN', 'JPN', 'classical_defender', 'F'),
('Sofia POLCANOVA', 'sofia-polcanova', 'WR14', '2015-present', true, 'AUT', 'AUT', 'shakehand_attacker', 'F'),
('QIAN Tianyi', 'qian-tianyi', 'WR15', '2018-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'F'),
('Bruna TAKAHASHI', 'bruna-takahashi', 'WR16', '2016-present', true, 'BRA', 'BRA', 'shakehand_attacker', 'F'),
('Adriana DIAZ', 'adriana-diaz', 'WR17', '2017-present', true, 'PUR', 'PUR', 'shakehand_attacker', 'F'),
('ZHU Yuling', 'zhu-yuling', 'WR18', '2015-present', true, 'MAC', 'MAC', 'shakehand_attacker', 'F'),
('CHEN Yi', 'chen-yi', 'WR19', '2018-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'F'),
('SHI Xunyao', 'shi-xunyao', 'WR20', '2019-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'F'),
('Miu HIRANO', 'miu-hirano', 'WR21', '2016-present', true, 'JPN', 'JPN', 'shakehand_attacker', 'F'),
('HE Zhuojia', 'he-zhuojia', 'WR22', '2018-present', true, 'CHN', 'CHN', 'shakehand_attacker', 'F'),
('Prithika PAVADE', 'prithika-pavade', 'WR23', '2019-present', true, 'FRA', 'FRA', 'shakehand_attacker', 'F'),
('Miyuu KIHARA', 'miyuu-kihara', 'WR24', '2020-present', true, 'JPN', 'JPN', 'shakehand_attacker', 'F'),
('Hana GODA', 'hana-goda', 'WR25', '2018-present', true, 'EGY', 'EGY', 'shakehand_attacker', 'F');

-- Get IDs for equipment setups (we'll use these in the next inserts)
-- Note: In a real seed script, you'd typically handle this differently, but for simplicity we'll use subqueries

-- Insert player equipment setups for top players
INSERT INTO player_equipment_setups (player_id, year, blade_id, forehand_rubber_id, forehand_thickness, forehand_color, backhand_rubber_id, backhand_thickness, backhand_color, source_type, verified) VALUES
-- LIN Shidong setup
((SELECT id FROM players WHERE slug = 'lin-shidong'), 2024, 
 (SELECT id FROM equipment WHERE slug = 'butterfly-timo-boll-alc'),
 (SELECT id FROM equipment WHERE slug = 'dhs-neo-hurricane-3'), '2.15mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-05'), '2.1mm', 'black',
 'tournament_footage', true),
 
-- WANG Chuqin setup
((SELECT id FROM players WHERE slug = 'wang-chuqin'), 2024,
 (SELECT id FROM equipment WHERE slug = 'butterfly-viscaria'),
 (SELECT id FROM equipment WHERE slug = 'dhs-neo-hurricane-3'), '2.15mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-05'), '2.1mm', 'black',
 'official_website', true),

-- Hugo CALDERANO setup
((SELECT id FROM players WHERE slug = 'hugo-calderano'), 2024,
 (SELECT id FROM equipment WHERE slug = 'butterfly-viscaria'),
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-05'), '2.1mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-64'), '2.1mm', 'black',
 'official_website', true),

-- Tomokazu HARIMOTO setup
((SELECT id FROM players WHERE slug = 'tomokazu-harimoto'), 2024,
 (SELECT id FROM equipment WHERE slug = 'butterfly-timo-boll-alc'),
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-05'), '2.1mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-64'), '2.1mm', 'black',
 'interview', true),

-- Dimitrij OVTCHAROV setup
((SELECT id FROM players WHERE slug = 'dimitrij-ovtcharov'), 2024,
 (SELECT id FROM equipment WHERE slug = 'donic-waldner-senso-carbon'),
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-05'), '2.1mm', 'red',
 (SELECT id FROM equipment WHERE slug = 'butterfly-tenergy-64'), '2.1mm', 'black',
 'official_website', true);

-- Insert sample equipment reviews (we'll need actual user IDs, but for now we'll create some dummy ones)
-- Note: In production, these would be real authenticated users

-- Create some test users first (these would normally be created through auth)
-- We'll skip this for now as it requires actual Supabase auth setup

-- Insert player sponsorships
INSERT INTO player_sponsorships (player_id, sponsor_name, start_year, end_year) VALUES
((SELECT id FROM players WHERE slug = 'lin-shidong'), 'Butterfly', 2020, NULL),
((SELECT id FROM players WHERE slug = 'wang-chuqin'), 'Stiga', 2018, NULL),
((SELECT id FROM players WHERE slug = 'hugo-calderano'), 'Butterfly', 2016, NULL),
((SELECT id FROM players WHERE slug = 'tomokazu-harimoto'), 'Butterfly', 2017, NULL),
((SELECT id FROM players WHERE slug = 'dimitrij-ovtcharov'), 'Donic', 2015, NULL);

-- Insert player footage
INSERT INTO player_footage (player_id, url, title, platform, active) VALUES
((SELECT id FROM players WHERE slug = 'lin-shidong'), 'https://youtube.com/watch?v=example1', 'LIN Shidong vs WANG Chuqin - WTT Finals 2024', 'youtube', true),
((SELECT id FROM players WHERE slug = 'wang-chuqin'), 'https://youtube.com/watch?v=example2', 'WANG Chuqin Training Session', 'youtube', true),
((SELECT id FROM players WHERE slug = 'hugo-calderano'), 'https://youtube.com/watch?v=example3', 'Hugo CALDERANO Equipment Review', 'youtube', true),
((SELECT id FROM players WHERE slug = 'tomokazu-harimoto'), 'https://youtube.com/watch?v=example4', 'Tomokazu HARIMOTO Highlights', 'youtube', true),
((SELECT id FROM players WHERE slug = 'dimitrij-ovtcharov'), 'https://youtube.com/watch?v=example5', 'Dimitrij OVTCHAROV Forehand Analysis', 'youtube', true);

-- Insert site content (text snippets used across the application)
INSERT INTO site_content (key, content, description, category) VALUES
-- Homepage Hero & Main Sections
('homepage.hero.subtitle', 'Discover the gear that powers professional players', 'Main hero section subtitle on homepage', 'homepage'),
('homepage.featured_equipment.subtitle', 'Professional-grade equipment trusted by top players', 'Featured Equipment section description', 'homepage'),
('homepage.popular_players.subtitle', 'Explore setups used by professional players', 'Popular Players section description', 'homepage'),
('homepage.categories.subtitle', 'Explore different types of table tennis equipment', 'Equipment Categories section description', 'homepage'),
('homepage.categories.blade.description', 'The foundation of your game. Discover blades for every playing style.', 'Blade category description in homepage categories', 'homepage'),
('homepage.categories.inverted_rubber.description', 'Most popular rubber type offering great spin and control for all skill levels.', 'Inverted rubber category description', 'homepage'),
('homepage.categories.long_pips.description', 'Defensive rubber that reverses spin and creates unpredictable effects.', 'Long pips category description', 'homepage'),
('homepage.categories.short_pips.description', 'Fast attacking rubber with minimal spin for aggressive close-to-table play.', 'Short pips category description', 'homepage'),
('homepage.categories.anti_spin.description', 'Specialized rubber that neutralizes opponent''s spin for control-based play.', 'Anti-spin category description', 'homepage'),

-- Equipment Pages
('equipment.page.description', 'Comprehensive reviews of professional table tennis equipment', 'Main description for equipment index page', 'equipment'),
('equipment.expand_database.title', 'Help Expand Our Equipment Database', 'Title for equipment submission CTA section', 'equipment'),
('equipment.expand_database.description', 'Create an account or log in to submit new equipment and contribute to our growing community.', 'Description encouraging equipment submissions', 'equipment'),
('equipment.recent_reviews.subtitle', 'Latest equipment reviews from our community', 'Subtitle for recent reviews section on equipment page', 'equipment'),
('equipment.submit.description', 'Help expand our equipment database by submitting new table tennis equipment.', 'Description on equipment submission form page', 'equipment'),
('equipment.submit.upload_help', 'Upload a clear photo of the equipment. This helps with identification and moderation.', 'Help text for image upload in equipment form', 'equipment'),
('equipment.submit.specifications_placeholder', 'Any additional details about the equipment (e.g., speed, spin, control ratings, weight, etc.)', 'Placeholder text for specifications field', 'equipment'),
('equipment.submit.loading_message', 'Please wait while we submit your equipment to our database...', 'Loading message during equipment submission', 'equipment'),
('equipment.submit.success_message', 'Your equipment has been successfully submitted and will be reviewed by our team. Thank you for contributing to our database!', 'Success message after equipment submission', 'equipment'),

-- Player Database
('players.page.description', 'Discover the equipment setups and playing styles of professional table tennis players from around the world. Learn what gear the pros use to dominate at the highest level.', 'Main description for players index page', 'players'),
('players.expand_database.title', 'Help Expand Our Player Database', 'Title for player submission CTA section', 'players'),
('players.expand_database.description', 'Create an account or log in to submit a new player and contribute to our growing community.', 'Description encouraging player submissions', 'players'),
('players.submit.description', 'Help expand our player database by submitting professional table tennis players.', 'Description on player submission form page', 'players'),
('players.submit.loading_message', 'Please wait while we submit the player to our database...', 'Loading message during player submission', 'players'),
('players.submit.success_message', 'Your player has been successfully submitted and will be reviewed by our team. Thank you for contributing to our database!', 'Success message after player submission', 'players'),

-- Search & Discovery
('search.landing.description', 'Search our comprehensive database of equipment reviews and professional player setups. Find the perfect gear for your playing style.', 'Description on search landing page', 'search'),
('search.no_results.description', 'We couldn''t find anything matching your search. Try adjusting your search terms or browse our categories below.', 'Description shown when no search results found', 'search'),
('search.popular_searches.label', 'Popular searches:', 'Label for popular searches section', 'search'),

-- Authentication & Onboarding
('login.welcome_subtitle', 'Sign in to your account or create a new one', 'Subtitle on login page welcome section', 'auth'),
('login.explore_prompt', 'New to table tennis equipment reviews?', 'Text prompting new users to explore on login page', 'auth'),
('login.explore_description', 'Explore our reviews and discover the gear used by professional players.', 'Description encouraging exploration for new users', 'auth'),

-- Form Help Text & Guidance
('forms.subcategory_help', 'Select subcategory (optional)', 'Help text for subcategory selection in forms', 'forms'),
('forms.equipment_specifications_help', 'Include any technical specifications, ratings, or notable features of this equipment.', 'Help text for equipment specifications field', 'forms'),
('forms.player_biography_help', 'Include career highlights and notable information about this player.', 'Help text for player biography field', 'forms'),
('forms.image_upload_general_help', 'Upload a clear, high-quality image. This helps with identification and approval.', 'General help text for image uploads', 'forms'),

-- Footer
('footer.tagline', 'Your trusted source for table tennis equipment reviews and player information', 'Main tagline in footer', 'footer'),

-- Equipment Review System
('equipment.reviews.empty_state', 'No reviews yet for this equipment. Be the first to share your experience!', 'Message shown when equipment has no reviews', 'equipment'),
('equipment.reviews.section_subtitle', 'Read what players think about this equipment', 'Subtitle for reviews section on equipment detail pages', 'equipment'),
('equipment.write_review.description', 'Share your experience with this equipment to help other players make informed decisions.', 'Description encouraging users to write reviews', 'equipment'),

-- Profile & User Content
('profile.page_description', 'Manage your account and review your contribution history', 'Description for user profile page', 'profile'),
('profile.submissions.empty_state', 'You haven''t submitted any equipment or players yet. Start contributing to help grow our database!', 'Message when user has no submissions', 'profile'),
('profile.reviews.empty_state', 'You haven''t written any reviews yet. Share your equipment experiences to help other players!', 'Message when user has no reviews', 'profile'),

-- Comparison System
('equipment.comparison.description', 'Compare equipment side-by-side to find the perfect gear for your playing style and preferences.', 'Description for equipment comparison feature', 'equipment'),
('equipment.comparison.empty_state', 'Add equipment to compare their specifications, reviews, and ratings side-by-side.', 'Message when comparison is empty', 'equipment'),

-- Category Landing Pages
('categories.blade.landing_description', 'Discover professional table tennis blades used by top players. Find the perfect blade for your playing style and skill level.', 'Description for blade category landing pages', 'categories'),
('categories.rubber.landing_description', 'Explore table tennis rubbers trusted by professionals. Compare different rubber types to enhance your game.', 'Description for rubber category landing pages', 'categories');

-- BEGIN PHOTO-SOURCING-CREDITS
-- Auto-generated by scripts/photo-sourcing/apply.ts (TT-36). Do not
-- edit by hand — re-run `npm run sourcing:apply` to refresh this block.
-- Pairs with normalised webps under supabase/seed-images/.

-- players
UPDATE players SET
  image_key = 'player/adriana-diaz/seed.webp',
  image_etag = '311d5e31a8b2',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=115009'
WHERE slug = 'adriana-diaz';
UPDATE players SET
  image_key = 'player/alexis-lebrun/seed.webp',
  image_etag = 'cd8ad04f3212',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=132992'
WHERE slug = 'alexis-lebrun';
UPDATE players SET
  image_key = 'player/an-jaehyun/seed.webp',
  image_etag = '48a6b9683088',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=121514'
WHERE slug = 'an-jaehyun';
UPDATE players SET
  image_key = 'player/anders-lind/seed.webp',
  image_etag = '83030cea181c',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=115029'
WHERE slug = 'anders-lind';
UPDATE players SET
  image_key = 'player/anton-kallberg/seed.webp',
  image_etag = '5af9a8eab793',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=116853'
WHERE slug = 'anton-kallberg';
UPDATE players SET
  image_key = 'player/benedikt-duda/seed.webp',
  image_etag = '886ddb148980',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=116620'
WHERE slug = 'benedikt-duda';
UPDATE players SET
  image_key = 'player/bernadette-szocs/seed.webp',
  image_etag = 'f854284701c6',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=111012'
WHERE slug = 'bernadette-szocs';
UPDATE players SET
  image_key = 'player/bruna-takahashi/seed.webp',
  image_etag = '9dc3b3393991',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=121623'
WHERE slug = 'bruna-takahashi';
UPDATE players SET
  image_key = 'player/chen-xingtong/seed.webp',
  image_etag = 'a249c6f76778',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=121403'
WHERE slug = 'chen-xingtong';
UPDATE players SET
  image_key = 'player/chen-yi/seed.webp',
  image_etag = '83389d7b9fc6',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=132132'
WHERE slug = 'chen-yi';
UPDATE players SET
  image_key = 'player/cheng-i-ching/seed.webp',
  image_etag = '9a99e011272c',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=110797'
WHERE slug = 'cheng-i-ching';
UPDATE players SET
  image_key = 'player/dang-qiu/seed.webp',
  image_etag = '749952fbe12f',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=114715'
WHERE slug = 'dang-qiu';
UPDATE players SET
  image_key = 'player/darko-jorgic/seed.webp',
  image_etag = '5f85e3dea261',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=118927'
WHERE slug = 'darko-jorgic';
UPDATE players SET
  image_key = 'player/dimitrij-ovtcharov/seed.webp',
  image_etag = 'fd5c0c08cae1',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=107028'
WHERE slug = 'dimitrij-ovtcharov';
UPDATE players SET
  image_key = 'player/felix-lebrun/seed.webp',
  image_etag = '0bf551ef2aaa',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=135977'
WHERE slug = 'felix-lebrun';
UPDATE players SET
  image_key = 'player/hana-goda/seed.webp',
  image_etag = 'e806ae8456a4',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=131335'
WHERE slug = 'hana-goda';
UPDATE players SET
  image_key = 'player/he-zhuojia/seed.webp',
  image_etag = 'c1e812ae76e8',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=119730'
WHERE slug = 'he-zhuojia';
UPDATE players SET
  image_key = 'player/hina-hayata/seed.webp',
  image_etag = '95d988cb0f31',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=123672'
WHERE slug = 'hina-hayata';
UPDATE players SET
  image_key = 'player/honoka-hashimoto/seed.webp',
  image_etag = 'b8f7fc44c646',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=133000'
WHERE slug = 'honoka-hashimoto';
UPDATE players SET
  image_key = 'player/hugo-calderano/seed.webp',
  image_etag = '702bf521e151',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=115641'
WHERE slug = 'hugo-calderano';
UPDATE players SET
  image_key = 'player/jang-woojin/seed.webp',
  image_etag = '5f5292361197',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=114936'
WHERE slug = 'jang-woojin';
UPDATE players SET
  image_key = 'player/jonathan-groth/seed.webp',
  image_etag = 'e7ef8ac04dd0',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=112409'
WHERE slug = 'jonathan-groth';
UPDATE players SET
  image_key = 'player/kao-cheng-jui/seed.webp',
  image_etag = '4cc7ab25bce1',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=132824'
WHERE slug = 'kao-cheng-jui';
UPDATE players SET
  image_key = 'player/kuai-man/seed.webp',
  image_etag = '158f11a3a191',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=135049'
WHERE slug = 'kuai-man';
UPDATE players SET
  image_key = 'player/liang-jingkun/seed.webp',
  image_etag = '159aaa80efcc',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=119588'
WHERE slug = 'liang-jingkun';
UPDATE players SET
  image_key = 'player/lin-gaoyuan/seed.webp',
  image_etag = '3fde13df8696',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=115910'
WHERE slug = 'lin-gaoyuan';
UPDATE players SET
  image_key = 'player/lin-shidong/seed.webp',
  image_etag = '4be2de17a866',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=137237'
WHERE slug = 'lin-shidong';
UPDATE players SET
  image_key = 'player/lin-yun-ju/seed.webp',
  image_etag = 'eb17bc0fa67b',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=121582'
WHERE slug = 'lin-yun-ju';
UPDATE players SET
  image_key = 'player/mima-ito/seed.webp',
  image_etag = 'adadf3f9d8bf',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=117821'
WHERE slug = 'mima-ito';
UPDATE players SET
  image_key = 'player/miu-hirano/seed.webp',
  image_etag = 'e3d7f0b6d2ee',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=117820'
WHERE slug = 'miu-hirano';
UPDATE players SET
  image_key = 'player/miwa-harimoto/seed.webp',
  image_etag = '8ba9885d0be3',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=136711'
WHERE slug = 'miwa-harimoto';
UPDATE players SET
  image_key = 'player/miyuu-kihara/seed.webp',
  image_etag = '02a456d09ec8',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=131036'
WHERE slug = 'miyuu-kihara';
UPDATE players SET
  image_key = 'player/oh-junsung/seed.webp',
  image_etag = '5db30b656763',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=135367'
WHERE slug = 'oh-junsung';
UPDATE players SET
  image_key = 'player/omar-assar/seed.webp',
  image_etag = '954ed4a781fb',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=100696'
WHERE slug = 'omar-assar';
UPDATE players SET
  image_key = 'player/patrick-franziska/seed.webp',
  image_etag = '1db255a8a94a',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=102832'
WHERE slug = 'patrick-franziska';
UPDATE players SET
  image_key = 'player/prithika-pavade/seed.webp',
  image_etag = '8082ec44e112',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=131100'
WHERE slug = 'prithika-pavade';
UPDATE players SET
  image_key = 'player/qian-tianyi/seed.webp',
  image_etag = 'ea9181a6da24',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=119797'
WHERE slug = 'qian-tianyi';
UPDATE players SET
  image_key = 'player/satsuki-odo/seed.webp',
  image_etag = '19796f0e2171',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=133405'
WHERE slug = 'satsuki-odo';
UPDATE players SET
  image_key = 'player/shi-xunyao/seed.webp',
  image_etag = 'ee45e07b6249',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=123120'
WHERE slug = 'shi-xunyao';
UPDATE players SET
  image_key = 'player/shin-yubin/seed.webp',
  image_etag = '24dde722266b',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=123977'
WHERE slug = 'shin-yubin';
UPDATE players SET
  image_key = 'player/sofia-polcanova/seed.webp',
  image_etag = '6a72989ef9b9',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=107477'
WHERE slug = 'sofia-polcanova';
UPDATE players SET
  image_key = 'player/sora-matsushima/seed.webp',
  image_etag = '8d2726d79dbd',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=135996'
WHERE slug = 'sora-matsushima';
UPDATE players SET
  image_key = 'player/sun-yingsha/seed.webp',
  image_etag = 'd1d2a301b2a1',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=131163'
WHERE slug = 'sun-yingsha';
UPDATE players SET
  image_key = 'player/tomokazu-harimoto/seed.webp',
  image_etag = '8c7ae849d893',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=123980'
WHERE slug = 'tomokazu-harimoto';
UPDATE players SET
  image_key = 'player/truls-moregard/seed.webp',
  image_etag = '49e052e5f159',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=122044'
WHERE slug = 'truls-moregard';
UPDATE players SET
  image_key = 'player/wang-chuqin/seed.webp',
  image_etag = '5368d75f4ea0',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=121558'
WHERE slug = 'wang-chuqin';
UPDATE players SET
  image_key = 'player/wang-manyu/seed.webp',
  image_etag = 'f8dad65a4390',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=121411'
WHERE slug = 'wang-manyu';
UPDATE players SET
  image_key = 'player/wang-yidi/seed.webp',
  image_etag = 'e8fc9ee0069f',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=124110'
WHERE slug = 'wang-yidi';
UPDATE players SET
  image_key = 'player/xiang-peng/seed.webp',
  image_etag = '6f928afef9bb',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=135888'
WHERE slug = 'xiang-peng';
UPDATE players SET
  image_key = 'player/zhu-yuling/seed.webp',
  image_etag = '8f12e000ecf1',
  image_credit_text = 'World Table Tennis',
  image_credit_link = NULL,
  image_license_short = NULL,
  image_license_url = NULL,
  image_source_url = 'https://www.worldtabletennis.com/playerDescription?playerId=117332'
WHERE slug = 'zhu-yuling';

-- END PHOTO-SOURCING-CREDITS


-- BEGIN SPEC-SOURCING
-- Auto-generated by scripts/spec-sourcing/export-seed.ts (TT-151).
-- Do not edit by hand — re-run `npm run sourcing:export-specs` to
-- refresh this block. Each UPDATE is followed by a -- src: comment
-- listing the source URLs the merge picked from.

-- END SPEC-SOURCING
