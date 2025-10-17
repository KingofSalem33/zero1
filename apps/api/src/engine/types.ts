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

export interface ProjectPhase {
  phase_id: string; // "P1", "P2", "P3"
  phase_number: number; // 1, 2, 3
  goal: string;
  why_it_matters: string;
  substeps: ProjectSubstep[];
  acceptance_criteria: string[];
  rollback_plan: string[];
  expanded: boolean; // Whether substeps have been generated
  locked: boolean; // Whether phase is accessible
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

export interface SubstepCompletionResult {
  phase_number: number;
  substep_number: number;
  completed_at: string;
  quality_score?: number;
}

export interface ArtifactAnalysis {
  quality_score: number;
  implementation_state: string;
  tech_stack: string[];
  substep_completion_percentage: number;
  [key: string]: any;
}

export interface Project {
  id: string;
  goal: string;
  status: "active" | "completed" | "paused";
  current_phase: string;
  current_substep: number;
  phases: ProjectPhase[];
  history: ProjectHistory[];
  created_at: string;
  updated_at: string;
  roadmap?: {
    phases: ProjectPhase[];
  };
  completed_substeps?: SubstepCompletionResult[];
  thread_id?: string;
}

export interface PhaseExpansionRequest {
  project_id: string;
  phase_id: string;
}

export interface PhaseGenerationRequest {
  goal: string;
  clarification_context: string;
}

export interface PhaseGenerationResponse {
  phases: Omit<ProjectPhase, "expanded" | "completed" | "created_at">[];
}

export interface PhaseExpansionResponse {
  phase: ProjectPhase;
  message: string;
}

export interface CompleteSubstepRequest {
  project_id: string;
  substep_id: string;
}

export interface CompleteSubstepResponse {
  project: Project;
  phase_unlocked?: ProjectPhase; // If completing substep unlocked next phase
  message: string;
}
