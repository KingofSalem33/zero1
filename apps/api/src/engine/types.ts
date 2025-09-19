// JSON-only schema for project orchestration

export interface ProjectSubstep {
  substep_id: string; // "1A", "1B", "1C"
  step_number: number; // Parent step number
  label: string; // "1A: Check Current Setup"
  prompt_to_send: string; // Exact prompt user should send to AI
  commands?: string; // CLI commands or code snippets mentioned in prompt
  completed: boolean;
  created_at: string;
}

export interface ProjectStep {
  step_number: number;
  title: string; // "Environment Setup"
  why_text: string; // Why this step matters
  substeps: ProjectSubstep[];
  all_substeps_complete: boolean;
  completed: boolean; // Only true when all substeps done
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
  status: "clarifying" | "active" | "completed" | "paused";
  current_step: number;
  steps: ProjectStep[];
  history: ProjectHistory[];
  clarification_context?: string; // Accumulated context from clarification Q&A
  created_at: string;
  updated_at: string;
}

export interface StepGenerationRequest {
  goal: string;
  current_context?: string;
  previous_steps?: ProjectStep[];
}

export interface StepGenerationResponse {
  steps: Omit<
    ProjectStep,
    "all_substeps_complete" | "completed" | "created_at"
  >[];
  reasoning: string;
}

export interface AdvanceProjectRequest {
  step_number?: number; // For step completion
  substep_id?: string; // For substep completion (e.g. "1A")
  completed_substep_id?: string; // For backward compatibility
  completed_step_number?: number; // For backward compatibility
  user_feedback?: string;
  context_update?: string;
}

export interface AdvanceProjectResponse {
  project: Project;
  next_steps?: Omit<
    ProjectStep,
    "all_substeps_complete" | "completed" | "created_at"
  >[];
  message: string;
}

export interface ClarificationRequest {
  project_id: string;
  user_response?: string; // User's answer to previous question
}

export interface ClarificationResponse {
  project: Project;
  question?: string; // Next clarifying question, or undefined if done
  is_complete: boolean; // True when clarification is complete and ready for action plan
  message: string;
}
