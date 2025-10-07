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
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [analyzedArtifact, setAnalyzedArtifact] = useState<ArtifactData | null>(
    null,
  );

  // Poll artifact status until analysis completes
  const pollArtifactStatus = async (
    artifactId: string,
  ): Promise<ArtifactData | null> => {
    const maxAttempts = 30; // 30 seconds max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${API_URL}/api/artifacts/${artifactId}`);
        const data = await response.json();

        if (response.ok && data.artifact) {
          const artifact = data.artifact;

          // Check if analysis is complete
          if (artifact.status === "analyzed") {
            return artifact;
          } else if (artifact.status === "failed") {
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

    return null; // Timeout
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;

    console.log("[Upload] Starting upload with project_id:", projectId);

    setIsUploading(true);
    setUploadProgress("Uploading...");

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
        setUploadProgress("Analyzing...");

        // Poll for analysis completion
        const analyzedData = await pollArtifactStatus(data.artifact.id);

        if (analyzedData) {
          setUploadProgress("✓ Analysis Complete!");

          // Show diff modal if we have analysis results
          if (analyzedData.analysis) {
            setAnalyzedArtifact(analyzedData);
            setShowDiffModal(true);
          }

          // Notify parent
          if (onUploadComplete) {
            onUploadComplete(analyzedData);
          }

          // Clear progress after modal is shown
          setTimeout(() => setUploadProgress(""), 1500);
        } else {
          setUploadProgress("⚠️ Analysis timeout");
          setTimeout(() => setUploadProgress(""), 3000);
        }
      } else {
        console.error("[Upload] Failed:", data);
        setUploadProgress(`❌ ${data.error || "Failed"}`);
        setTimeout(() => setUploadProgress(""), 3000);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadProgress("❌ Error");
      setTimeout(() => setUploadProgress(""), 2000);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
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

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept=".zip,.js,.jsx,.ts,.tsx,.py,.java,.go,.txt,.md,.json"
      />

      {uploadProgress && (
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs whitespace-nowrap shadow-lg">
          {uploadProgress}
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
