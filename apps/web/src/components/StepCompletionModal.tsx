import React from "react";

interface StepCompletionModalProps {
  stepNumber: number;
  stepTitle: string;
  acceptanceCriteria: string[];
  mentorshipFeedback: string;
  statusRecommendation: "READY_TO_COMPLETE" | "KEEP_WORKING" | "BLOCKED";
  totalSteps: number;
  onKeepWorking: () => void;
  onMarkComplete: () => void;
}

export const StepCompletionModal: React.FC<StepCompletionModalProps> = ({
  stepNumber,
  stepTitle,
  acceptanceCriteria: _acceptanceCriteria,
  mentorshipFeedback,
  statusRecommendation,
  totalSteps,
  onKeepWorking,
  onMarkComplete,
}) => {
  const completionPercentage = Math.round((stepNumber / totalSteps) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-700/50 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Subtle top accent */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

        {/* Header */}
        <div className="p-8 pb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
              {stepNumber}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white">{stepTitle}</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {completionPercentage}% of journey complete
              </p>
            </div>
          </div>
        </div>

        {/* Feedback */}
        <div className="px-8 pb-6">
          <div className="bg-neutral-800/40 border border-neutral-700/30 rounded-xl p-5 backdrop-blur-sm">
            <p className="text-neutral-200 leading-relaxed whitespace-pre-wrap">
              {mentorshipFeedback}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex items-center gap-3">
          <button
            onClick={onKeepWorking}
            className="flex-1 px-5 py-3 text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800/50 rounded-xl transition-all border border-neutral-700/30 hover:border-neutral-600"
          >
            Keep Working
          </button>
          <button
            onClick={onMarkComplete}
            className={`flex-1 px-5 py-3 text-sm font-semibold rounded-xl transition-all shadow-lg ${
              statusRecommendation === "READY_TO_COMPLETE"
                ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-blue-500/25"
                : "bg-neutral-700/50 hover:bg-neutral-700 text-neutral-300 border border-neutral-600/50"
            }`}
            autoFocus
          >
            {statusRecommendation === "READY_TO_COMPLETE"
              ? "Continue →"
              : "Mark Complete Anyway"}
          </button>
        </div>
      </div>
    </div>
  );
};
