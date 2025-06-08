-- Create custom types
CREATE TYPE equipment_category AS ENUM ('blade', 'rubber', 'ball');
CREATE TYPE equipment_subcategory AS ENUM ('inverted', 'long_pips', 'anti', 'short_pips');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE rubber_color AS ENUM ('red', 'black');
CREATE TYPE source_type AS ENUM ('interview', 'video', 'tournament_footage', 'official_website');
CREATE TYPE video_platform AS ENUM ('youtube', 'other');

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create equipment table
CREATE TABLE equipment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    category equipment_category NOT NULL,
    subcategory equipment_subcategory,
    manufacturer VARCHAR(255) NOT NULL,
    specifications JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create players table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    highest_rating VARCHAR(50),
    active_years VARCHAR(50),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create equipment_reviews table
CREATE TABLE equipment_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status review_status DEFAULT 'pending',
    overall_rating DECIMAL(3,1) CHECK (overall_rating >= 1.0 AND overall_rating <= 10.0),
    category_ratings JSONB DEFAULT '{}',
    review_text TEXT,
    reviewer_context JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create player_equipment_setups table
CREATE TABLE player_equipment_setups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    blade_id UUID REFERENCES equipment(id),
    forehand_rubber_id UUID REFERENCES equipment(id),
    forehand_thickness VARCHAR(20),
    forehand_color rubber_color,
    backhand_rubber_id UUID REFERENCES equipment(id),
    backhand_thickness VARCHAR(20),
    backhand_color rubber_color,
    source_url TEXT,
    source_type source_type,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create player_sponsorships table
CREATE TABLE player_sponsorships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    sponsor_name VARCHAR(255) NOT NULL,
    start_year INTEGER NOT NULL,
    end_year INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create player_footage table
CREATE TABLE player_footage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title VARCHAR(255) NOT NULL,
    platform video_platform DEFAULT 'youtube',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_equipment_name_gin ON equipment USING gin(to_tsvector('english', name || ' ' || manufacturer));
CREATE INDEX idx_players_name_gin ON players USING gin(to_tsvector('english', name));
CREATE INDEX idx_equipment_reviews_equipment_status ON equipment_reviews(equipment_id, status);
CREATE INDEX idx_player_equipment_setups_player_year ON player_equipment_setups(player_id, year);
CREATE INDEX idx_equipment_slug ON equipment(slug);
CREATE INDEX idx_players_slug ON players(slug);
CREATE INDEX idx_equipment_category ON equipment(category);
CREATE INDEX idx_equipment_reviews_status ON equipment_reviews(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_equipment_reviews_updated_at BEFORE UPDATE ON equipment_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_player_equipment_setups_updated_at BEFORE UPDATE ON player_equipment_setups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_player_sponsorships_updated_at BEFORE UPDATE ON player_sponsorships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_player_footage_updated_at BEFORE UPDATE ON player_footage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_equipment_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_sponsorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_footage ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public read access to approved content
CREATE POLICY "Allow public read on equipment" ON equipment FOR SELECT USING (true);
CREATE POLICY "Allow public read on players" ON players FOR SELECT USING (true);
CREATE POLICY "Allow public read on approved reviews" ON equipment_reviews FOR SELECT USING (status = 'approved');
CREATE POLICY "Allow public read on verified setups" ON player_equipment_setups FOR SELECT USING (verified = true);
CREATE POLICY "Allow public read on sponsorships" ON player_sponsorships FOR SELECT USING (true);
CREATE POLICY "Allow public read on active footage" ON player_footage FOR SELECT USING (active = true);

-- Create RLS policies for authenticated users to submit content
CREATE POLICY "Allow authenticated users to insert reviews" ON equipment_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow users to read their own reviews" ON equipment_reviews FOR SELECT USING (auth.uid() = user_id OR status = 'approved');
CREATE POLICY "Allow users to update their own pending reviews" ON equipment_reviews FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');

-- Create storage bucket for images
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true);

-- Create storage policy for public read access
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'images');

-- Create storage policy for authenticated uploads
CREATE POLICY "Authenticated users can upload images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.role() = 'authenticated');