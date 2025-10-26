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

// Consistent icon set with SVG paths for better scalability
const TOOL_ICONS: Record<string, { label: string; icon: string }> = {
  web_search: { label: "Web Search", icon: "search" },
  http_fetch: { label: "Fetch URL", icon: "download" },
  calculator: { label: "Calculate", icon: "calculator" },
  file_search: { label: "File Search", icon: "file" },
};

// SVG icon components
const Icon: React.FC<{ name: string; className?: string }> = ({
  name,
  className = "w-3.5 h-3.5",
}) => {
  const icons: Record<string, React.ReactElement> = {
    search: (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
    download: (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
        />
      </svg>
    ),
    calculator: (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    ),
    file: (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
    spinner: (
      <svg
        className={`${className} animate-spin`}
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    ),
    check: (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
    alert: (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
    chevronRight: (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    ),
    chevronDown: (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    ),
  };

  return icons[name] || icons.file;
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
    <div className="space-y-3">
      {/* Tool badges - horizontal list */}
      <div className="flex flex-wrap gap-2">
        {/* Active tools - subtle spinner, no pulse */}
        {activeTools.map((tool, idx) => {
          const toolInfo = TOOL_ICONS[tool.tool];
          return (
            <div
              key={`active-${tool.tool}-${idx}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-xs font-medium text-neutral-300"
              title={`Running ${toolInfo?.label || tool.tool}...`}
            >
              <Icon name="spinner" className="w-3 h-3" />
              <span>{toolInfo?.label || tool.tool}</span>
            </div>
          );
        })}

        {/* Completed tools - clean checkmark */}
        {completedTools.map((tool, idx) => {
          const toolKey = `completed-${tool.tool}-${idx}`;
          const isExpanded = expandedTool === toolKey;
          const hasResult = !!tool.result;
          const toolInfo = TOOL_ICONS[tool.tool];

          return (
            <button
              key={toolKey}
              onClick={() => hasResult && toggleToolExpansion(toolKey)}
              disabled={!hasResult}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-xs font-medium transition-colors ${
                hasResult
                  ? "text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600 cursor-pointer"
                  : "text-neutral-400 cursor-default"
              }`}
              title={
                hasResult
                  ? `Click to ${isExpanded ? "hide" : "view"} result`
                  : `Used ${toolInfo?.label || tool.tool}`
              }
            >
              <Icon name={toolInfo?.icon || "file"} />
              <span>{toolInfo?.label || tool.tool}</span>
              <Icon name="check" className="w-3 h-3 text-green-500" />
              {hasResult && (
                <Icon
                  name={isExpanded ? "chevronDown" : "chevronRight"}
                  className="w-3 h-3 opacity-50"
                />
              )}
            </button>
          );
        })}

        {/* Error tools - alert icon */}
        {errorTools.map((tool, idx) => {
          const toolKey = `error-${tool.tool}-${idx}`;
          const isExpanded = expandedTool === toolKey;
          const toolInfo = TOOL_ICONS[tool.tool];

          return (
            <button
              key={toolKey}
              onClick={() => toggleToolExpansion(toolKey)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-500/30 text-xs font-medium text-red-400 hover:bg-red-900/30 hover:border-red-500/50 transition-colors cursor-pointer"
              title={`Click to ${isExpanded ? "hide" : "view"} error`}
            >
              <Icon name="alert" className="w-3 h-3" />
              <span>{toolInfo?.label || tool.tool} failed</span>
              <Icon
                name={isExpanded ? "chevronDown" : "chevronRight"}
                className="w-3 h-3 opacity-50"
              />
            </button>
          );
        })}
      </div>

      {/* Dedicated results panel with typography hierarchy */}
      {expandedTool && (
        <div className="bg-neutral-900/80 border border-neutral-700/50 rounded-xl overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700/50 bg-neutral-800/30">
            <div className="flex items-center gap-2">
              <Icon
                name={expandedTool.startsWith("error-") ? "alert" : "check"}
                className="w-4 h-4"
              />
              <h3 className="text-sm font-semibold text-neutral-200">
                {expandedTool.startsWith("error-")
                  ? "Error Details"
                  : "Tool Result"}
              </h3>
            </div>
            <button
              onClick={() => setExpandedTool(null)}
              className="btn-icon-ghost w-6 h-6"
              title="Close"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Panel content */}
          <div className="p-4">
            <div className="font-mono text-xs text-neutral-300 whitespace-pre-wrap max-h-80 overflow-y-auto">
              {(() => {
                const tool = [...completedTools, ...errorTools].find(
                  (t) =>
                    `${t.type === "tool_error" ? "error" : "completed"}-${t.tool}-${completedTools.includes(t) ? completedTools.indexOf(t) : errorTools.indexOf(t)}` ===
                    expandedTool,
                );

                if (!tool)
                  return (
                    <span className="text-neutral-500 italic">
                      No data available
                    </span>
                  );

                if (tool.type === "tool_error") {
                  return (
                    <span className="text-red-400">
                      {tool.error || "Unknown error"}
                    </span>
                  );
                }

                return getResultPreview(tool);
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
