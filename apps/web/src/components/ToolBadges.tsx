import React from "react";

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

export const ToolBadges: React.FC<ToolBadgesProps> = ({ tools }) => {
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

  return (
    <div className="flex flex-wrap gap-2 mb-3">
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
      {completedTools.map((tool, idx) => (
        <div
          key={`completed-${tool.tool}-${idx}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 text-xs font-medium text-blue-300"
          title={`Used ${TOOL_LABELS[tool.tool] || tool.tool}`}
        >
          <span className="text-sm">{TOOL_ICONS[tool.tool] || "🔧"}</span>
          <span>{TOOL_LABELS[tool.tool] || tool.tool}</span>
        </div>
      ))}

      {/* Error tools */}
      {errorTools.map((tool, idx) => (
        <div
          key={`error-${tool.tool}-${idx}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-red-500/30 text-xs font-medium text-red-300"
          title={`Error: ${tool.error}`}
        >
          <span className="text-sm">⚠️</span>
          <span>{TOOL_LABELS[tool.tool] || tool.tool} failed</span>
        </div>
      ))}
    </div>
  );
};
