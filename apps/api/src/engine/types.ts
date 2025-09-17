// JSON-only schema for project orchestration

export interface ProjectStep {
  step_number: number;
  prompt_text: string;
  why_text: string;
  completed: boolean;
  created_at: string;
}

export interface ProjectHistory {
  id: string;
  project_id: string;
  input_text: string;
  output_text: string;
  created_at: string;
}

export interface Project {
  id: string;
  goal: string;
  status: "active" | "completed" | "paused";
  current_step: number;
  steps: ProjectStep[];
  history: ProjectHistory[];
  created_at: string;
  updated_at: string;
}

export interface StepGenerationRequest {
  goal: string;
  current_context?: string;
  previous_steps?: ProjectStep[];
}

export interface StepGenerationResponse {
  steps: Omit<ProjectStep, "completed" | "created_at">[];
  reasoning: string;
}

export interface AdvanceProjectRequest {
  completed_step_number: number;
  user_feedback?: string;
  context_update?: string;
}

export interface AdvanceProjectResponse {
  project: Project;
  next_steps?: Omit<ProjectStep, "completed" | "created_at">[];
  message: string;
}
