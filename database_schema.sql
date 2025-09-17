-- Supabase Database Schema for Zero1 Project
-- Execute this SQL in your Supabase SQL Editor

-- Projects table to store user project goals and status
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  goal text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- Steps table to store prompt cards for each project
CREATE TABLE steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  step_number int,
  prompt_text text,
  why_text text,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- History table to store all user interactions and AI responses
CREATE TABLE history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  input_text text,
  output_text text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_steps_project_id ON steps(project_id);
CREATE INDEX idx_history_project_id ON history(project_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_steps_completed ON steps(completed);