import React from "react";

interface SubstepCompletion {
  phase_number: number;
  substep_number: number;
  status: "complete" | "partial" | "incomplete";
  evidence: string;
  confidence: number;
  timestamp: string;
}

interface ArtifactDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  roadmapDiff: string | null;
  completedSubsteps: SubstepCompletion[];
  recommendedPhase?: number;
  progressPercentage?: number;
}

export const ArtifactDiffModal: React.FC<ArtifactDiffModalProps> = ({
  isOpen,
  onClose,
  roadmapDiff,
  completedSubsteps,
  recommendedPhase,
  progressPercentage,
}) => {
  if (!isOpen) return null;

  const completeCount = completedSubsteps.filter(
    (s) => s.status === "complete",
  ).length;
  const partialCount = completedSubsteps.filter(
    (s) => s.status === "partial",
  ).length;

  // Group substeps by phase for display
  const byPhase = completedSubsteps.reduce(
    (acc, substep) => {
      if (!acc[substep.phase_number]) {
        acc[substep.phase_number] = [];
      }
      acc[substep.phase_number].push(substep);
      return acc;
    },
    {} as Record<number, SubstepCompletion[]>,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gradient-to-r from-blue-900/20 to-purple-900/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Artifact Analysis Complete
              </h2>
              <p className="text-sm text-gray-400">
                {completeCount} substep{completeCount !== 1 ? "s" : ""} detected
                {partialCount > 0 && `, ${partialCount} partial`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 flex items-center justify-center transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-400"
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

        {/* Progress bar */}
        {progressPercentage !== undefined && (
          <div className="px-6 py-3 bg-gray-800/40">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-400">
                Overall Progress
              </span>
              <span className="text-xs font-semibold text-blue-400">
                {progressPercentage}%
              </span>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Completed substeps by phase */}
          {Object.keys(byPhase).length > 0 && (
            <div className="space-y-4">
              {Object.entries(byPhase)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([phase, substeps]) => (
                  <div key={phase} className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-300">
                      Phase {phase}
                    </h3>
                    <div className="space-y-2">
                      {substeps
                        .sort((a, b) => a.substep_number - b.substep_number)
                        .map((substep) => (
                          <div
                            key={`${substep.phase_number}-${substep.substep_number}`}
                            className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/50"
                          >
                            {/* Status icon */}
                            <div className="flex-shrink-0 mt-0.5">
                              {substep.status === "complete" && (
                                <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
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
                              )}
                              {substep.status === "partial" && (
                                <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center">
                                  <svg
                                    className="w-3 h-3 text-yellow-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                  </svg>
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-gray-500">
                                  Substep {substep.substep_number}
                                </span>
                                {substep.confidence < 100 && (
                                  <span className="text-xs text-gray-600">
                                    {substep.confidence}% confidence
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-300">
                                {substep.evidence}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Raw diff summary (fallback) */}
          {roadmapDiff && (
            <div className="mt-4 p-4 rounded-lg bg-gray-800/60 border border-gray-700">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                {roadmapDiff}
              </pre>
            </div>
          )}

          {/* Recommendation */}
          {recommendedPhase && (
            <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-blue-300 mb-1">
                    Next Step
                  </p>
                  <p className="text-sm text-gray-300">
                    {recommendedPhase === 1
                      ? "Start with Phase 1: Build Environment"
                      : recommendedPhase <= 7
                        ? `Continue to Phase ${recommendedPhase}`
                        : "Project appears complete! Move to Phase 7: Reflect & Evolve"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/40">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            Continue Building
          </button>
        </div>
      </div>
    </div>
  );
};
