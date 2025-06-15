-- Update category helper functions to include description field

-- Drop existing functions first
DROP FUNCTION IF EXISTS get_categories_by_type(category_type);
DROP FUNCTION IF EXISTS get_subcategories_by_parent(VARCHAR(255));

-- Update get_categories_by_type function
CREATE OR REPLACE FUNCTION get_categories_by_type(category_type_param category_type)
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  value VARCHAR(255),
  flag_emoji VARCHAR(10),
  description TEXT,
  display_order INTEGER
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT c.id, c.name, c.value, c.flag_emoji, c.description, c.display_order
  FROM categories c
  WHERE c.type = category_type_param 
    AND c.is_active = true 
    AND c.parent_id IS NULL
  ORDER BY c.display_order, c.name;
$$;

-- Update get_subcategories_by_parent function
CREATE OR REPLACE FUNCTION get_subcategories_by_parent(parent_category_value VARCHAR(255))
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  value VARCHAR(255),
  description TEXT,
  display_order INTEGER
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT c.id, c.name, c.value, c.description, c.display_order
  FROM categories c
  JOIN categories parent ON c.parent_id = parent.id
  WHERE parent.value = parent_category_value
    AND c.is_active = true
    AND parent.is_active = true
  ORDER BY c.display_order, c.name;
$$;