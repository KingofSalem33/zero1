import React, { useRef, useState } from "react";
import { ArtifactDiffModal } from "./ArtifactDiffModal";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

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

interface ArtifactData {
  id: string;
  status: string;
  roadmap_diff?: string;
  completed_substeps?: SubstepCompletion[];
  progress_percentage?: number;
  analysis?: LLMAnalysis;
}

interface ArtifactUploadButtonProps {
  projectId: string | null;
  onUploadComplete?: (artifact: ArtifactData) => void;
}

export const ArtifactUploadButton: React.FC<ArtifactUploadButtonProps> = ({
  projectId,
  onUploadComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [analyzedArtifact, setAnalyzedArtifact] = useState<ArtifactData | null>(
    null,
  );
  const [canCancel, setCanCancel] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [lastArtifactId, setLastArtifactId] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);

  // Apply analysis to update roadmap
  const applyAnalysis = async (artifactId: string): Promise<boolean> => {
    try {
      console.log(
        "[Apply Analysis] Applying analysis for artifact:",
        artifactId,
      );
      const response = await fetch(
        `${API_URL}/api/artifact-actions/apply-analysis/${artifactId}`,
        {
          method: "POST",
        },
      );

      const data = await response.json();

      if (response.ok) {
        console.log("[Apply Analysis] Successfully applied:", data);
        return true;
      } else {
        console.error("[Apply Analysis] Failed:", data);
        return false;
      }
    } catch (error) {
      console.error("[Apply Analysis] Error:", error);
      return false;
    }
  };

  // Poll artifact status until analysis completes
  const pollArtifactStatus = async (
    artifactId: string,
  ): Promise<ArtifactData | null> => {
    const maxAttempts = 30; // 30 seconds max
    let attempts = 0;

    setCanCancel(true);
    setProgressPercentage(10); // Start at 10% after upload

    while (attempts < maxAttempts) {
      // Check if cancel was requested
      if (cancelRequested) {
        setUploadProgress("❌ Cancelled");
        setCanCancel(false);
        return null;
      }

      try {
        const response = await fetch(`${API_URL}/api/artifacts/${artifactId}`);
        const data = await response.json();

        if (response.ok && data.artifact) {
          const artifact = data.artifact;

          // Update progress based on attempts (simulate progress)
          const progress = Math.min(10 + (attempts / maxAttempts) * 85, 95);
          setProgressPercentage(Math.round(progress));

          // Update status message based on progress
          if (progress < 30) {
            setUploadProgress("🔍 Starting analysis...");
          } else if (progress < 60) {
            setUploadProgress("🧠 Analyzing code structure...");
          } else if (progress < 90) {
            setUploadProgress("📊 Matching to roadmap...");
          } else {
            setUploadProgress("✨ Finalizing...");
          }

          // Check if analysis is complete
          if (artifact.status === "analyzed") {
            setProgressPercentage(100);
            setCanCancel(false);
            return artifact;
          } else if (artifact.status === "failed") {
            setCanCancel(false);
            throw new Error("Analysis failed");
          }
        }
      } catch (error) {
        console.error("[Poll] Error:", error);
      }

      // Wait 1 second before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    setCanCancel(false);
    return null; // Timeout
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;

    console.log("[Upload] Starting upload with project_id:", projectId);

    // Reset state
    setIsUploading(true);
    setUploadProgress("📤 Uploading file...");
    setProgressPercentage(5);
    setCancelRequested(false);
    setShowRetry(false);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", projectId);

    try {
      const response = await fetch(`${API_URL}/api/artifacts/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.artifact) {
        console.log("[Upload] Success:", data);
        setLastArtifactId(data.artifact.id);

        // Poll for analysis completion
        const analyzedData = await pollArtifactStatus(data.artifact.id);

        if (analyzedData) {
          setUploadProgress("✅ Analysis Complete!");
          setProgressPercentage(100);

          // Apply analysis to update roadmap
          if (analyzedData.analysis) {
            setUploadProgress("🔄 Applying changes...");
            await applyAnalysis(data.artifact.id);
          }

          // Show diff modal if we have analysis results
          if (analyzedData.analysis) {
            setAnalyzedArtifact(analyzedData);
            setShowDiffModal(true);
          }

          // Notify parent to refresh project state
          if (onUploadComplete) {
            onUploadComplete(analyzedData);
          }

          // Clear progress after modal is shown
          setTimeout(() => {
            setUploadProgress("");
            setProgressPercentage(0);
          }, 1500);
        } else {
          setUploadProgress(
            "⚠️ Analysis timeout - artifact saved but analysis incomplete",
          );
          setShowRetry(true);
          setTimeout(() => setUploadProgress(""), 5000);
        }
      } else {
        console.error("[Upload] Failed:", data);
        setUploadProgress(`❌ Upload failed: ${data.error || "Unknown error"}`);
        setShowRetry(true);
        setTimeout(() => setUploadProgress(""), 5000);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadProgress("❌ Network error - check your connection");
      setShowRetry(true);
      setTimeout(() => setUploadProgress(""), 5000);
    } finally {
      setIsUploading(false);
      setCanCancel(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Retry analysis for last uploaded artifact
  const handleRetry = async () => {
    if (!lastArtifactId) return;

    setIsUploading(true);
    setShowRetry(false);
    setUploadProgress("🔄 Retrying analysis...");
    setProgressPercentage(10);
    setCancelRequested(false);

    try {
      const analyzedData = await pollArtifactStatus(lastArtifactId);

      if (analyzedData) {
        setUploadProgress("✅ Analysis Complete!");
        setProgressPercentage(100);

        // Apply analysis to update roadmap
        if (analyzedData.analysis) {
          setUploadProgress("🔄 Applying changes...");
          await applyAnalysis(lastArtifactId);
        }

        if (analyzedData.analysis) {
          setAnalyzedArtifact(analyzedData);
          setShowDiffModal(true);
        }

        if (onUploadComplete) {
          onUploadComplete(analyzedData);
        }

        setTimeout(() => {
          setUploadProgress("");
          setProgressPercentage(0);
        }, 1500);
      } else {
        setUploadProgress("⚠️ Analysis timeout again");
        setShowRetry(true);
        setTimeout(() => setUploadProgress(""), 3000);
      }
    } catch (error) {
      console.error("Retry error:", error);
      setUploadProgress("❌ Retry failed");
      setShowRetry(true);
      setTimeout(() => setUploadProgress(""), 3000);
    } finally {
      setIsUploading(false);
    }
  };

  // Cancel analysis
  const handleCancel = () => {
    setCancelRequested(true);
    setCanCancel(false);
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!projectId || isUploading}
          className="w-8 h-8 rounded-lg bg-gray-700/60 hover:bg-gray-600/80 disabled:bg-gray-800/40 flex items-center justify-center transition-colors relative group"
          title="Upload artifact"
        >
          {isUploading ? (
            <div className="w-3 h-3 border-2 border-gray-400/30 border-t-gray-300 rounded-full animate-spin" />
          ) : (
            <svg
              className="w-4 h-4 text-gray-300 group-hover:text-white transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          )}
        </button>

        {showRetry && !isUploading && (
          <button
            onClick={handleRetry}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-yellow-600 hover:bg-yellow-500 flex items-center justify-center transition-colors shadow-lg"
            title="Retry analysis"
          >
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept=".zip,.js,.jsx,.ts,.tsx,.py,.java,.go,.txt,.md,.json"
      />

      {/* Enhanced Progress Indicator */}
      {uploadProgress && (
        <div className="absolute -top-24 left-1/2 transform -translate-x-1/2 bg-gray-800/95 backdrop-blur-sm text-white px-4 py-3 rounded-xl text-xs shadow-2xl border border-gray-700 min-w-[240px]">
          {/* Status Message */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">{uploadProgress}</span>
            {canCancel && (
              <button
                onClick={handleCancel}
                className="ml-2 text-red-400 hover:text-red-300 transition-colors"
                title="Cancel"
              >
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Progress Bar */}
          {progressPercentage > 0 && (
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 transition-all duration-300 ease-out"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          )}

          {/* Percentage */}
          {progressPercentage > 0 && (
            <div className="text-right text-gray-400 mt-1 text-[10px]">
              {progressPercentage}%
            </div>
          )}

          {/* Guidance for timeout/errors */}
          {showRetry && (
            <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-400">
              💡 Click the retry button to try again
            </div>
          )}
        </div>
      )}

      {/* Diff Modal */}
      <ArtifactDiffModal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        completedSubsteps={analyzedArtifact?.completed_substeps || []}
        llmAnalysis={analyzedArtifact?.analysis || null}
        progressPercentage={analyzedArtifact?.progress_percentage}
      />
    </>
  );
};
