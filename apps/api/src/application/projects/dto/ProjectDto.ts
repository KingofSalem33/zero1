/**
 * Project Data Transfer Object
 *
 * Represents a project for API responses
 */
export interface ProjectDto {
  id: string;
  goal: string;
  status: string;
  currentPhase: number;
  currentSubstep: number;
  phases: PhaseDto[];
  createdAt: string;
  updatedAt: string;
  userId?: string;
}

export interface PhaseDto {
  id: string;
  phaseNumber: number;
  title: string;
  description: string;
  goal: string;
  expanded: boolean;
  locked: boolean;
  completed: boolean;
  substeps: SubstepDto[];
}

export interface SubstepDto {
  id: string;
  number: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  toolsNeeded: string[];
  completed: boolean;
  completedAt?: string;
}
