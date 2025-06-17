-- Create site_content table for managing text snippets across the application
CREATE TABLE site_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  description TEXT NOT NULL, -- Human-readable description of where this text appears
  category TEXT NOT NULL, -- Group related content (e.g., 'homepage', 'equipment', 'players')
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Anyone can read site content (needed for public pages)
CREATE POLICY "Anyone can read site content" ON site_content
  FOR SELECT USING (true);

-- Only admins can modify site content
CREATE POLICY "Admins can modify site content" ON site_content
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX idx_site_content_key ON site_content(key);
CREATE INDEX idx_site_content_category ON site_content(category);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_site_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_site_content_updated_at
  BEFORE UPDATE ON site_content
  FOR EACH ROW
  EXECUTE FUNCTION update_site_content_updated_at();