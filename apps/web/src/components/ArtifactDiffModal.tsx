import React from "react";

interface SubstepCompletion {
  phase_number: number;
  substep_number: number;
  status: "complete" | "partial" | "incomplete";
  evidence: string;
  confidence: number;
  timestamp: string;
}

interface LLMAnalysis {
  decision?: string;
  actual_phase?: string;
  quality_score?: number;
  detailed_analysis?: string;
  missing_elements?: string[];
  bugs_or_errors?: string[];
  next_steps?: string[];
  implementation_state?: string;
}

interface ArtifactDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  completedSubsteps: SubstepCompletion[];
  llmAnalysis?: LLMAnalysis | null;
  progressPercentage?: number;
}

export const ArtifactDiffModal: React.FC<ArtifactDiffModalProps> = ({
  isOpen,
  onClose,
  completedSubsteps,
  llmAnalysis,
  progressPercentage,
}) => {
  if (!isOpen) return null;

  const completeCount = completedSubsteps.filter(
    (s) => s.status === "complete",
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gradient-to-r from-emerald-900/20 to-blue-900/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-emerald-400"
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
                Work Reviewed
              </h2>
              <p className="text-sm text-emerald-400">
                Expert feedback on your progress
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
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Quality Score - Lead with this */}
          {llmAnalysis?.quality_score !== undefined && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-emerald-900/20 to-blue-900/20 border border-emerald-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-emerald-400">
                  Quality Score
                </span>
                <span className="text-2xl font-bold text-emerald-300">
                  {llmAnalysis.quality_score}/10
                </span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${llmAnalysis.quality_score * 10}%` }}
                />
              </div>
            </div>
          )}

          {/* Expert Feedback */}
          {llmAnalysis?.detailed_analysis && (
            <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-600">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  />
                </svg>
                Expert Review
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                {llmAnalysis.detailed_analysis}
              </p>
            </div>
          )}

          {/* What's Working */}
          {completedSubsteps.length > 0 && (
            <div className="p-4 rounded-lg bg-green-900/10 border border-green-500/30">
              <h3 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                What's Working ({completeCount} complete)
              </h3>
              <div className="space-y-2">
                {completedSubsteps.slice(0, 3).map((substep, i) => (
                  <div
                    key={i}
                    className="text-sm text-gray-300 flex items-start gap-2"
                  >
                    <span className="text-green-400">✓</span>
                    <span>{substep.evidence}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing Elements */}
          {llmAnalysis?.missing_elements &&
            llmAnalysis.missing_elements.length > 0 && (
              <div className="p-4 rounded-lg bg-yellow-900/10 border border-yellow-500/30">
                <h3 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
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
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  What's Missing
                </h3>
                <ul className="space-y-1.5">
                  {llmAnalysis.missing_elements.map((item, i) => (
                    <li
                      key={i}
                      className="text-sm text-gray-300 flex items-start gap-2"
                    >
                      <span className="text-yellow-400 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Bugs/Issues */}
          {llmAnalysis?.bugs_or_errors &&
            llmAnalysis.bugs_or_errors.length > 0 && (
              <div className="p-4 rounded-lg bg-red-900/10 border border-red-500/30">
                <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
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
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Issues to Fix
                </h3>
                <ul className="space-y-1.5">
                  {llmAnalysis.bugs_or_errors.map((bug, i) => (
                    <li
                      key={i}
                      className="text-sm text-gray-300 flex items-start gap-2"
                    >
                      <span className="text-red-400 mt-0.5">!</span>
                      <span>{bug}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Next Steps */}
          {llmAnalysis?.next_steps && llmAnalysis.next_steps.length > 0 && (
            <div className="p-4 rounded-lg bg-blue-900/10 border border-blue-500/30">
              <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
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
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
                Next Steps
              </h3>
              <ol className="space-y-2">
                {llmAnalysis.next_steps.map((step, i) => (
                  <li
                    key={i}
                    className="text-sm text-gray-300 flex items-start gap-3"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/40">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 text-white font-semibold transition-all"
          >
            {llmAnalysis?.next_steps && llmAnalysis.next_steps.length > 0
              ? "Got it - Let's keep building 🚀"
              : "Continue Building"}
          </button>
        </div>
      </div>
    </div>
  );
};
