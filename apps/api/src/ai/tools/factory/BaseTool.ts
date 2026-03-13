import type { ITool } from "./ITool";

/**
 * Abstract base class for tools
 * Provides common implementation and validation
 */
export abstract class BaseTool<TParams = unknown, TResult = unknown>
  implements ITool<TParams, TResult>
{
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };

  /**
   * Validate parameters before execution
   * Override for custom validation logic
   */
  protected validate(params: unknown): TParams {
    // Basic validation - could use Zod schema here
    return params as TParams;
  }

  /**
   * Execute the tool
   */
  async execute(params: TParams): Promise<TResult> {
    const validatedParams = this.validate(params);
    return await this.run(validatedParams);
  }

  /**
   * Actual tool implementation
   * Override this method in subclasses
   */
  protected abstract run(params: TParams): Promise<TResult>;
}
