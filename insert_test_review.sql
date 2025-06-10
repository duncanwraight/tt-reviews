-- Insert test review data for moderation testing

-- First get an equipment ID from existing data
DO $$
DECLARE
    equipment_uuid UUID;
    test_user_id UUID := '12345678-1234-1234-1234-123456789012'; -- Test user ID
BEGIN
    -- Get first equipment ID
    SELECT id INTO equipment_uuid FROM equipment LIMIT 1;
    
    -- If no equipment exists, create one
    IF equipment_uuid IS NULL THEN
        equipment_uuid := gen_random_uuid();
        INSERT INTO equipment (id, name, slug, category, subcategory, manufacturer, specifications) VALUES
        (equipment_uuid, 'Butterfly Tenergy 05', 'butterfly-tenergy-05', 'rubber', 'inverted', 'Butterfly', 
         '{"topsheet": "Spring Sponge", "sponge": "High Tension", "speed": 9.7, "spin": 9.8, "control": 8.3}');
    END IF;
    
    -- Insert test reviews with pending status
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
    ) VALUES 
    (
        gen_random_uuid(),
        equipment_uuid,
        test_user_id,
        'pending',
        8.5,
        '{"speed": 9, "spin": 10, "control": 8, "feeling": 8}',
        'This is a test review for moderation. The rubber has excellent spin and decent speed, perfect for loop drives. Control could be better for beginners.',
        '{"playing_level": "Advanced", "style_of_play": "Offensive", "testing_duration": "2 months", "testing_quantity": "Daily", "testing_type": "Match play"}',
        NOW()
    ),
    (
        gen_random_uuid(),
        equipment_uuid,
        test_user_id,
        'pending',
        7.2,
        '{"speed": 7, "spin": 8, "control": 7, "feeling": 6}',
        'Decent rubber but quite expensive for what it offers. The spin is good but not exceptional. Would recommend for intermediate players.',
        '{"playing_level": "Intermediate", "style_of_play": "All-round", "testing_duration": "1 month", "testing_quantity": "Weekly", "testing_type": "Training"}',
        NOW() - INTERVAL '1 day'
    ),
    (
        gen_random_uuid(),
        equipment_uuid,
        test_user_id,
        'pending',
        9.1,
        '{"speed": 10, "spin": 9, "control": 8, "feeling": 9}',
        'Amazing rubber! Best purchase I have made. The speed and spin combination is perfect for aggressive players.',
        '{"playing_level": "Expert", "style_of_play": "Attacking", "testing_duration": "3 months", "testing_quantity": "Daily", "testing_type": "Tournament"}',
        NOW() - INTERVAL '2 hours'
    );
    
    RAISE NOTICE 'Inserted 3 test reviews for equipment: %', equipment_uuid;
    
END $$;