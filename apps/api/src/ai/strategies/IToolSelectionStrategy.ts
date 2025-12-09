/**
 * Strategy interface for tool selection
 * Allows different algorithms for selecting relevant tools
 */
export interface IToolSelectionStrategy {
  /**
   * Select relevant tool names based on user query and context
   */
  selectTools(
    userQuery: string,
    conversationHistory?: Array<{ role: string; content: string }>,
  ): string[];
}

/**
 * Context for tool selection
 */
export interface ToolSelectionContext {
  userQuery: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  availableTools: string[];
}
