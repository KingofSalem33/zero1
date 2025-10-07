-- Migration: Add Artifact Type Detection and Content Hashing
-- Execute this SQL in your Supabase SQL Editor

-- Add new fields to artifact_signals table
ALTER TABLE artifact_signals
  ADD COLUMN IF NOT EXISTS artifact_type text DEFAULT 'unknown' CHECK (artifact_type IN ('code', 'document', 'design', 'plan', 'content', 'unknown')),
  ADD COLUMN IF NOT EXISTS primary_file_types jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Create index for artifact type filtering
CREATE INDEX IF NOT EXISTS idx_artifact_signals_artifact_type ON artifact_signals(artifact_type);

-- Create index for content hash lookups (for diff detection)
CREATE INDEX IF NOT EXISTS idx_artifact_signals_content_hash ON artifact_signals(content_hash);

-- Update completed_substeps in artifacts table to track more detail
ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS completed_substeps jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS roadmap_diff text,
  ADD COLUMN IF NOT EXISTS progress_percentage integer DEFAULT 0;

-- Add index for progress tracking
CREATE INDEX IF NOT EXISTS idx_artifacts_progress ON artifacts(progress_percentage);

COMMENT ON COLUMN artifact_signals.artifact_type IS 'Auto-detected artifact type: code, document, design, plan, content, or unknown';
COMMENT ON COLUMN artifact_signals.primary_file_types IS 'Array of file extensions found in the artifact';
COMMENT ON COLUMN artifact_signals.content_hash IS 'SHA-256 hash for detecting file changes between uploads';
COMMENT ON COLUMN artifacts.completed_substeps IS 'Array of substep IDs detected as complete by this artifact';
COMMENT ON COLUMN artifacts.roadmap_diff IS 'Human-readable summary of roadmap changes from this artifact';
COMMENT ON COLUMN artifacts.progress_percentage IS 'Overall project progress percentage after this artifact';
