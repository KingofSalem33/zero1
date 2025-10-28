import React, { useState } from "react";

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
  substep_requirements?: Array<{
    requirement: string;
    status: "DONE" | "PARTIAL" | "NOT_STARTED";
    evidence: string;
  }>;
  substep_completion_percentage?: number;
  rollback_warning?: {
    severity: "warning" | "critical";
    reason: string;
    evidence: string[];
    guidance: string[];
  };
  rollback_executed?: boolean;
  rollback_guidance?: string[];
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
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [acceptingRollback, setAcceptingRollback] = useState(false);

  if (!isOpen) {
    return null;
  }

  const completeCount = completedSubsteps.filter(
    (s) => s.status === "complete",
  ).length;

  const handleIgnoreWarning = () => {
    setWarningDismissed(true);
  };

  const handleAcceptRollback = async () => {
    setAcceptingRollback(true);
    // TODO: Call backend API to execute rollback
    // For now, just show a message
    window.alert(
      "Rollback functionality requires a dedicated API endpoint. The system will auto-rollback on the next artifact upload if issues persist.",
    );
    setAcceptingRollback(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700/50 bg-gradient-brand-muted">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
              <svg
                className="w-5 h-5 text-white"
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
              <p className="text-sm text-brand-primary-400 font-medium">
                Expert feedback on your progress
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-neutral-800/60 hover:bg-neutral-700/60 flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <svg
              className="w-5 h-5 text-neutral-400"
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
          <div className="px-6 py-3 bg-neutral-800/40">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-neutral-400">
                Overall Progress
              </span>
              <span className="text-xs font-semibold text-brand-primary-400">
                {progressPercentage}%
              </span>
            </div>
            <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-brand transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Rollback Executed Warning */}
          {llmAnalysis?.rollback_executed && (
            <div className="p-4 rounded-xl bg-gradient-warning-subtle border-2 border-warning-500/50 animate-pulse">
              <h3 className="text-sm font-bold text-warning-400 mb-2 flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                Project Rolled Back
              </h3>
              <p className="text-sm text-neutral-300 mb-3">
                Multiple attempts showed critical issues. Your project has been
                restored to an earlier, stable phase to rebuild the foundation
                correctly.
              </p>
              {llmAnalysis.rollback_guidance && (
                <div className="space-y-1">
                  {llmAnalysis.rollback_guidance.map((guidance, i) => (
                    <div
                      key={i}
                      className="text-sm text-warning-300 flex items-start gap-2"
                    >
                      <span>→</span>
                      <span>{guidance}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rollback Warning (not yet executed) */}
          {!llmAnalysis?.rollback_executed &&
            llmAnalysis?.rollback_warning &&
            !warningDismissed && (
              <div
                className={`p-4 rounded-xl border-2 ${llmAnalysis.rollback_warning.severity === "critical" ? "bg-gradient-error-subtle border-error-500/50" : "bg-gradient-warning-subtle border-warning-500/50"}`}
              >
                <h3
                  className={`text-sm font-bold mb-2 flex items-center gap-2 ${llmAnalysis.rollback_warning.severity === "critical" ? "text-error-400" : "text-warning-400"}`}
                >
                  <span className="text-xl">
                    {llmAnalysis.rollback_warning.severity === "critical"
                      ? "🚨"
                      : "⚠️"}
                  </span>
                  {llmAnalysis.rollback_warning.severity === "critical"
                    ? "Critical Warning"
                    : "Warning"}
                </h3>
                <p className="text-sm text-neutral-300 mb-2">
                  {llmAnalysis.rollback_warning.reason}
                </p>
                {llmAnalysis.rollback_warning.evidence.length > 0 && (
                  <div className="mb-3 space-y-1">
                    <p className="text-xs font-semibold text-neutral-400">
                      Evidence:
                    </p>
                    {llmAnalysis.rollback_warning.evidence.map((ev, i) => (
                      <div
                        key={i}
                        className="text-sm text-neutral-400 flex items-start gap-2"
                      >
                        <span>•</span>
                        <span>{ev}</span>
                      </div>
                    ))}
                  </div>
                )}
                {llmAnalysis.rollback_warning.guidance.length > 0 && (
                  <div className="mb-4 space-y-1">
                    <p className="text-xs font-semibold text-neutral-400">
                      Recommendations:
                    </p>
                    {llmAnalysis.rollback_warning.guidance.map((guide, i) => (
                      <div
                        key={i}
                        className="text-sm text-neutral-300 flex items-start gap-2"
                      >
                        <span>→</span>
                        <span>{guide}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-3 border-t border-neutral-700">
                  <button
                    onClick={handleAcceptRollback}
                    disabled={acceptingRollback}
                    className={`flex-1 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                      llmAnalysis.rollback_warning.severity === "critical"
                        ? "bg-gradient-error hover:bg-gradient-error-hover disabled:bg-neutral-700"
                        : "bg-gradient-warning hover:bg-gradient-warning-hover disabled:bg-neutral-700"
                    } text-white disabled:cursor-not-allowed`}
                  >
                    {acceptingRollback ? "Processing..." : "🔄 Accept Rollback"}
                  </button>
                  <button
                    onClick={handleIgnoreWarning}
                    className="flex-1 px-4 py-2 rounded-xl font-medium text-sm bg-neutral-700/60 hover:bg-neutral-600/60 text-white transition-all"
                  >
                    Continue Anyway
                  </button>
                </div>
              </div>
            )}

          {/* Quality Score - Lead with this */}
          {llmAnalysis?.quality_score !== undefined && (
            <div className="p-4 rounded-xl bg-gradient-brand-subtle border border-brand-primary-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-brand-primary-400">
                  Quality Score
                </span>
                <span className="text-2xl font-bold text-brand-primary-300">
                  {llmAnalysis.quality_score}/10
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-brand transition-all duration-500"
                  style={{ width: `${llmAnalysis.quality_score * 10}%` }}
                />
              </div>
            </div>
          )}

          {/* Substep Requirements Progress */}
          {llmAnalysis?.substep_requirements &&
            llmAnalysis.substep_requirements.length > 0 && (
              <div className="p-4 rounded-xl bg-gradient-brand-subtle border border-brand-secondary-500/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-brand-secondary-400 flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-brand-secondary-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    Substep Requirements
                  </h3>
                  <span className="text-sm font-bold text-brand-secondary-300">
                    {llmAnalysis.substep_completion_percentage || 0}%
                  </span>
                </div>
                <div className="space-y-2">
                  {llmAnalysis.substep_requirements.map((req, i) => (
                    <div key={i} className="text-sm">
                      <div className="flex items-start gap-2 mb-1">
                        <span
                          className={`mt-0.5 ${req.status === "DONE" ? "text-success-400" : req.status === "PARTIAL" ? "text-warning-400" : "text-neutral-500"}`}
                        >
                          {req.status === "DONE"
                            ? "✓"
                            : req.status === "PARTIAL"
                              ? "◐"
                              : "○"}
                        </span>
                        <div className="flex-1">
                          <span
                            className={`font-medium ${req.status === "DONE" ? "text-success-400" : req.status === "PARTIAL" ? "text-warning-400" : "text-neutral-400"}`}
                          >
                            {req.requirement}
                          </span>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {req.evidence}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Expert Feedback */}
          {llmAnalysis?.detailed_analysis && (
            <div className="p-4 rounded-xl bg-neutral-800/60 border border-neutral-600">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-brand-primary-400"
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
              <p className="text-sm text-neutral-300 leading-relaxed">
                {llmAnalysis.detailed_analysis}
              </p>
            </div>
          )}

          {/* What's Working */}
          {completedSubsteps.length > 0 && (
            <div className="p-4 rounded-xl bg-gradient-success-subtle border border-success-500/30">
              <h3 className="text-sm font-semibold text-success-400 mb-3 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-success-400"
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
                    className="text-sm text-neutral-300 flex items-start gap-2"
                  >
                    <span className="text-success-400">✓</span>
                    <span>{substep.evidence}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing Elements */}
          {llmAnalysis?.missing_elements &&
            llmAnalysis.missing_elements.length > 0 && (
              <div className="p-4 rounded-xl bg-gradient-warning-subtle border border-warning-500/30">
                <h3 className="text-sm font-semibold text-warning-400 mb-3 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-warning-400"
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
                      className="text-sm text-neutral-300 flex items-start gap-2"
                    >
                      <span className="text-warning-400 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Bugs/Issues */}
          {llmAnalysis?.bugs_or_errors &&
            llmAnalysis.bugs_or_errors.length > 0 && (
              <div className="p-4 rounded-xl bg-gradient-error-subtle border border-error-500/30">
                <h3 className="text-sm font-semibold text-error-400 mb-3 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-error-400"
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
                      className="text-sm text-neutral-300 flex items-start gap-2"
                    >
                      <span className="text-error-400 mt-0.5">!</span>
                      <span>{bug}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Next Steps */}
          {llmAnalysis?.next_steps && llmAnalysis.next_steps.length > 0 && (
            <div className="p-4 rounded-xl bg-gradient-brand-subtle border border-brand-primary-500/30">
              <h3 className="text-sm font-semibold text-brand-primary-400 mb-3 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-brand-primary-400"
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
                    className="text-sm text-neutral-300 flex items-start gap-3"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-primary-500/20 text-brand-primary-400 flex items-center justify-center text-xs font-bold">
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
        <div className="px-6 py-4 border-t border-neutral-700 bg-neutral-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold transition-all duration-200 shadow-lg shadow-blue-500/20"
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
