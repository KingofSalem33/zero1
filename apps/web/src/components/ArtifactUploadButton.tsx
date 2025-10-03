import React, { useRef, useState } from "react";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

interface ArtifactUploadButtonProps {
  projectId: string | null;
  onUploadComplete?: (artifact: unknown) => void;
}

export const ArtifactUploadButton: React.FC<ArtifactUploadButtonProps> = ({
  projectId,
  onUploadComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

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

      if (response.ok) {
        console.log("[Upload] Success:", data);
        setUploadProgress("Analyzing...");
        setTimeout(() => {
          setUploadProgress("✓ Complete!");
          setTimeout(() => {
            setUploadProgress("");
            if (onUploadComplete) {
              onUploadComplete(data.artifact);
            }
          }, 1500);
        }, 1000);
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
    </>
  );
};
