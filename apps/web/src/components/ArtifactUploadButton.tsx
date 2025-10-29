import React, { useRef, useState } from "react";
import { ArtifactDiffModal } from "./ArtifactDiffModal";
import { Toast } from "./Toast";

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
  onUploadComplete?: () => void;
  variant?: "icon" | "button";
  label?: string;
  showIcon?: boolean;
}

export const ArtifactUploadButton: React.FC<ArtifactUploadButtonProps> = ({
  projectId,
  onUploadComplete,
  variant = "icon",
  label = "Upload",
  showIcon = true,
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
  const [momentumMessage, setMomentumMessage] = useState<string>("");

  // Apply analysis to update roadmap
  const applyAnalysis = async (artifactId: string): Promise<boolean> => {
    try {
      // Applying analysis for artifact
      const response = await fetch(
        `${API_URL}/api/artifact-actions/apply-analysis/${artifactId}`,
        {
          method: "POST",
        },
      );

      if (response.ok) {
        // Analysis successfully applied
        return true;
      } else {
        // Apply analysis failed
        return false;
      }
    } catch {
      // Apply analysis error
      return false;
    }
  };

  // Stream artifact status via SSE until analysis completes
  const streamArtifactStatus = async (
    artifactId: string,
  ): Promise<ArtifactData | null> => {
    return new Promise((resolve) => {
      setCanCancel(true);
      setProgressPercentage(10); // Start at 10% after upload

      // Open SSE connection
      // eslint-disable-next-line no-undef
      const eventSource = new EventSource(
        `${API_URL}/api/artifacts/stream/${artifactId}`,
      );

      // Timeout after 60 seconds
      const timeout = setTimeout(() => {
        eventSource.close();
        setCanCancel(false);
        resolve(null);
      }, 60000);

      // Handle status events
      eventSource.addEventListener("status", (event) => {
        const data = JSON.parse(event.data);

        // Check if cancel was requested
        if (cancelRequested) {
          clearTimeout(timeout);
          eventSource.close();
          setUploadProgress("Cancelled");
          setCanCancel(false);
          resolve(null);
          return;
        }

        // Update UI based on status
        if (data.status === "connected") {
          setUploadProgress("Connected - waiting for analysis...");
          setProgressPercentage(15);
        } else if (data.status === "analyzing") {
          setUploadProgress(data.message || "Analyzing with AI...");
          setProgressPercentage(50);
        } else if (data.status === "analyzed") {
          setUploadProgress(data.message || "Analysis complete");
          setProgressPercentage(95);

          // Fetch final artifact data
          clearTimeout(timeout);
          eventSource.close();
          setCanCancel(false);

          fetch(`${API_URL}/api/artifacts/${artifactId}`)
            .then((res) => res.json())
            .then((result) => {
              const artifact = result.id ? result : result.artifact;
              setProgressPercentage(100);
              resolve(artifact);
            })
            .catch(() => {
              resolve(null);
            });
        } else if (data.status === "failed") {
          clearTimeout(timeout);
          eventSource.close();
          setCanCancel(false);
          setUploadProgress("Analysis failed");
          resolve(null);
        }
      });

      // Handle momentum summary events
      eventSource.addEventListener("momentum", (event) => {
        try {
          const data = JSON.parse((event as any).data);
          if (data?.summary) {
            setMomentumMessage(data.summary);
            // Auto-clear after a few seconds (toast handles its own timeout)
          }
        } catch {
          // Ignore parse errors
        }
      });

      // Handle errors
      eventSource.addEventListener("error", () => {
        clearTimeout(timeout);
        eventSource.close();
        setCanCancel(false);

        // Fall back to polling on SSE failure
        setUploadProgress("Falling back to polling...");
        pollArtifactStatusFallback(artifactId).then(resolve);
      });
    });
  };

  // Fallback polling if SSE fails
  const pollArtifactStatusFallback = async (
    artifactId: string,
  ): Promise<ArtifactData | null> => {
    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      if (cancelRequested) {
        setUploadProgress("Cancelled");
        return null;
      }

      try {
        const response = await fetch(`${API_URL}/api/artifacts/${artifactId}`);
        const data = await response.json();
        const artifact = data.id ? data : data.artifact;

        if (response.ok && artifact) {
          const progress = Math.min(10 + (attempts / maxAttempts) * 85, 95);
          setProgressPercentage(Math.round(progress));

          if (progress < 30) setUploadProgress("Starting analysis...");
          else if (progress < 60)
            setUploadProgress("Analyzing code structure...");
          else if (progress < 90) setUploadProgress("Matching to roadmap...");
          else setUploadProgress("Finalizing...");

          if (artifact.status === "analyzed") {
            setProgressPercentage(100);
            return artifact;
          } else if (artifact.status === "failed") {
            throw new Error("Analysis failed");
          }
        }
      } catch {
        // Poll error
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    return null;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;

    // Starting upload

    // Reset state
    setIsUploading(true);
    setUploadProgress("Uploading...");
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

      // Handle both OpenAI format (id, object) and legacy format (artifact)
      const artifactId = data.id || data.artifact?.id;

      if (response.ok && artifactId) {
        // Upload successful
        setLastArtifactId(artifactId);

        // Stream analysis status via SSE
        const analyzedData = await streamArtifactStatus(artifactId);

        if (analyzedData) {
          setUploadProgress("Analysis complete");
          setProgressPercentage(100);

          // Apply analysis to update roadmap
          if (analyzedData.analysis) {
            setUploadProgress("Applying changes...");
            await applyAnalysis(artifactId);
          }

          // Show diff modal if we have analysis results
          if (analyzedData.analysis) {
            setAnalyzedArtifact(analyzedData);
            setShowDiffModal(true);
          }

          // Notify parent to refresh project state
          if (onUploadComplete) {
            onUploadComplete();
          }

          // Clear progress after modal is shown
          setTimeout(() => {
            setUploadProgress("");
            setProgressPercentage(0);
          }, 1500);
        } else {
          setUploadProgress("Analysis timeout - artifact saved");
          setShowRetry(true);
          setTimeout(() => setUploadProgress(""), 5000);
        }
      } else {
        // Upload failed
        const errorMsg = data.error?.message || data.error || "Unknown error";
        setUploadProgress(`Upload failed: ${errorMsg}`);
        setShowRetry(true);
        setTimeout(() => setUploadProgress(""), 5000);
      }
    } catch {
      // Upload error
      setUploadProgress("Network error - check connection");
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
    setUploadProgress("Retrying analysis...");
    setProgressPercentage(10);
    setCancelRequested(false);

    try {
      const analyzedData = await streamArtifactStatus(lastArtifactId);

      if (analyzedData) {
        setUploadProgress("Analysis complete");
        setProgressPercentage(100);

        // Apply analysis to update roadmap
        if (analyzedData.analysis) {
          setUploadProgress("Applying changes...");
          await applyAnalysis(lastArtifactId);
        }

        if (analyzedData.analysis) {
          setAnalyzedArtifact(analyzedData);
          setShowDiffModal(true);
        }

        if (onUploadComplete) {
          onUploadComplete();
        }

        setTimeout(() => {
          setUploadProgress("");
          setProgressPercentage(0);
        }, 1500);
      } else {
        setUploadProgress("Analysis timeout");
        setShowRetry(true);
        setTimeout(() => setUploadProgress(""), 3000);
      }
    } catch {
      // Retry error
      setUploadProgress("Retry failed");
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
        {variant === "icon" ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!projectId || isUploading}
            className="w-8 h-8 rounded-lg bg-gray-700/60 hover:bg-gray-600/80 disabled:bg-gray-800/40 flex items-center justify-center transition-colors relative group"
            title={label}
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
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!projectId || isUploading}
            className="btn-secondary w-full flex items-center justify-center gap-2"
            title={label}
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              showIcon && (
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
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              )
            )}
            <span>{label}</span>
          </button>
        )}

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
            <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Click retry button to try again</span>
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
        projectId={analyzedArtifact?.project_id || null}
      />

      {/* Momentum Toast */}
      {momentumMessage && (
        <Toast
          message={momentumMessage}
          type="success"
          duration={6000}
          onClose={() => setMomentumMessage("")}
        />
      )}
    </>
  );
};
