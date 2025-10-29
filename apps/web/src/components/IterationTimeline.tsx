import React from "react";

interface TimelineItem {
  iteration_number: number;
  analyzed_at: string;
  name: string;
  artifact_type: string;
  changed_summary: string;
  quality_score?: number | null;
  completion_percentage?: number | null;
  done_requirements: string[];
  partial_requirements: string[];
  missing_requirements: string[];
}

interface IterationTimelineProps {
  items: TimelineItem[];
}

export const IterationTimeline: React.FC<IterationTimelineProps> = ({
  items,
}) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-4">
      {items.map((it) => (
        <div
          key={it.iteration_number}
          className="rounded-xl border border-neutral-700/60 bg-neutral-900/50 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded bg-neutral-700/60 text-neutral-300">
                Iteration {it.iteration_number}
              </span>
              <span className="text-xs text-neutral-500">
                {new Date(it.analyzed_at).toLocaleString()}
              </span>
            </div>
            <span className="text-xs text-neutral-400">
              {it.artifact_type.toUpperCase()}
            </span>
          </div>
          <div className="text-sm text-neutral-200 font-medium">{it.name}</div>
          {it.changed_summary && (
            <div className="text-sm text-neutral-300 mt-1">
              {it.changed_summary}
            </div>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400">
            {typeof it.quality_score === "number" && (
              <span>Quality {it.quality_score}/10</span>
            )}
            {typeof it.completion_percentage === "number" && (
              <span>Completion {it.completion_percentage}%</span>
            )}
          </div>
          {(it.done_requirements.length > 0 ||
            it.partial_requirements.length > 0) && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {it.done_requirements.length > 0 && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="text-xs font-semibold text-green-400 mb-1">
                    Requirements Satisfied
                  </div>
                  <ul className="space-y-1">
                    {it.done_requirements.map((r, i) => (
                      <li key={i} className="text-sm text-neutral-200">
                        • {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {it.partial_requirements.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="text-xs font-semibold text-amber-400 mb-1">
                    In Progress
                  </div>
                  <ul className="space-y-1">
                    {it.partial_requirements.map((r, i) => (
                      <li key={i} className="text-sm text-neutral-200">
                        • {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {it.missing_requirements.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-neutral-800/60 border border-neutral-700">
              <div className="text-xs font-semibold text-neutral-300 mb-1">
                Still Missing
              </div>
              <ul className="space-y-1">
                {it.missing_requirements.map((r, i) => (
                  <li key={i} className="text-sm text-neutral-300">
                    • {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default IterationTimeline;
