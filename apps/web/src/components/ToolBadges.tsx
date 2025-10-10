import React, { useState } from "react";

interface ToolActivity {
  type: "tool_start" | "tool_end" | "tool_error";
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  timestamp: string;
}

interface ToolBadgesProps {
  tools?: ToolActivity[];
}

const TOOL_ICONS: Record<string, string> = {
  web_search: "🔍",
  http_fetch: "📄",
  calculator: "🧮",
  file_search: "📁",
};

const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search",
  http_fetch: "Fetch URL",
  calculator: "Calculate",
  file_search: "File Search",
};

// Format tool result for display (currently unused but kept for future enhancement)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const formatToolResult = (tool: ToolActivity): string => {
  if (!tool.result) return "No result";

  const result = tool.result as Record<string, unknown>;

  // Handle different tool types
  switch (tool.tool) {
    case "calculator":
      return `Result: ${result.result || "N/A"}`;

    case "web_search":
      if (Array.isArray(result.results)) {
        return `Found ${result.results.length} results`;
      }
      return "Search completed";

    case "file_search":
      if (typeof result.content === "string") {
        return `Found content (${result.content.length} chars)`;
      }
      return "File search completed";

    case "http_fetch":
      if (typeof result.content === "string") {
        return `Fetched (${result.content.length} chars)`;
      }
      return "Content fetched";

    default:
      return "Completed";
  }
};

// Get full result preview
const getResultPreview = (tool: ToolActivity): string => {
  if (!tool.result) return "No result data available";

  const result = tool.result as Record<string, unknown>;

  switch (tool.tool) {
    case "calculator":
      return JSON.stringify(result, null, 2);

    case "web_search":
      if (Array.isArray(result.results)) {
        return result.results
          .slice(0, 5)
          .map((r: { title?: string; url?: string }, i: number) => {
            return `${i + 1}. ${r.title || "Untitled"}\n   ${r.url || "No URL"}`;
          })
          .join("\n\n");
      }
      return JSON.stringify(result, null, 2);

    case "file_search":
    case "http_fetch":
      if (typeof result.content === "string") {
        // Show first 500 characters
        const content = result.content.slice(0, 500);
        return content + (result.content.length > 500 ? "\n\n..." : "");
      }
      return JSON.stringify(result, null, 2);

    default:
      return JSON.stringify(result, null, 2);
  }
};

export const ToolBadges: React.FC<ToolBadgesProps> = ({ tools }) => {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  if (!tools || tools.length === 0) return null;

  // Get unique tools by their current status
  const toolStatuses = new Map<string, ToolActivity>();

  // Process tools in order to get the latest status for each tool
  tools.forEach((tool) => {
    toolStatuses.set(tool.tool, tool);
  });

  const toolList = Array.from(toolStatuses.values());

  // Separate by status
  const activeTools = toolList.filter((t) => t.type === "tool_start");
  const completedTools = toolList.filter((t) => t.type === "tool_end");
  const errorTools = toolList.filter((t) => t.type === "tool_error");

  if (toolList.length === 0) return null;

  const toggleToolExpansion = (toolKey: string) => {
    setExpandedTool(expandedTool === toolKey ? null : toolKey);
  };

  return (
    <div className="space-y-2 mb-3">
      <div className="flex flex-wrap gap-2">
        {/* Active tools (in progress) */}
        {activeTools.map((tool, idx) => (
          <div
            key={`active-${tool.tool}-${idx}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/30 text-xs font-medium text-yellow-300 animate-pulse"
            title={`Running ${TOOL_LABELS[tool.tool] || tool.tool}...`}
          >
            <span className="text-sm">{TOOL_ICONS[tool.tool] || "🔧"}</span>
            <span>{TOOL_LABELS[tool.tool] || tool.tool}...</span>
          </div>
        ))}

        {/* Completed tools */}
        {completedTools.map((tool, idx) => {
          const toolKey = `completed-${tool.tool}-${idx}`;
          const isExpanded = expandedTool === toolKey;
          const hasResult = !!tool.result;

          return (
            <div key={toolKey} className="inline-block">
              <button
                onClick={() => hasResult && toggleToolExpansion(toolKey)}
                className={
                  hasResult
                    ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 text-xs font-medium text-blue-300 hover:from-blue-600/30 hover:to-purple-600/30 transition-all cursor-pointer"
                    : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 text-xs font-medium text-blue-300"
                }
                title={
                  hasResult
                    ? `Click to ${isExpanded ? "hide" : "view"} result`
                    : `Used ${TOOL_LABELS[tool.tool] || tool.tool}`
                }
              >
                <span className="text-sm">{TOOL_ICONS[tool.tool] || "🔧"}</span>
                <span>{TOOL_LABELS[tool.tool] || tool.tool}</span>
                {hasResult && (
                  <span className="text-[10px] opacity-70">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* Error tools */}
        {errorTools.map((tool, idx) => {
          const toolKey = `error-${tool.tool}-${idx}`;
          const isExpanded = expandedTool === toolKey;

          return (
            <div key={toolKey} className="inline-block">
              <button
                onClick={() => toggleToolExpansion(toolKey)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-red-500/30 text-xs font-medium text-red-300 hover:from-red-600/30 hover:to-orange-600/30 transition-all cursor-pointer"
                title={`Click to ${isExpanded ? "hide" : "view"} error`}
              >
                <span className="text-sm">⚠️</span>
                <span>{TOOL_LABELS[tool.tool] || tool.tool} failed</span>
                <span className="text-[10px] opacity-70">
                  {isExpanded ? "▼" : "▶"}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Expanded result preview */}
      {expandedTool && (
        <div className="mt-2 p-3 bg-gray-800/60 border border-gray-700/50 rounded-lg">
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-300">
              {expandedTool.startsWith("error-") ? "Error Details" : "Result"}
            </h4>
            <button
              onClick={() => setExpandedTool(null)}
              className="text-gray-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
          <div className="text-xs text-gray-400 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
            {(() => {
              const tool = [...completedTools, ...errorTools].find(
                (t) =>
                  `${t.type === "tool_error" ? "error" : "completed"}-${t.tool}-${completedTools.includes(t) ? completedTools.indexOf(t) : errorTools.indexOf(t)}` ===
                  expandedTool,
              );

              if (!tool) return "No data";

              if (tool.type === "tool_error") {
                return tool.error || "Unknown error";
              }

              return getResultPreview(tool);
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
