import { Project } from "../entities/Project";

/**
 * Project Repository Interface
 *
 * Defines contract for project persistence operations.
 * Implementations can be database-specific (Supabase, Postgres, etc.)
 * or in-memory for testing.
 */
export interface IProjectRepository {
  /**
   * Find a project by its unique identifier
   */
  findById(id: string): Promise<Project | null>;

  /**
   * Find all projects for a user
   */
  findByUserId(userId: string): Promise<Project[]>;

  /**
   * Save a new project
   */
  save(project: Project): Promise<void>;

  /**
   * Update an existing project
   */
  update(project: Project): Promise<void>;

  /**
   * Delete a project
   */
  delete(id: string): Promise<void>;

  /**
   * Check if a project exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Find active projects for a user
   */
  findActiveByUserId(userId: string): Promise<Project[]>;
}
