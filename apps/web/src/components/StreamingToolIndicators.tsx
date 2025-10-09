import React from "react";

interface StreamingToolIndicatorsProps {
  activeTools: string[];
  completedTools: string[];
  erroredTools: string[];
}

const TOOL_ICONS: Record<string, string> = {
  web_search: "🔍",
  http_fetch: "📄",
  calculator: "🧮",
  file_search: "📁",
};

const TOOL_LABELS: Record<string, string> = {
  web_search: "Searching Web",
  http_fetch: "Fetching URL",
  calculator: "Calculating",
  file_search: "Searching Files",
};

export const StreamingToolIndicators: React.FC<
  StreamingToolIndicatorsProps
> = ({ activeTools, completedTools, erroredTools }) => {
  if (
    activeTools.length === 0 &&
    completedTools.length === 0 &&
    erroredTools.length === 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {/* Active tools - animated gradient */}
      {activeTools.map((tool, idx) => (
        <div
          key={`active-${tool}-${idx}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600/30 to-purple-600/30 border border-blue-400/50 text-xs font-medium text-blue-200 animate-pulse"
          title={`Running: ${TOOL_LABELS[tool] || tool}`}
        >
          <span className="text-sm">{TOOL_ICONS[tool] || "🔧"}</span>
          <span>{TOOL_LABELS[tool] || tool}...</span>
        </div>
      ))}

      {/* Completed tools */}
      {completedTools.map((tool, idx) => (
        <div
          key={`completed-${tool}-${idx}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-green-600/20 to-emerald-600/20 border border-green-500/30 text-xs font-medium text-green-300"
          title={`Completed: ${TOOL_LABELS[tool] || tool}`}
        >
          <span className="text-sm">✓</span>
          <span>{TOOL_LABELS[tool] || tool}</span>
        </div>
      ))}

      {/* Errored tools */}
      {erroredTools.map((tool, idx) => (
        <div
          key={`error-${tool}-${idx}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-red-500/30 text-xs font-medium text-red-300"
          title={`Error: ${TOOL_LABELS[tool] || tool}`}
        >
          <span className="text-sm">⚠️</span>
          <span>{TOOL_LABELS[tool] || tool} failed</span>
        </div>
      ))}
    </div>
  );
};
