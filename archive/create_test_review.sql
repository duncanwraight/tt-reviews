-- Create test review for moderation
-- First, ensure we have equipment data
INSERT INTO equipment (id, name, slug, category, subcategory, manufacturer, specifications) VALUES
('550e8400-e29b-41d4-a716-446655440000', 'Butterfly Tenergy 05', 'butterfly-tenergy-05', 'rubber', 'inverted', 'Butterfly', 
 '{"topsheet": "Spring Sponge", "sponge": "High Tension", "speed": 9.7, "spin": 9.8, "control": 8.3, "hardness": "36"}')
ON CONFLICT (id) DO NOTHING;

-- Create a test user (you'll need to use your actual user ID from auth.users)
-- Get your user ID by running: SELECT id, email FROM auth.users;

-- Insert test review (replace the user_id with your actual user ID)
-- You can get your user ID from the browser's localStorage session or from auth.users table
INSERT INTO equipment_reviews (
  id,
  equipment_id, 
  user_id, 
  status, 
  overall_rating, 
  category_ratings, 
  review_text, 
  reviewer_context,
  created_at
) VALUES (
  gen_random_uuid(),
  '550e8400-e29b-41d4-a716-446655440000',
  'YOUR_USER_ID_HERE', -- Replace with your actual user ID from auth.users
  'pending',
  8.5,
  '{"speed": 9, "spin": 10, "control": 8, "feeling": 8}',
  'This is a test review for moderation. The rubber has excellent spin and decent speed, perfect for loop drives. Control could be better for beginners.',
  '{"playing_level": "Advanced", "style_of_play": "Offensive", "testing_duration": "2 months", "testing_quantity": "Daily", "testing_type": "Match play"}'::jsonb,
  NOW()
);

-- Insert another test review
INSERT INTO equipment_reviews (
  id,
  equipment_id, 
  user_id, 
  status, 
  overall_rating, 
  category_ratings, 
  review_text, 
  reviewer_context,
  created_at
) VALUES (
  gen_random_uuid(),
  '550e8400-e29b-41d4-a716-446655440000',
  'YOUR_USER_ID_HERE', -- Replace with your actual user ID from auth.users
  'pending',
  7.2,
  '{"speed": 7, "spin": 8, "control": 7, "feeling": 6}',
  'Decent rubber but quite expensive for what it offers. The spin is good but not exceptional.',
  '{"playing_level": "Intermediate", "style_of_play": "All-round", "testing_duration": "1 month", "testing_quantity": "Weekly", "testing_type": "Training"}'::jsonb,
  NOW() - INTERVAL '1 day'
);