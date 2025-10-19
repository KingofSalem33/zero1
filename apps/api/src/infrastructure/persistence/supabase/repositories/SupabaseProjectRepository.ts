import { injectable, inject } from "tsyringe";
import { IProjectRepository } from "../../../../domain/projects/repositories/IProjectRepository";
import { Project } from "../../../../domain/projects/entities/Project";
import { Phase } from "../../../../domain/projects/entities/Phase";
import { Substep } from "../../../../domain/projects/entities/Substep";
import { ProjectGoal } from "../../../../domain/projects/value-objects/ProjectGoal";
import { ProjectStatus } from "../../../../domain/projects/value-objects/ProjectStatus";
import { SupabaseClient } from "../SupabaseClient";
import { ILogger } from "../../../logging/ILogger";
import { TYPES } from "../../../../di/types";
import { withRetry } from "../../../../db";

interface DbProject {
  id: string;
  goal: string | null;
  status: string | null;
  current_phase: string | null;
  roadmap: any;
  created_at: string;
  user_id: string | null;
}

/**
 * Supabase implementation of Project Repository
 *
 * Handles persistence of Project aggregates to Supabase database
 */
@injectable()
export class SupabaseProjectRepository implements IProjectRepository {
  private client;

  constructor(
    @inject(TYPES.SupabaseClient) supabaseClient: SupabaseClient,
    @inject(TYPES.Logger) private logger: ILogger,
  ) {
    this.client = supabaseClient.getClient();
  }

  async findById(id: string): Promise<Project | null> {
    this.logger.debug("Finding project by ID", { id });

    try {
      const result = await withRetry(async () => {
        return await this.client
          .from("projects")
          .select("*")
          .eq("id", id)
          .single();
      });

      if (!result) {
        this.logger.debug("Project not found", { id });
        return null;
      }

      return this.toDomain(result as DbProject);
    } catch (error) {
      this.logger.error("Error finding project by ID", error as Error, { id });
      return null;
    }
  }

  async findByUserId(userId: string): Promise<Project[]> {
    this.logger.debug("Finding projects by user ID", { userId });

    const { data, error } = await this.client
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      this.logger.error("Error finding projects by user ID", error, { userId });
      throw error;
    }

    return (data || []).map((p) => this.toDomain(p));
  }

  async save(project: Project): Promise<void> {
    this.logger.info("Saving new project", { projectId: project.id });

    const dbModel = this.toDatabase(project);

    await withRetry(async () => {
      return await this.client
        .from("projects")
        .insert(dbModel)
        .select()
        .single();
    });

    this.logger.info("Project saved successfully", { projectId: project.id });
  }

  async update(project: Project): Promise<void> {
    this.logger.info("Updating project", { projectId: project.id });

    const dbModel = this.toDatabase(project);

    await withRetry(async () => {
      return await this.client
        .from("projects")
        .update(dbModel)
        .eq("id", project.id)
        .select()
        .single();
    });

    this.logger.info("Project updated successfully", { projectId: project.id });
  }

  async delete(id: string): Promise<void> {
    this.logger.info("Deleting project", { id });

    const { error } = await this.client.from("projects").delete().eq("id", id);

    if (error) {
      this.logger.error("Error deleting project", error, { id });
      throw error;
    }

    this.logger.info("Project deleted successfully", { id });
  }

  async exists(id: string): Promise<boolean> {
    const { data } = await this.client
      .from("projects")
      .select("id")
      .eq("id", id)
      .single();

    return !!data;
  }

  async findActiveByUserId(userId: string): Promise<Project[]> {
    this.logger.debug("Finding active projects by user ID", { userId });

    const { data, error } = await this.client
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      this.logger.error("Error finding active projects", error, { userId });
      throw error;
    }

    return (data || []).map((p) => this.toDomain(p));
  }

  /**
   * Convert database model to domain entity
   */
  private toDomain(dbProject: DbProject): Project {
    const goal = ProjectGoal.create(dbProject.goal || "");
    const status = ProjectStatus.create(dbProject.status || "active");

    // Parse phases from roadmap
    const phases = this.parsePhases(dbProject.roadmap);

    // Extract current phase/substep
    const currentPhase = this.parsePhaseNumber(dbProject.current_phase);

    const project = new Project(
      dbProject.id,
      goal,
      status,
      phases,
      currentPhase.phase,
      currentPhase.substep,
      new Date(dbProject.created_at),
      new Date(dbProject.created_at),
      dbProject.user_id || undefined,
    );

    return project;
  }

  /**
   * Convert domain entity to database model
   */
  private toDatabase(project: Project): Partial<DbProject> {
    return {
      id: project.id,
      goal: project.goal.getValue(),
      status: project.status.getValue(),
      current_phase: `P${project.currentPhaseNumber}`,
      roadmap: this.serializePhases(project.phases as Phase[]),
      user_id: project.userId || null,
    };
  }

  private parsePhases(roadmap: any): Phase[] {
    if (!roadmap || !Array.isArray(roadmap)) {
      return [];
    }

    return roadmap.map((phaseData: any) => {
      const substeps = (phaseData.substeps || []).map(
        (substepData: any, index: number) =>
          new Substep(
            substepData.id || `substep-${index + 1}`,
            substepData.number || index + 1,
            substepData.title || "",
            substepData.description || "",
            substepData.estimatedMinutes || 30,
            substepData.toolsNeeded || [],
            substepData.completed || false,
            substepData.completedAt
              ? new Date(substepData.completedAt)
              : undefined,
          ),
      );

      const phase = new Phase(
        phaseData.id || `phase-${phaseData.phase_number}`,
        phaseData.phase_number || 0,
        phaseData.title || "",
        phaseData.description || "",
        phaseData.goal || "",
        substeps,
        phaseData.expanded || false,
        phaseData.locked !== false, // Default to locked
        phaseData.completed || false,
        phaseData.created_at ? new Date(phaseData.created_at) : new Date(),
        phaseData.completed_at ? new Date(phaseData.completed_at) : undefined,
      );

      return phase;
    });
  }

  private serializePhases(phases: Phase[]): any[] {
    return phases.map((phase) => phase.toJSON());
  }

  private parsePhaseNumber(currentPhase: string | null): {
    phase: number;
    substep: number;
  } {
    if (!currentPhase) {
      return { phase: 0, substep: 1 };
    }

    // Parse "P0", "P1", etc.
    const match = currentPhase.match(/P(\d+)/);
    if (match) {
      return { phase: parseInt(match[1], 10), substep: 1 };
    }

    return { phase: 0, substep: 1 };
  }
}
