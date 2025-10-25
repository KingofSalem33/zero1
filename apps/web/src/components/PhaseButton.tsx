import React from "react";

interface ProjectSubstep {
  substep_id: string;
  step_number: number;
  label: string;
  completed?: boolean;
}

interface ProjectPhase {
  phase_id: string;
  phase_number: number;
  goal: string;
  completed: boolean;
  locked: boolean;
  substeps?: ProjectSubstep[];
}

interface PhaseButtonProps {
  phase: ProjectPhase;
  isActive: boolean;
  isExpanded: boolean;
  currentSubstep?: number;
  onToggleExpand: () => void;
}

const PhaseButton: React.FC<PhaseButtonProps> = ({
  phase,
  isActive,
  isExpanded,
  currentSubstep,
  onToggleExpand,
}) => {
  const getPhaseStatus = () => {
    if (phase.completed) {
      return {
        icon: "✅",
        color: "bg-green-600/20 border-green-500/50 text-green-400",
        glow: "shadow-green-500/20",
      };
    }
    if (isActive) {
      return {
        icon: "🔄",
        color: "bg-blue-600/20 border-blue-500/50 text-blue-400",
        glow: "shadow-blue-500/30 shadow-lg",
      };
    }
    if (phase.locked) {
      return {
        icon: "🔒",
        color: "bg-gray-600/20 border-gray-500/50 text-gray-500",
        glow: "",
      };
    }
    return {
      icon: "⏳",
      color: "bg-yellow-600/20 border-yellow-500/50 text-yellow-400",
      glow: "",
    };
  };

  const calculateProgress = () => {
    if (!phase.substeps || phase.substeps.length === 0) return 0;
    const completed = phase.substeps.filter((s) => s.completed).length;
    return Math.round((completed / phase.substeps.length) * 100);
  };

  const status = getPhaseStatus();
  const progress = calculateProgress();

  return (
    <div className="space-y-2">
      {/* Phase Header */}
      <div
        className={`
        relative overflow-hidden rounded-lg border transition-all duration-300
        ${status.color}
        ${status.glow}
        ${isActive ? "ring-2 ring-blue-500/50" : ""}
        ${phase.locked ? "opacity-60" : "hover:scale-[1.02]"}
      `}
      >
        {/* Expand/Collapse Button */}
        <button
          onClick={onToggleExpand}
          disabled={phase.locked}
          className="w-full px-3 py-3 text-left"
        >
          <div className="flex items-center gap-3">
            {/* Phase Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{status.icon}</span>
                <span className="text-xs font-bold">P{phase.phase_number}</span>
                <span className="text-xs opacity-60">{progress}%</span>
              </div>
              <div className="text-xs font-medium truncate">{phase.goal}</div>
            </div>

            {/* Expand Icon */}
            {!phase.locked && (
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
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
            )}
          </div>
        </button>

        {/* Substep Checklist (Expandable) */}
        <div
          className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
        `}
        >
          <div className="px-3 pb-3 space-y-1.5">
            {phase.substeps?.map((substep) => {
              const isCurrentSubstep =
                isActive && substep.step_number === currentSubstep;
              const isCompleted = substep.completed;

              return (
                <div
                  key={substep.substep_id}
                  className={`
                  flex items-center gap-2 px-2 py-1.5 rounded text-xs
                  transition-all duration-200
                  ${isCurrentSubstep ? "bg-blue-500/20 ring-1 ring-blue-500/50" : ""}
                  ${isCompleted ? "opacity-60" : ""}
                  ${!isCompleted && !isCurrentSubstep ? "hover:bg-white/5" : ""}
                `}
                >
                  {/* Checkbox Indicator */}
                  <div className="flex-shrink-0">
                    {isCompleted ? (
                      <div className="w-4 h-4 rounded-full bg-green-500/30 border border-green-500 flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-green-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    ) : isCurrentSubstep ? (
                      <div className="w-4 h-4 rounded-full bg-blue-500/30 border-2 border-blue-400 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-500" />
                    )}
                  </div>

                  {/* Substep Label */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`
                      ${isCompleted ? "line-through" : ""}
                      ${isCurrentSubstep ? "font-semibold" : ""}
                    `}
                    >
                      {substep.step_number}. {substep.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhaseButton;
