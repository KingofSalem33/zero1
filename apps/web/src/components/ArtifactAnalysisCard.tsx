import React from "react";

interface ArtifactAnalysis {
  quality_score: number;
  satisfied_criteria: string[];
  partial_criteria: string[];
  missing_criteria: string[];
  tech_stack: string[];
  has_tests: boolean;
  feedback: string;
  suggest_completion: boolean;
  confidence: number;
}

interface ArtifactAnalysisCardProps {
  analysis: ArtifactAnalysis;
  fileName: string;
  stepTitle: string;
  onDismiss: () => void;
}

const ArtifactAnalysisCard: React.FC<ArtifactAnalysisCardProps> = ({
  analysis,
  fileName,
  stepTitle,
  onDismiss,
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "green";
    if (score >= 60) return "yellow";
    return "orange";
  };

  const scoreColor = getScoreColor(analysis.quality_score);

  return (
    <div
      className={`bg-${scoreColor}-600/10 border border-${scoreColor}-500/30 rounded-xl p-5 space-y-4 shadow-lg`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-lg bg-${scoreColor}-500/20 flex items-center justify-center`}
          >
            <svg
              className={`w-6 h-6 text-${scoreColor}-400`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
              📊 Artifact Analysis
              <span
                className={`px-2 py-0.5 bg-${scoreColor}-500/20 text-${scoreColor}-300 rounded text-xs font-normal`}
              >
                {analysis.quality_score}/100
              </span>
            </div>
            <div className="text-xs text-neutral-400 mt-1">{fileName}</div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Dismiss"
        >
          <svg
            className="w-5 h-5"
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

      {/* Feedback */}
      <div className="p-3 bg-neutral-800/30 rounded-lg border border-neutral-700/30">
        <div className="text-sm text-neutral-200">{analysis.feedback}</div>
      </div>

      {/* Step Progress */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-neutral-400">
          Progress on: {stepTitle}
        </div>

        {/* Satisfied Criteria */}
        {analysis.satisfied_criteria.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-green-400">
              ✅ Satisfied ({analysis.satisfied_criteria.length}):
            </div>
            {analysis.satisfied_criteria.map((criteria, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-xs text-neutral-300 pl-4"
              >
                <span className="text-green-400 mt-0.5">•</span>
                <span className="flex-1">{criteria}</span>
              </div>
            ))}
          </div>
        )}

        {/* Partial Criteria */}
        {analysis.partial_criteria.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-yellow-400">
              ◐ Partial ({analysis.partial_criteria.length}):
            </div>
            {analysis.partial_criteria.map((criteria, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-xs text-neutral-300 pl-4"
              >
                <span className="text-yellow-400 mt-0.5">•</span>
                <span className="flex-1">{criteria}</span>
              </div>
            ))}
          </div>
        )}

        {/* Missing Criteria */}
        {analysis.missing_criteria.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-neutral-500">
              ○ Not Yet ({analysis.missing_criteria.length}):
            </div>
            {analysis.missing_criteria.map((criteria, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-xs text-neutral-400 pl-4"
              >
                <span className="text-neutral-500 mt-0.5">•</span>
                <span className="flex-1">{criteria}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tech Stack & Tests */}
      {(analysis.tech_stack.length > 0 || analysis.has_tests) && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-700/30">
          {analysis.tech_stack.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-neutral-500">Tech:</span>
              <div className="flex gap-1">
                {analysis.tech_stack.map((tech, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}
          {analysis.has_tests && (
            <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs">
              ✅ Tests detected
            </span>
          )}
        </div>
      )}

      {/* Completion Suggestion */}
      {analysis.suggest_completion && analysis.confidence >= 60 && (
        <div className="p-3 bg-green-600/10 border border-green-500/30 rounded-lg">
          <div className="text-sm text-green-300 font-medium">
            🎉 This looks good enough to move forward!
          </div>
          <div className="text-xs text-neutral-400 mt-1">
            Your work satisfies the key criteria. Ready to mark this step
            complete?
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtifactAnalysisCard;
