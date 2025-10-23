import React from "react";

interface ProjectPhase {
  phase_id: string;
  phase_number: number;
  goal: string;
  completed: boolean;
  locked: boolean;
}

interface PhaseButtonProps {
  phase: ProjectPhase;
  isActive: boolean;
  onClick: () => void;
}

const PhaseButton: React.FC<PhaseButtonProps> = ({
  phase,
  isActive,
  onClick,
}) => {
  const getPhaseStatus = () => {
    if (phase.completed) {
      return {
        icon: "✅",
        color: "bg-green-600/20 border-green-500/50 text-green-400",
      };
    }
    if (isActive) {
      return {
        icon: "🔄",
        color: "bg-blue-600/20 border-blue-500/50 text-blue-400",
      };
    }
    if (phase.locked) {
      return {
        icon: "🔒",
        color: "bg-gray-600/20 border-gray-500/50 text-gray-500",
      };
    }
    return {
      icon: "⏳",
      color: "bg-yellow-600/20 border-yellow-500/50 text-yellow-400",
    };
  };

  const status = getPhaseStatus();

  return (
    <button
      onClick={onClick}
      className={`
        w-full px-3 py-2 rounded-lg border transition-all
        hover:scale-105 active:scale-95
        ${status.color}
        ${isActive ? "ring-2 ring-blue-500/50 shadow-lg" : ""}
      `}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{status.icon}</span>
        <div className="flex-1 text-left">
          <div className="text-xs font-semibold">
            Phase {phase.phase_number}
          </div>
          <div className="text-xs opacity-80 truncate">{phase.goal}</div>
        </div>
      </div>
    </button>
  );
};

export default PhaseButton;
