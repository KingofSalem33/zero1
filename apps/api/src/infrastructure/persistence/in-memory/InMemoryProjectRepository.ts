import { IProjectRepository } from "../../../domain/projects/repositories/IProjectRepository";
import { Project } from "../../../domain/projects/entities/Project";

/**
 * In-memory implementation of IProjectRepository for testing
 *
 * Stores projects in a Map for fast access without database dependency
 */
export class InMemoryProjectRepository implements IProjectRepository {
  private projects: Map<string, Project> = new Map();

  async findById(id: string): Promise<Project | null> {
    return this.projects.get(id) || null;
  }

  async findByUserId(userId: string): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (p) => p.userId === userId,
    );
  }

  async save(project: Project): Promise<void> {
    this.projects.set(project.id, project);
  }

  async update(project: Project): Promise<void> {
    if (!this.projects.has(project.id)) {
      throw new Error(`Project ${project.id} not found`);
    }
    this.projects.set(project.id, project);
  }

  async delete(id: string): Promise<void> {
    this.projects.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.projects.has(id);
  }

  async findActiveByUserId(userId: string): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (p) => p.userId === userId && p.status.getValue() === "active",
    );
  }

  // Test helper methods
  clear(): void {
    this.projects.clear();
  }

  count(): number {
    return this.projects.size;
  }
}
