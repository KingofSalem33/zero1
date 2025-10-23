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
}

const ActiveSubstepCard: React.FC<ActiveSubstepCardProps> = ({
  phase,
  substep,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    if (!substep?.prompt_to_send) return;

    try {
      await navigator.clipboard.writeText(substep.prompt_to_send);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Failed to copy - ignore
    }
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
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-blue-400">
          CURRENTLY WORKING ON
        </div>
        <button
          onClick={copyToClipboard}
          className="p-1 rounded hover:bg-blue-500/30 transition-colors"
          title="Copy master prompt"
        >
          {copied ? (
            <svg
              className="w-4 h-4 text-green-400"
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
          ) : (
            <svg
              className="w-4 h-4 text-blue-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>
      </div>
      <div className="text-sm font-bold text-white">
        P{phase.phase_number}.{substep.step_number}
      </div>
      <div className="text-xs text-gray-300 mt-1">{substep.label}</div>
    </div>
  );
};

export default ActiveSubstepCard;
