-- Add review_rating_category to the category_type enum
-- This is needed for the equipment review system to store configurable rating categories

ALTER TYPE category_type ADD VALUE 'review_rating_category';