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
      className={`relative p-4 rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/50 shadow-lg shadow-blue-500/20 ${className}`}
    >
      {/* Animated gradient background */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-blue-600/10 animate-pulse opacity-50" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-blue-400 tracking-wide">
            CURRENT STEP
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-xs text-blue-300">In Progress</span>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <div className="text-2xl font-black text-white">
            P{phase.phase_number}.{substep.step_number}
          </div>
          <div className="text-xs text-gray-400">/ {phase.goal}</div>
        </div>

        <div className="text-sm text-gray-200 mb-4 leading-relaxed">
          {substep.label}
        </div>

        <button
          onClick={handleAskAI}
          disabled={sending || !onAskAI}
          className="group w-full px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-600 text-white text-sm font-bold transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95"
        >
          {sending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4 group-hover:rotate-12 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>Ask AI to Start</span>
              <svg
                className="w-3 h-3 opacity-70 group-hover:translate-x-1 transition-transform"
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
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ActiveSubstepCard;
