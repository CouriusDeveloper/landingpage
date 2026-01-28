-- Migration: New Addons, Chat System, Project Fields
-- Date: 2026-01-28

-- =============================================================================
-- 1. ADD REQUIRES_ADDON COLUMN FIRST (before inserting)
-- =============================================================================

ALTER TABLE addon_pricing ADD COLUMN IF NOT EXISTS requires_addon VARCHAR(50);
ALTER TABLE addon_pricing ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE addon_pricing ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 99;

-- =============================================================================
-- 2. NEW ADDONS IN ADDON_PRICING
-- =============================================================================

INSERT INTO addon_pricing (slug, name, description, price_cents, price_type, requires_addon, active, sort_order)
VALUES 
  ('google_pixel', 'Google Analytics Pixel', 'Google Analytics Integration mit Event-Tracking', 15000, 'fixed', NULL, true, 10),
  ('meta_pixel', 'Meta/Facebook Pixel', 'Meta Pixel für Conversion-Tracking und Retargeting', 15000, 'fixed', NULL, true, 11),
  ('seo_package', 'SEO Optimierung', 'Erweiterte SEO mit Sitemap, robots.txt, Schema.org Markup', 30000, 'fixed', NULL, true, 12),
  ('blog_addon', 'Blog System', 'Blog mit Sanity CMS, SEO-optimierte Posts, Kategorien', 50000, 'fixed', 'cms_base', true, 13),
  ('cookie_consent', 'Cookie Consent Banner', 'DSGVO-konformer Cookie-Banner mit Einstellungen', 20000, 'fixed', NULL, true, 14)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  price_type = EXCLUDED.price_type,
  requires_addon = EXCLUDED.requires_addon,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order;

-- =============================================================================
-- 3. NEW PROJECT FIELDS
-- =============================================================================

-- Preview visibility control (Admin must enable before client sees)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS preview_visible BOOLEAN DEFAULT FALSE;

-- Pending change requests flag
ALTER TABLE projects ADD COLUMN IF NOT EXISTS has_pending_changes BOOLEAN DEFAULT FALSE;

-- Sanity Studio URL for client access
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sanity_studio_visible BOOLEAN DEFAULT FALSE;

-- Google Pixel ID (if addon booked)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS google_pixel_id VARCHAR(50);

-- Meta Pixel ID (if addon booked)  
ALTER TABLE projects ADD COLUMN IF NOT EXISTS meta_pixel_id VARCHAR(50);

-- =============================================================================
-- 4. PROJECT MESSAGES TABLE (Chat + Change Requests)
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Sender info
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('client', 'admin')),
  
  -- Message type
  message_type VARCHAR(20) NOT NULL DEFAULT 'message' CHECK (message_type IN ('message', 'change_request', 'system')),
  
  -- For change requests: category
  change_category VARCHAR(30) CHECK (
    change_category IS NULL OR 
    change_category IN ('design', 'text', 'functionality', 'bug', 'other')
  ),
  
  -- Content
  content TEXT NOT NULL,
  screenshot_url TEXT, -- For change requests with screenshot
  
  -- Status for change requests
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  
  -- Read status
  read_by_admin BOOLEAN DEFAULT FALSE,
  read_by_client BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_messages_project_id ON project_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_created_at ON project_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_messages_unread_admin ON project_messages(project_id, read_by_admin) WHERE read_by_admin = FALSE;
CREATE INDEX IF NOT EXISTS idx_project_messages_unread_client ON project_messages(project_id, read_by_client) WHERE read_by_client = FALSE;
CREATE INDEX IF NOT EXISTS idx_project_messages_pending_changes ON project_messages(project_id, is_resolved) WHERE message_type = 'change_request' AND is_resolved = FALSE;

-- =============================================================================
-- 5. RLS POLICIES FOR PROJECT_MESSAGES
-- =============================================================================

ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;

-- Clients can view messages for their own projects
CREATE POLICY "Clients can view own project messages"
  ON project_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_messages.project_id 
      AND projects.offer_id = auth.uid()
    )
  );

-- Clients can insert messages for their own projects
CREATE POLICY "Clients can send messages to own projects"
  ON project_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    sender_role = 'client' AND
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_messages.project_id 
      AND projects.offer_id = auth.uid()
    )
  );

-- Clients can update read status on their own project messages
CREATE POLICY "Clients can mark messages as read"
  ON project_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_messages.project_id 
      AND projects.offer_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Can only update read_by_client field
    sender_id = project_messages.sender_id AND
    sender_role = project_messages.sender_role AND
    content = project_messages.content
  );

-- Admins can do everything (via service role or admin check)
-- Note: Admin policies would use a separate admin role check

-- =============================================================================
-- 6. FUNCTION TO UPDATE has_pending_changes
-- =============================================================================

CREATE OR REPLACE FUNCTION update_project_pending_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- When a change_request is created, set has_pending_changes to true
  IF TG_OP = 'INSERT' AND NEW.message_type = 'change_request' THEN
    UPDATE projects SET has_pending_changes = TRUE WHERE id = NEW.project_id;
  END IF;
  
  -- When a change_request is resolved, check if any pending remain
  IF TG_OP = 'UPDATE' AND NEW.is_resolved = TRUE AND OLD.is_resolved = FALSE THEN
    UPDATE projects 
    SET has_pending_changes = EXISTS (
      SELECT 1 FROM project_messages 
      WHERE project_id = NEW.project_id 
      AND message_type = 'change_request' 
      AND is_resolved = FALSE
    )
    WHERE id = NEW.project_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pending_changes
  AFTER INSERT OR UPDATE ON project_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_project_pending_changes();

-- =============================================================================
-- 7. NOTIFICATION TRACKING (for email cooldown)
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  notification_type VARCHAR(30) NOT NULL, -- 'chat_message', 'change_request'
  recipient_role VARCHAR(20) NOT NULL, -- 'client', 'admin'
  recipient_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_cooldown 
  ON notification_log(project_id, recipient_role, sent_at DESC);

-- =============================================================================
-- 8. REALTIME SUBSCRIPTION SETUP
-- =============================================================================

-- Enable realtime for project_messages
ALTER PUBLICATION supabase_realtime ADD TABLE project_messages;

-- =============================================================================
-- 9. UPDATE projects TABLE UPDATED_AT TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to project_messages
DROP TRIGGER IF EXISTS update_project_messages_updated_at ON project_messages;
CREATE TRIGGER update_project_messages_updated_at
  BEFORE UPDATE ON project_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
