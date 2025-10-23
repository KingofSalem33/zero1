import React, { useState } from "react";

interface ProjectPhase {
  phase_number: number;
  goal: string;
  substeps: ProjectSubstep[];
}

interface ProjectSubstep {
  substep_id: string;
  step_number: number;
  label: string;
  prompt_to_send: string;
}

interface ActiveSubstepCardProps {
  phase: ProjectPhase | null;
  substep: ProjectSubstep | null;
  className?: string;
  onAskAI?: () => void;
}

const ActiveSubstepCard: React.FC<ActiveSubstepCardProps> = ({
  phase,
  substep,
  className = "",
  onAskAI,
}) => {
  const [sending, setSending] = useState(false);

  const handleAskAI = async () => {
    if (!onAskAI) return;
    setSending(true);
    onAskAI();
    setTimeout(() => setSending(false), 1000);
  };

  if (!phase || !substep) {
    return (
      <div
        className={`p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 ${className}`}
      >
        <div className="text-xs text-gray-500 text-center">
          No active substep
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-3 rounded-lg bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/50 ${className}`}
    >
      <div className="text-xs font-semibold text-blue-400 mb-2">
        CURRENTLY WORKING ON
      </div>
      <div className="text-sm font-bold text-white">
        P{phase.phase_number}.{substep.step_number}
      </div>
      <div className="text-xs text-gray-300 mt-1 mb-3">{substep.label}</div>
      <button
        onClick={handleAskAI}
        disabled={sending || !onAskAI}
        className="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-600 text-white text-xs font-medium transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {sending ? (
          <>
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Sending...</span>
          </>
        ) : (
          <>
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <span>Ask AI</span>
          </>
        )}
      </button>
    </div>
  );
};

export default ActiveSubstepCard;
