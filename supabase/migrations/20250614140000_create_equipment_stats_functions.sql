-- Create functions to get equipment with rating and review count statistics

-- Function to get equipment with calculated stats (average rating and review count)
CREATE OR REPLACE FUNCTION get_equipment_with_stats(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID,
    name CHARACTER VARYING(255),
    slug CHARACTER VARYING(255),
    category equipment_category,
    subcategory equipment_subcategory,
    manufacturer CHARACTER VARYING(255),
    specifications JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    averageRating DECIMAL(3,1),
    reviewCount BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.name,
        e.slug,
        e.category,
        e.subcategory,
        e.manufacturer,
        e.specifications,
        e.created_at,
        e.updated_at,
        COALESCE(ROUND(AVG(er.overall_rating), 1), 0.0)::DECIMAL(3,1) AS averageRating,
        COALESCE(COUNT(er.id), 0) AS reviewCount
    FROM equipment e
    LEFT JOIN equipment_reviews er ON e.id = er.equipment_id 
        AND er.status = 'approved'
    GROUP BY e.id, e.name, e.slug, e.category, e.subcategory, e.manufacturer, 
             e.specifications, e.created_at, e.updated_at
    ORDER BY e.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get popular equipment (sorted by rating, then review count)
CREATE OR REPLACE FUNCTION get_popular_equipment(limit_count INTEGER DEFAULT 6)
RETURNS TABLE (
    id UUID,
    name CHARACTER VARYING(255),
    slug CHARACTER VARYING(255),
    category equipment_category,
    subcategory equipment_subcategory,
    manufacturer CHARACTER VARYING(255),
    specifications JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    averageRating DECIMAL(3,1),
    reviewCount BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.name,
        e.slug,
        e.category,
        e.subcategory,
        e.manufacturer,
        e.specifications,
        e.created_at,
        e.updated_at,
        COALESCE(ROUND(AVG(er.overall_rating), 1), 0.0)::DECIMAL(3,1) AS averageRating,
        COALESCE(COUNT(er.id), 0) AS reviewCount
    FROM equipment e
    LEFT JOIN equipment_reviews er ON e.id = er.equipment_id 
        AND er.status = 'approved'
    GROUP BY e.id, e.name, e.slug, e.category, e.subcategory, e.manufacturer, 
             e.specifications, e.created_at, e.updated_at
    HAVING COUNT(er.id) > 0  -- Only include equipment with reviews
    ORDER BY 
        COALESCE(ROUND(AVG(er.overall_rating), 1), 0.0) DESC,
        COUNT(er.id) DESC,
        e.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;