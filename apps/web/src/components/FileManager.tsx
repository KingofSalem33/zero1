import React, { useState, useEffect, useRef } from "react";
import { Modal, ModalHeader, ModalBody } from "./Modal";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

interface FileMetadata {
  id: string;
  name: string;
  bytes: number;
  mime: string;
  uploadedAt: string;
}

interface FileManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FileManager: React.FC<FileManagerProps> = ({
  isOpen,
  onClose,
}) => {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async () => {
    try {
      const response = await fetch(`${API_URL}/api/files`);
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error("Failed to load files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(`${API_URL}/api/files`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        await loadFiles(); // Reload file list
        if (fileInputRef.current) {
          fileInputRef.current.value = ""; // Reset input
        }
      } else {
        const error = await response.json();
        window.alert(`Upload failed: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      window.alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (fileId: string, fileName: string) => {
    if (!window.confirm(`Delete "${fileName}"?`)) return;

    try {
      const response = await fetch(`${API_URL}/api/files/${fileId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadFiles(); // Reload file list
      } else {
        window.alert("Delete failed");
      }
    } catch (error) {
      console.error("Delete error:", error);
      window.alert("Delete failed. Please try again.");
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader
        title="Knowledge Base"
        subtitle="Add documents for AI to reference during build"
        onClose={onClose}
      />
      <ModalBody>
        {/* Upload Section */}
        <div className="pb-4 border-b border-neutral-700/50">
          <label className="btn-primary w-full cursor-pointer justify-center">
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
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-white font-medium">
              {isUploading ? "Uploading..." : "Upload File"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUpload}
              disabled={isUploading}
              className="hidden"
              accept=".txt,.md,.json,.csv,.pdf,.doc,.docx"
            />
          </label>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Max 10MB • Supports: TXT, MD, JSON, CSV, PDF, DOC
          </p>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-neutral-800/50 border border-neutral-700/50">
                <svg
                  className="w-7 h-7 text-neutral-500"
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
              <div>
                <p className="text-neutral-300 font-medium">No documents yet</p>
                <p className="text-neutral-500 text-sm mt-1">
                  Upload specs, designs, or code for AI to reference
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <svg
                      className="w-8 h-8 text-blue-400 flex-shrink-0"
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
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {file.name}
                      </p>
                      <p className="text-sm text-gray-400">
                        {formatBytes(file.bytes)} •{" "}
                        {formatDate(file.uploadedAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(file.id, file.name)}
                    className="ml-4 p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete file"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-900/50">
          <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <span>AI automatically searches uploaded files when relevant</span>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
};
