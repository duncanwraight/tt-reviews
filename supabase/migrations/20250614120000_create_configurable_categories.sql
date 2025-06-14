-- Create configurable categories system
-- This allows administrators to manage dropdowns and category options

-- Category types enum
CREATE TYPE category_type AS ENUM (
  'equipment_category',
  'equipment_subcategory', 
  'playing_style',
  'country',
  'rejection_category'
);

-- Main categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type category_type NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  value VARCHAR(255) NOT NULL, -- Used as form value
  display_order INTEGER NOT NULL DEFAULT 0,
  flag_emoji VARCHAR(10), -- For countries
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Ensure unique values within each type/parent combination
CREATE UNIQUE INDEX categories_type_value_parent_unique 
ON categories (type, value, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- Index for performance
CREATE INDEX categories_type_active_order_idx ON categories (type, is_active, display_order);
CREATE INDEX categories_parent_id_idx ON categories (parent_id);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Everyone can read active categories
CREATE POLICY "categories_select_active" ON categories
  FOR SELECT USING (is_active = true);

-- Only admins can modify categories
CREATE POLICY "categories_insert_admin" ON categories
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('admin')
    )
  );

CREATE POLICY "categories_update_admin" ON categories
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('admin')
    )
  );

CREATE POLICY "categories_delete_admin" ON categories
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('admin')
    )
  );

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed default categories
-- Equipment Categories
INSERT INTO categories (type, name, value, display_order) VALUES
  ('equipment_category', 'Blade', 'blade', 1),
  ('equipment_category', 'Rubber', 'rubber', 2);

-- Get the rubber category ID for subcategories
WITH rubber_cat AS (
  SELECT id FROM categories WHERE type = 'equipment_category' AND value = 'rubber'
)
-- Rubber Subcategories
INSERT INTO categories (type, parent_id, name, value, display_order)
SELECT 'equipment_subcategory', rubber_cat.id, name, value, display_order
FROM rubber_cat, (VALUES
  ('Inverted', 'inverted', 1),
  ('Anti-spin', 'anti', 2),
  ('Short Pips', 'short_pips', 3),
  ('Medium Pips', 'medium_pips', 4),
  ('Long Pips', 'long_pips', 5)
) AS subcats(name, value, display_order);

-- Playing Styles
INSERT INTO categories (type, name, value, display_order) VALUES
  ('playing_style', 'Two-winged Attacker', 'two_winged_attacker', 1),
  ('playing_style', 'Penholder (RPB)', 'penholder_rpb', 2),
  ('playing_style', 'Penholder (One-wing)', 'penholder_one_wing', 3),
  ('playing_style', 'Classical Defender', 'classical_defender', 4),
  ('playing_style', 'Modern Defender', 'modern_defender', 5),
  ('playing_style', 'Anti-spin', 'anti_spin', 6),
  ('playing_style', 'Retriever', 'retriever', 7);

-- Countries (major table tennis nations with flags)
INSERT INTO categories (type, name, value, flag_emoji, display_order) VALUES
  ('country', 'China', 'CN', '🇨🇳', 1),
  ('country', 'Japan', 'JP', '🇯🇵', 2),
  ('country', 'Germany', 'DE', '🇩🇪', 3),
  ('country', 'Sweden', 'SE', '🇸🇪', 4),
  ('country', 'South Korea', 'KR', '🇰🇷', 5),
  ('country', 'France', 'FR', '🇫🇷', 6),
  ('country', 'United States', 'US', '🇺🇸', 7),
  ('country', 'Singapore', 'SG', '🇸🇬', 8),
  ('country', 'Chinese Taipei', 'TW', '🇹🇼', 9),
  ('country', 'Hong Kong', 'HK', '🇭🇰', 10),
  ('country', 'England', 'GB', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 11),
  ('country', 'Austria', 'AT', '🇦🇹', 12),
  ('country', 'Brazil', 'BR', '🇧🇷', 13),
  ('country', 'Belgium', 'BE', '🇧🇪', 14),
  ('country', 'Netherlands', 'NL', '🇳🇱', 15),
  ('country', 'Denmark', 'DK', '🇩🇰', 16),
  ('country', 'Czech Republic', 'CZ', '🇨🇿', 17),
  ('country', 'Poland', 'PL', '🇵🇱', 18),
  ('country', 'Romania', 'RO', '🇷🇴', 19),
  ('country', 'Hungary', 'HU', '🇭🇺', 20),
  ('country', 'Belarus', 'BY', '🇧🇾', 21),
  ('country', 'Ukraine', 'UA', '🇺🇦', 22),
  ('country', 'Russia', 'RU', '🇷🇺', 23),
  ('country', 'Portugal', 'PT', '🇵🇹', 24),
  ('country', 'Spain', 'ES', '🇪🇸', 25),
  ('country', 'Italy', 'IT', '🇮🇹', 26),
  ('country', 'Croatia', 'HR', '🇭🇷', 27),
  ('country', 'Slovenia', 'SI', '🇸🇮', 28),
  ('country', 'Luxembourg', 'LU', '🇱🇺', 29),
  ('country', 'India', 'IN', '🇮🇳', 30),
  ('country', 'Australia', 'AU', '🇦🇺', 31),
  ('country', 'Canada', 'CA', '🇨🇦', 32),
  ('country', 'Egypt', 'EG', '🇪🇬', 33),
  ('country', 'Nigeria', 'NG', '🇳🇬', 34),
  ('country', 'Iran', 'IR', '🇮🇷', 35),
  ('country', 'Thailand', 'TH', '🇹🇭', 36),
  ('country', 'Malaysia', 'MY', '🇲🇾', 37),
  ('country', 'Indonesia', 'ID', '🇮🇩', 38),
  ('country', 'Philippines', 'PH', '🇵🇭', 39),
  ('country', 'North Korea', 'KP', '🇰🇵', 40);

-- Rejection Categories
INSERT INTO categories (type, name, value, display_order) VALUES
  ('rejection_category', 'Duplicate Entry', 'duplicate', 1),
  ('rejection_category', 'Insufficient Information', 'insufficient_info', 2),
  ('rejection_category', 'Poor Image Quality', 'poor_image_quality', 3),
  ('rejection_category', 'Inappropriate Content', 'inappropriate_content', 4),
  ('rejection_category', 'Invalid Data', 'invalid_data', 5),
  ('rejection_category', 'Spam', 'spam', 6),
  ('rejection_category', 'Other', 'other', 7);

-- Create helper functions for common queries
CREATE OR REPLACE FUNCTION get_categories_by_type(category_type_param category_type)
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  value VARCHAR(255),
  flag_emoji VARCHAR(10),
  display_order INTEGER
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT c.id, c.name, c.value, c.flag_emoji, c.display_order
  FROM categories c
  WHERE c.type = category_type_param 
    AND c.is_active = true 
    AND c.parent_id IS NULL
  ORDER BY c.display_order, c.name;
$$;

CREATE OR REPLACE FUNCTION get_subcategories_by_parent(parent_category_value VARCHAR(255))
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  value VARCHAR(255),
  display_order INTEGER
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT c.id, c.name, c.value, c.display_order
  FROM categories c
  JOIN categories parent ON c.parent_id = parent.id
  WHERE parent.value = parent_category_value
    AND c.is_active = true
    AND parent.is_active = true
  ORDER BY c.display_order, c.name;
$$;