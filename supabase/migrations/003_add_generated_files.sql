-- Migration: Add generated_files table for AI-generated code storage
-- Run this in Supabase SQL Editor

-- Create generated_files table
CREATE TABLE IF NOT EXISTS generated_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, file_path)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_generated_files_project_id ON generated_files(project_id);

-- Enable RLS
ALTER TABLE generated_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their generated files" ON generated_files
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE offer_id = auth.uid())
  );

CREATE POLICY "Service can insert generated files" ON generated_files
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update generated files" ON generated_files
  FOR UPDATE USING (true);

-- Add activity_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_type VARCHAR(50) NOT NULL, -- 'system', 'user', 'admin'
  actor_id UUID, -- user id if actor_type is 'user' or 'admin'
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  customer_visible BOOLEAN DEFAULT false,
  customer_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for activity_log
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON activity_log(project_id);

-- Enable RLS on activity_log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for activity_log
DROP POLICY IF EXISTS "Users can view their activity log" ON activity_log;
CREATE POLICY "Users can view their activity log" ON activity_log
  FOR SELECT USING (
    customer_visible = true AND
    project_id IN (SELECT id FROM projects WHERE offer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service can insert activity log" ON activity_log;
CREATE POLICY "Service can insert activity log" ON activity_log
  FOR INSERT WITH CHECK (true);

-- Add generating status to projects if not exists
-- (status can be: pending, pending_payment, discovery, design, generating, review, development, launched)
