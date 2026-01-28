-- Migration: Add preview_url column to projects
-- This stores the Vercel preview URL for the generated website

ALTER TABLE projects ADD COLUMN IF NOT EXISTS preview_url TEXT;
