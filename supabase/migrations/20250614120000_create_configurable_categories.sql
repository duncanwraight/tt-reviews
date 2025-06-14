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

-- Note: Default categories are seeded in supabase/seed.sql

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