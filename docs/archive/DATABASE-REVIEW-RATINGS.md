# Review Rating Categories Database Schema

## Required Database Changes for Equipment-Specific Ratings

### 1. Create Review Rating Categories Table

```sql
CREATE TABLE review_rating_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_type TEXT NOT NULL, -- 'blade', 'rubber', 'ball', etc.
  name TEXT NOT NULL, -- internal field name like 'speed', 'spin', 'control'
  label TEXT NOT NULL, -- display label like 'Speed', 'Spin', 'Control'
  description TEXT, -- optional explanation of what this rating measures
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(equipment_type, name)
);
```

### 2. Update Equipment Reviews Table

```sql
-- Add columns for category ratings (JSON format for flexibility)
ALTER TABLE equipment_reviews 
ADD COLUMN category_ratings JSONB DEFAULT '{}',
-- Update overall rating to 1-10 scale
ADD COLUMN overall_rating_new INTEGER CHECK (overall_rating_new >= 1 AND overall_rating_new <= 10);

-- Migrate existing 1-5 ratings to 1-10 scale
UPDATE equipment_reviews 
SET overall_rating_new = overall_rating * 2 
WHERE overall_rating IS NOT NULL;

-- Drop old column and rename new one
ALTER TABLE equipment_reviews DROP COLUMN overall_rating;
ALTER TABLE equipment_reviews RENAME COLUMN overall_rating_new TO overall_rating;
```

### 3. Seed Rating Categories

```sql
-- Blade rating categories
INSERT INTO review_rating_categories (equipment_type, name, label, description, display_order) VALUES
('blade', 'speed', 'Speed', 'How fast the blade feels during play', 1),
('blade', 'control', 'Control', 'How easy it is to place the ball precisely', 2),
('blade', 'feel', 'Feel', 'The tactile feedback and touch sensation', 3),
('blade', 'consistency', 'Consistency', 'How predictable the blade performs', 4),
('blade', 'power', 'Power', 'Ability to generate powerful shots', 5);

-- Rubber rating categories  
INSERT INTO review_rating_categories (equipment_type, name, label, description, display_order) VALUES
('rubber', 'speed', 'Speed', 'How fast the rubber is for offensive play', 1),
('rubber', 'spin', 'Spin', 'Ability to generate and receive spin', 2),
('rubber', 'control', 'Control', 'Precision and placement capability', 3),
('rubber', 'durability', 'Durability', 'How long the rubber maintains performance', 4),
('rubber', 'tackiness', 'Tackiness', 'Grip level of the rubber surface', 5),
('rubber', 'throw_angle', 'Throw Angle', 'Arc trajectory of the ball', 6);

-- Ball rating categories
INSERT INTO review_rating_categories (equipment_type, name, label, description, display_order) VALUES
('ball', 'bounce_consistency', 'Bounce Consistency', 'Uniformity of ball bounce', 1),
('ball', 'durability', 'Durability', 'How long the ball lasts during play', 2),
('ball', 'feel', 'Feel', 'Touch and impact sensation', 3),
('ball', 'roundness', 'Roundness', 'Spherical precision of the ball', 4);
```

### 4. RLS Policies

```sql
-- Allow read access to rating categories
CREATE POLICY "Allow read access to rating categories" ON review_rating_categories
FOR SELECT USING (true);

-- Admin-only write access
CREATE POLICY "Admin write access to rating categories" ON review_rating_categories
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);
```

## Usage in Application

The new system supports:

1. **Equipment-specific categories**: Different rating aspects based on equipment type
2. **1-10 scale**: More granular ratings than the previous 1-5 scale  
3. **Flexible schema**: JSON storage allows for easy category additions
4. **Good UX**: Star ratings with slider controls for intuitive rating

## Example Category Ratings Data

```json
{
  "speed": 8,
  "spin": 7,
  "control": 9,
  "durability": 6,
  "tackiness": 8,
  "throw_angle": 7
}
```

This will be stored in the `category_ratings` JSONB column alongside the `overall_rating` integer field.