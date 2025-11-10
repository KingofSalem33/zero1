-- Add last_accessed_at column to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE;

-- Set default value to created_at for existing projects
UPDATE projects 
SET last_accessed_at = created_at 
WHERE last_accessed_at IS NULL;

-- Create index for better query performance when ordering by last_accessed
CREATE INDEX IF NOT EXISTS idx_projects_last_accessed 
ON projects(last_accessed_at DESC);

-- Add comment
COMMENT ON COLUMN projects.last_accessed_at IS 'Timestamp of when the project was last accessed by the user';
