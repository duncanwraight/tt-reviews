-- Fix updated_by trigger function to be more robust
-- This addresses production errors where tables don't have updated_by columns

-- Create a new robust trigger function that only sets updated_by if the column exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- Only set updated_by if the column exists in the table
  IF TG_TABLE_NAME IN ('categories', 'user_roles') THEN
    NEW.updated_by = auth.uid();
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- The existing triggers will automatically use the updated function
-- No need to recreate triggers as they reference the function by name