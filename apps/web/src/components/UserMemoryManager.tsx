import React, { useState, useEffect } from "react";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

interface UserMemoryManagerProps {
  userId: string;
  onClose: () => void;
}

export const UserMemoryManager: React.FC<UserMemoryManagerProps> = ({
  userId,
  onClose,
}) => {
  const [facts, setFacts] = useState<string[]>([]);
  const [newFact, setNewFact] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load facts on mount
  useEffect(() => {
    loadFacts();
  }, [userId]);

  const loadFacts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(
        `${API_URL}/api/memory?userId=${encodeURIComponent(userId)}`,
      );

      if (response.ok) {
        const data = await response.json();
        setFacts(data.facts || []);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to load memory");
      }
    } catch (err) {
      console.error("Failed to load facts:", err);
      setError("Network error - check your connection");
    } finally {
      setIsLoading(false);
    }
  };

  const addFact = async () => {
    if (!newFact.trim()) return;

    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fact: newFact.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setFacts(data.facts || []);
        setNewFact("");
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to add fact");
      }
    } catch (err) {
      console.error("Failed to add fact:", err);
      setError("Network error - check your connection");
    } finally {
      setIsSaving(false);
    }
  };

  const clearAllFacts = async () => {
    if (
      !window.confirm("Are you sure you want to clear all your memory facts?")
    )
      return;

    try {
      setError(null);
      const response = await fetch(
        `${API_URL}/api/memory?userId=${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
        },
      );

      if (response.ok) {
        setFacts([]);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to clear memory");
      }
    } catch (err) {
      console.error("Failed to clear facts:", err);
      setError("Network error - check your connection");
    }
  };

  const extractFactsFromChat = async () => {
    try {
      setExtracting(true);
      setError(null);

      const response = await fetch(`${API_URL}/api/memory/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.facts && data.facts.length > 0) {
          setFacts(data.facts);
          window.alert(
            `✅ Extracted ${data.extractedCount || 0} new facts from recent conversations!`,
          );
        } else {
          window.alert("ℹ️ No new facts found in recent conversations");
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to extract facts");
      }
    } catch (err) {
      console.error("Failed to extract facts:", err);
      setError("Network error - check your connection");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              Memory & Preferences
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              AI remembers these facts about you across conversations
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-6 h-6"
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

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-3 bg-red-900/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Add Fact Section */}
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addFact();
                }
              }}
              placeholder="Add a new fact (e.g., 'I prefer TypeScript over JavaScript')"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            />
            <button
              onClick={addFact}
              disabled={!newFact.trim() || isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
            >
              {isSaving ? "Adding..." : "Add"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            💡 Examples: preferences, skills, goals, constraints, past
            experiences
          </p>
        </div>

        {/* Facts List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : facts.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="w-16 h-16 text-gray-600 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <p className="text-gray-400 mb-2">No facts stored yet</p>
              <p className="text-gray-500 text-sm">
                Add facts manually or extract from conversations
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {facts.map((fact, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <svg
                    className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
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
                  <p className="text-gray-200 text-sm flex-1">{fact}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-900/50 flex items-center justify-between gap-3">
          <button
            onClick={extractFactsFromChat}
            disabled={extracting}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
          >
            {extracting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Extracting...</span>
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
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <span>Extract from Chats</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {facts.length} {facts.length === 1 ? "fact" : "facts"}
            </span>
            {facts.length > 0 && (
              <button
                onClick={clearAllFacts}
                className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg font-medium transition-colors text-sm"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
