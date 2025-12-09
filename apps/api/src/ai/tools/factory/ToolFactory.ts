import type { ITool, ToolSpec } from "./ITool";

/**
 * Factory for registering and creating AI tools
 * Implements Factory and Registry patterns
 */
export class ToolFactory {
  private tools: Map<string, ITool> = new Map();

  /**
   * Register a new tool
   */
  register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      console.warn(
        `[ToolFactory] Tool "${tool.name}" already registered, overwriting`,
      );
    }
    this.tools.set(tool.name, tool);
    console.log(`[ToolFactory] Registered tool: ${tool.name}`);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tool specifications for OpenAI function calling
   */
  getToolSpecs(): ToolSpec[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Execute a tool by name with parameters
   */
  async execute(name: string, params: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.execute(params);
  }

  /**
   * Get count of registered tools
   */
  count(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }
}

// Singleton instance
let factoryInstance: ToolFactory | null = null;

/**
 * Get the global ToolFactory instance
 */
export function getToolFactory(): ToolFactory {
  if (!factoryInstance) {
    factoryInstance = new ToolFactory();
  }
  return factoryInstance;
}
