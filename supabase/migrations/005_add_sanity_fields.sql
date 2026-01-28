-- Migration: Add Sanity CMS fields to projects table
-- Run this in Supabase SQL Editor

-- Add Sanity-related columns to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS sanity_project_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS sanity_dataset VARCHAR(50) DEFAULT 'production',
ADD COLUMN IF NOT EXISTS sanity_api_token TEXT,
ADD COLUMN IF NOT EXISTS sanity_studio_url VARCHAR(255);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_sanity_project_id ON projects(sanity_project_id);

-- Comment on columns
COMMENT ON COLUMN projects.sanity_project_id IS 'Sanity project ID for CMS';
COMMENT ON COLUMN projects.sanity_dataset IS 'Sanity dataset name';
COMMENT ON COLUMN projects.sanity_api_token IS 'Sanity API token';
COMMENT ON COLUMN projects.sanity_studio_url IS 'Sanity Studio URL';
