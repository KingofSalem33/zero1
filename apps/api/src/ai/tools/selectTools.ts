import { toolSpecs, toolMap } from "./index";
import type { ToolMap } from "./index";
import { RegexToolSelectionStrategy } from "../strategies";
import type { IToolSelectionStrategy } from "../strategies";

/**
 * Default strategy for tool selection
 * Can be swapped with other strategies (e.g., ML-based) in the future
 */
let strategy: IToolSelectionStrategy = new RegexToolSelectionStrategy();

/**
 * Set the tool selection strategy
 * Allows dependency injection for testing or switching strategies
 */
export function setToolSelectionStrategy(
  newStrategy: IToolSelectionStrategy,
): void {
  strategy = newStrategy;
}

/**
 * Get the current tool selection strategy
 */
export function getToolSelectionStrategy(): IToolSelectionStrategy {
  return strategy;
}

/**
 * Dynamically select relevant tools based on user query intent.
 * Reduces token usage by only including tools that are likely to be needed.
 *
 * @param userQuery - The current user message
 * @param conversationHistory - Optional history for context
 * @returns { toolSpecs, toolMap } - Filtered tools
 */
export function selectRelevantTools(
  userQuery: string,
  conversationHistory?: Array<{ role: string; content: string }>,
): {
  toolSpecs: typeof toolSpecs;
  toolMap: Partial<ToolMap>;
} {
  // Use strategy to select tool names
  const selectedTools = strategy.selectTools(userQuery, conversationHistory);

  // Build filtered toolSpecs and toolMap
  const filteredSpecs = toolSpecs.filter(
    (spec) => spec.type === "function" && selectedTools.includes(spec.name),
  );

  const filteredMap: Partial<ToolMap> = {};
  for (const toolName of selectedTools) {
    if (toolName in toolMap) {
      (filteredMap as any)[toolName] =
        toolMap[toolName as keyof typeof toolMap];
    }
  }

  console.log(
    `[Tool Selection] User query keywords matched: ${selectedTools.join(", ")} (${selectedTools.length}/${toolSpecs.length} tools)`,
  );

  return {
    toolSpecs: filteredSpecs,
    toolMap: filteredMap,
  };
}
