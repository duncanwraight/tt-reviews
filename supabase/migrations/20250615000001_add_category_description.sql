-- Add description field to categories table
-- This allows categories to have explanatory text that can be shown in UI tooltips

ALTER TABLE categories ADD COLUMN description TEXT;