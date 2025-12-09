/**
 * Base interface for all AI tools
 * Defines contract for tool registration and execution
 */
export interface ITool<TParams = unknown, TResult = unknown> {
  /**
   * Unique tool identifier
   */
  readonly name: string;

  /**
   * Human-readable description for the AI
   */
  readonly description: string;

  /**
   * JSON Schema for tool parameters
   */
  readonly parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };

  /**
   * Execute the tool with validated parameters
   */
  execute(params: TParams): Promise<TResult>;
}

/**
 * Tool specification for OpenAI function calling
 */
export interface ToolSpec {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}
