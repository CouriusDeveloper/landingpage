-- Migration: Add branding fields to projects and create page/section tables
-- Run this in Supabase SQL Editor

-- 1. Add new columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS package_type VARCHAR(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS website_style VARCHAR(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS optimization_goal VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS selected_addons TEXT[]; -- Array of addon slugs
ALTER TABLE projects ADD COLUMN IF NOT EXISTS brief TEXT;

-- 1.5 Create addon_pricing table if it doesn't exist
CREATE TABLE IF NOT EXISTS addon_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  price_type VARCHAR(20) NOT NULL DEFAULT 'fixed', -- 'fixed' or 'per_page'
  active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert booking form addon
INSERT INTO addon_pricing (slug, name, description, price_cents, price_type, active, sort_order)
VALUES ('booking_form', 'Buchungs-/Kontaktformular', 'Erweiterte Formulare mit E-Mail-Benachrichtigung, Kalender-Integration oder Buchungslogik.', 50000, 'fixed', true, 3)
ON CONFLICT (slug) DO NOTHING;

-- 2. Create project_pages table
CREATE TABLE IF NOT EXISTS project_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create page_sections table
CREATE TABLE IF NOT EXISTS page_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES project_pages(id) ON DELETE CASCADE,
  section_type VARCHAR(50) NOT NULL,
  title VARCHAR(200),
  sort_order INT DEFAULT 0,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create section_content table
CREATE TABLE IF NOT EXISTS section_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES page_sections(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL,
  content_key VARCHAR(100) NOT NULL,
  content_value TEXT,
  file_url TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_project_pages_project_id ON project_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_page_sections_page_id ON page_sections(page_id);
CREATE INDEX IF NOT EXISTS idx_section_content_section_id ON section_content(section_id);

-- 6. Enable RLS
ALTER TABLE project_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_content ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for project_pages
CREATE POLICY "Users can view their project pages" ON project_pages
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE offer_id = auth.uid())
  );

CREATE POLICY "Users can insert their project pages" ON project_pages
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE offer_id = auth.uid())
  );

CREATE POLICY "Users can update their project pages" ON project_pages
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE offer_id = auth.uid())
  );

CREATE POLICY "Users can delete their project pages" ON project_pages
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE offer_id = auth.uid())
  );

-- 8. RLS Policies for page_sections
CREATE POLICY "Users can view their page sections" ON page_sections
  FOR SELECT USING (
    page_id IN (
      SELECT pp.id FROM project_pages pp
      JOIN projects p ON pp.project_id = p.id
      WHERE p.offer_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their page sections" ON page_sections
  FOR INSERT WITH CHECK (
    page_id IN (
      SELECT pp.id FROM project_pages pp
      JOIN projects p ON pp.project_id = p.id
      WHERE p.offer_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their page sections" ON page_sections
  FOR UPDATE USING (
    page_id IN (
      SELECT pp.id FROM project_pages pp
      JOIN projects p ON pp.project_id = p.id
      WHERE p.offer_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their page sections" ON page_sections
  FOR DELETE USING (
    page_id IN (
      SELECT pp.id FROM project_pages pp
      JOIN projects p ON pp.project_id = p.id
      WHERE p.offer_id = auth.uid()
    )
  );

-- 9. RLS Policies for section_content
CREATE POLICY "Users can view their section content" ON section_content
  FOR SELECT USING (
    section_id IN (
      SELECT ps.id FROM page_sections ps
      JOIN project_pages pp ON ps.page_id = pp.id
      JOIN projects p ON pp.project_id = p.id
      WHERE p.offer_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their section content" ON section_content
  FOR INSERT WITH CHECK (
    section_id IN (
      SELECT ps.id FROM page_sections ps
      JOIN project_pages pp ON ps.page_id = pp.id
      JOIN projects p ON pp.project_id = p.id
      WHERE p.offer_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their section content" ON section_content
  FOR UPDATE USING (
    section_id IN (
      SELECT ps.id FROM page_sections ps
      JOIN project_pages pp ON ps.page_id = pp.id
      JOIN projects p ON pp.project_id = p.id
      WHERE p.offer_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their section content" ON section_content
  FOR DELETE USING (
    section_id IN (
      SELECT ps.id FROM page_sections ps
      JOIN project_pages pp ON ps.page_id = pp.id
      JOIN projects p ON pp.project_id = p.id
      WHERE p.offer_id = auth.uid()
    )
  );

-- 10. Admin policies (for team members)
CREATE POLICY "Admins can manage all project pages" ON project_pages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage all page sections" ON page_sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage all section content" ON section_content
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 11. Create storage bucket for project assets (logos, images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-assets',
  'project-assets',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 12. Storage policies
CREATE POLICY "Authenticated users can upload project assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-assets');

CREATE POLICY "Anyone can view project assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'project-assets');

CREATE POLICY "Users can delete their own uploads"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
