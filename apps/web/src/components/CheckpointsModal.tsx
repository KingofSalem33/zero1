import React, { useState, useEffect } from "react";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

interface Checkpoint {
  id: string;
  name: string;
  reason: string;
  created_by: "user" | "system";
  created_at: string;
  current_phase: string;
  artifact_ids: string[];
}

interface CheckpointsModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

export const CheckpointsModal: React.FC<CheckpointsModalProps> = ({
  projectId,
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualReason, setManualReason] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadCheckpoints();
    }
  }, [isOpen, projectId]);

  const loadCheckpoints = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/checkpoints/project/${projectId}`,
      );
      const data = await response.json();
      if (data.ok) {
        setCheckpoints(data.checkpoints);
      }
    } catch (error) {
      console.error("Failed to load checkpoints:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateManualCheckpoint = async () => {
    if (!manualName.trim()) {
      window.alert("Please enter a checkpoint name");
      return;
    }

    setCreatingManual(true);
    try {
      const response = await fetch(`${API_URL}/api/checkpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          name: manualName,
          reason: manualReason || "Manual checkpoint",
        }),
      });

      const data = await response.json();
      if (data.ok) {
        setManualName("");
        setManualReason("");
        await loadCheckpoints();
      } else {
        window.alert("Failed to create checkpoint");
      }
    } catch (error) {
      console.error("Failed to create checkpoint:", error);
      window.alert("Failed to create checkpoint");
    } finally {
      setCreatingManual(false);
    }
  };

  const handleRestore = async (checkpointId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to restore to this checkpoint? Your current progress will be saved as a backup.",
      )
    ) {
      return;
    }

    setRestoring(checkpointId);
    try {
      const response = await fetch(
        `${API_URL}/api/checkpoints/${checkpointId}/restore`,
        {
          method: "POST",
        },
      );

      const data = await response.json();
      if (data.ok) {
        window.alert(
          `Successfully restored to: ${data.restored_to.checkpoint_name}`,
        );
        onRestoreSuccess();
        onClose();
      } else {
        window.alert("Failed to restore checkpoint");
      }
    } catch (error) {
      console.error("Failed to restore checkpoint:", error);
      window.alert("Failed to restore checkpoint");
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (checkpointId: string) => {
    if (!window.confirm("Are you sure you want to delete this checkpoint?")) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/checkpoints/${checkpointId}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json();
      if (data.ok) {
        await loadCheckpoints();
      } else {
        window.alert(data.error || "Failed to delete checkpoint");
      }
    } catch (error) {
      console.error("Failed to delete checkpoint:", error);
      window.alert("Failed to delete checkpoint");
    }
  };

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700/50 rounded-3xl max-w-4xl w-full max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-700/50 bg-gradient-to-r from-purple-950/30 to-blue-950/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                💾 Checkpoints
              </h2>
              <p className="text-gray-400 text-sm">
                Save and restore your project state
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-gray-800/60 hover:bg-gray-700/60 flex items-center justify-center transition-colors"
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
        </div>

        {/* Create Manual Checkpoint */}
        <div className="p-6 border-b border-gray-700/50 bg-gradient-to-br from-gray-900/40 to-gray-800/40">
          <h3 className="text-lg font-semibold text-white mb-4">
            Create Manual Checkpoint
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Checkpoint name (required)"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800/60 border border-gray-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
            <input
              type="text"
              placeholder="Reason (optional)"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800/60 border border-gray-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
            <button
              onClick={handleCreateManualCheckpoint}
              disabled={creatingManual || !manualName.trim()}
              className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all"
            >
              {creatingManual ? "Creating..." : "Create Checkpoint"}
            </button>
          </div>
        </div>

        {/* Checkpoints List */}
        <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center text-gray-400 py-8">
              Loading checkpoints...
            </div>
          ) : checkpoints.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              No checkpoints yet. Create one above to save your current state.
            </div>
          ) : (
            checkpoints.map((checkpoint) => (
              <div
                key={checkpoint.id}
                className="border border-gray-700/50 bg-gradient-to-br from-gray-900/60 to-gray-800/40 rounded-xl p-4 hover:border-gray-600/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white font-semibold truncate">
                        {checkpoint.name}
                      </h4>
                      <span
                        className={
                          checkpoint.created_by === "system"
                            ? "px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs rounded-md"
                            : "px-2 py-0.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs rounded-md"
                        }
                      >
                        {checkpoint.created_by === "system" ? "Auto" : "Manual"}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm mb-2">
                      {checkpoint.reason}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>📍 {checkpoint.current_phase}</span>
                      <span>📅 {formatDate(checkpoint.created_at)}</span>
                      <span>
                        📎 {checkpoint.artifact_ids?.length || 0} artifacts
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestore(checkpoint.id)}
                      disabled={restoring === checkpoint.id}
                      className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-600 rounded-lg text-white text-sm font-medium transition-all disabled:cursor-not-allowed"
                    >
                      {restoring === checkpoint.id ? "Restoring..." : "Restore"}
                    </button>
                    {checkpoint.created_by === "user" && (
                      <button
                        onClick={() => handleDelete(checkpoint.id)}
                        className="w-9 h-9 bg-gray-700/60 hover:bg-red-600/60 rounded-lg flex items-center justify-center transition-colors"
                        title="Delete checkpoint"
                      >
                        <svg
                          className="w-4 h-4 text-gray-400 hover:text-white"
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
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-gray-700/50 bg-gray-900/40">
          <p className="text-xs text-gray-500 text-center">
            💡 Tip: Checkpoints are automatically created before rollbacks and
            phase completions
          </p>
        </div>
      </div>
    </div>
  );
};
