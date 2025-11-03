import React from "react";

interface CompletionSuggestion {
  should_complete: boolean;
  confidence_score: number;
  reasoning: string;
  suggestion_message: string;
  evidence: {
    satisfied_criteria: string[];
    missing_criteria: string[];
    conversation_signals: string[];
  };
}

interface CompletionSuggestionCardProps {
  suggestion: CompletionSuggestion;
  currentStepTitle: string;
  nextStepTitle?: string;
  onAccept: () => void;
  onDismiss: () => void;
  isProcessing?: boolean;
}

const CompletionSuggestionCard: React.FC<CompletionSuggestionCardProps> = ({
  suggestion,
  _currentStepTitle,
  nextStepTitle,
  onAccept,
  onDismiss,
  isProcessing = false,
}) => {
  if (!suggestion.should_complete) {
    return null;
  }

  return (
    <div className="bg-green-600/10 border border-green-500/30 rounded-xl p-5 space-y-4 shadow-lg">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-green-400"
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
        <div className="flex-1">
          <div className="text-sm font-semibold text-green-400 flex items-center gap-2">
            Step Complete
            <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs font-normal">
              {suggestion.confidence_score}% confident
            </span>
          </div>
          <div className="text-sm text-neutral-200 mt-1">
            {suggestion.suggestion_message}
          </div>
        </div>
      </div>

      {/* Evidence */}
      {suggestion.evidence.satisfied_criteria.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-400">
            ✓ Completed:
          </div>
          <div className="space-y-1">
            {suggestion.evidence.satisfied_criteria
              .slice(0, 3)
              .map((criteria, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-xs text-neutral-300"
                >
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span className="flex-1">{criteria}</span>
                </div>
              ))}
            {suggestion.evidence.satisfied_criteria.length > 3 && (
              <div className="text-xs text-neutral-500 pl-5">
                +{suggestion.evidence.satisfied_criteria.length - 3} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reasoning (collapsible) */}
      {suggestion.reasoning && (
        <details className="group">
          <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-300 flex items-center gap-1">
            <svg
              className="w-3 h-3 transition-transform group-open:rotate-90"
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
            View AI reasoning
          </summary>
          <div className="mt-2 text-xs text-neutral-400 pl-4 border-l-2 border-neutral-700">
            {suggestion.reasoning}
          </div>
        </details>
      )}

      {/* Next Step Preview */}
      {nextStepTitle && (
        <div className="p-3 bg-neutral-800/30 rounded-lg border border-neutral-700/30">
          <div className="text-xs text-neutral-500 mb-1">Next up:</div>
          <div className="text-sm text-neutral-200">{nextStepTitle}</div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onAccept}
          disabled={isProcessing}
          className="btn-success flex-1"
        >
          {isProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Completing...</span>
            </>
          ) : (
            <>
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
              <span>Continue to Next Step</span>
            </>
          )}
        </button>
        <button
          onClick={onDismiss}
          disabled={isProcessing}
          className="btn-ghost"
        >
          Keep Working
        </button>
      </div>
    </div>
  );
};

export default CompletionSuggestionCard;
