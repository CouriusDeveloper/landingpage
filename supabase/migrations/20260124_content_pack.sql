-- ============================================================================
-- CONTENT PACK STORAGE
-- Stores generated content packs with versioning and caching
-- ============================================================================

-- Content Pack table
CREATE TABLE IF NOT EXISTS project_content_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Version control
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  hash VARCHAR(64) NOT NULL,  -- SHA256 of input fingerprint
  
  -- The actual content pack (JSONB for querying)
  content JSONB NOT NULL,
  
  -- Quality metrics
  quality_score DECIMAL(3,1),  -- 0.0 - 10.0
  iterations INTEGER DEFAULT 1,
  
  -- Input fingerprint for cache lookup
  input_fingerprint JSONB NOT NULL,
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft',  -- draft, approved, published
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ
);

-- Index for fast cache lookup by hash
CREATE INDEX IF NOT EXISTS idx_content_packs_hash 
ON project_content_packs(hash);

-- Index for project lookup
CREATE INDEX IF NOT EXISTS idx_content_packs_project 
ON project_content_packs(project_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_content_packs_status 
ON project_content_packs(status);

-- Only one published content pack per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_packs_published 
ON project_content_packs(project_id) 
WHERE status = 'published';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a content pack with same hash exists (cache hit)
CREATE OR REPLACE FUNCTION get_cached_content_pack(p_hash VARCHAR(64))
RETURNS TABLE (
  id UUID,
  project_id UUID,
  content JSONB,
  quality_score DECIMAL,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cp.id,
    cp.project_id,
    cp.content,
    cp.quality_score,
    cp.created_at
  FROM project_content_packs cp
  WHERE cp.hash = p_hash
    AND cp.status = 'approved'
    AND cp.quality_score >= 8.0
  ORDER BY cp.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get latest content pack for a project
CREATE OR REPLACE FUNCTION get_latest_content_pack(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  version VARCHAR,
  content JSONB,
  quality_score DECIMAL,
  status VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cp.id,
    cp.version,
    cp.content,
    cp.quality_score,
    cp.status,
    cp.created_at
  FROM project_content_packs cp
  WHERE cp.project_id = p_project_id
  ORDER BY cp.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to publish a content pack (marks others as superseded)
CREATE OR REPLACE FUNCTION publish_content_pack(p_content_pack_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_project_id UUID;
BEGIN
  -- Get project ID
  SELECT project_id INTO v_project_id
  FROM project_content_packs
  WHERE id = p_content_pack_id;
  
  IF v_project_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Unpublish any existing published packs for this project
  UPDATE project_content_packs
  SET status = 'superseded', updated_at = NOW()
  WHERE project_id = v_project_id
    AND status = 'published'
    AND id != p_content_pack_id;
  
  -- Publish the new pack
  UPDATE project_content_packs
  SET status = 'published', 
      published_at = NOW(),
      updated_at = NOW()
  WHERE id = p_content_pack_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ENHANCED PROJECTS TABLE
-- Add new columns for enhanced input
-- ============================================================================

-- Add new columns to projects table (if not exist)
DO $$ 
BEGIN
  -- Target audience (keep as TEXT for simple storage from onboarding)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'target_audience') THEN
    ALTER TABLE projects ADD COLUMN target_audience TEXT;
  END IF;
  
  -- Brand voice (simple string: professional, friendly, playful, luxurious, technical)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'brand_voice') THEN
    ALTER TABLE projects ADD COLUMN brand_voice VARCHAR(50) DEFAULT 'professional';
  END IF;
  
  -- Industry
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'industry') THEN
    ALTER TABLE projects ADD COLUMN industry VARCHAR(50);
  END IF;
  
  -- Company size
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'company_size') THEN
    ALTER TABLE projects ADD COLUMN company_size VARCHAR(20);
  END IF;
  
  -- Founded year
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'founded_year') THEN
    ALTER TABLE projects ADD COLUMN founded_year INTEGER;
  END IF;
  
  -- Location city
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'location_city') THEN
    ALTER TABLE projects ADD COLUMN location_city VARCHAR(100);
  END IF;
  
  -- Location country
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'location_country') THEN
    ALTER TABLE projects ADD COLUMN location_country VARCHAR(100) DEFAULT 'Deutschland';
  END IF;
  
  -- Contact email
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'contact_email') THEN
    ALTER TABLE projects ADD COLUMN contact_email VARCHAR(255);
  END IF;
  
  -- Contact phone
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'contact_phone') THEN
    ALTER TABLE projects ADD COLUMN contact_phone VARCHAR(50);
  END IF;
  
  -- Email domain (for Resend verification)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'email_domain') THEN
    ALTER TABLE projects ADD COLUMN email_domain VARCHAR(255);
  END IF;
  
  -- SEO preferences
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'seo_preferences') THEN
    ALTER TABLE projects ADD COLUMN seo_preferences JSONB DEFAULT '{}';
  END IF;
  
  -- Existing content
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'existing_content') THEN
    ALTER TABLE projects ADD COLUMN existing_content JSONB DEFAULT '{}';
  END IF;
  
  -- Content preferences
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'content_preferences') THEN
    ALTER TABLE projects ADD COLUMN content_preferences JSONB DEFAULT '{}';
  END IF;
  
  -- Competitors
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'competitors') THEN
    ALTER TABLE projects ADD COLUMN competitors TEXT[] DEFAULT '{}';
  END IF;
  
  -- USPs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'unique_selling_points') THEN
    ALTER TABLE projects ADD COLUMN unique_selling_points TEXT[] DEFAULT '{}';
  END IF;
  
  -- Address
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'address') THEN
    ALTER TABLE projects ADD COLUMN address TEXT;
  END IF;
  
  -- Current content pack reference
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'projects' AND column_name = 'current_content_pack_id') THEN
    ALTER TABLE projects ADD COLUMN current_content_pack_id UUID REFERENCES project_content_packs(id);
  END IF;
END $$;

-- ============================================================================
-- AGENT METRICS TABLE
-- Track agent performance for optimization
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  content_pack_id UUID REFERENCES project_content_packs(id) ON DELETE CASCADE,
  
  -- Agent info
  agent_name VARCHAR(50) NOT NULL,
  agent_phase VARCHAR(20),  -- foundation, content, review, development, qa
  
  -- Performance
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  
  -- Quality
  success BOOLEAN DEFAULT TRUE,
  iterations INTEGER DEFAULT 1,
  quality_score DECIMAL(3,1),
  
  -- Error tracking
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance analysis
CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent 
ON agent_metrics(agent_name, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_project 
ON agent_metrics(project_id);
