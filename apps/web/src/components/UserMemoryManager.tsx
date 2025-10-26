import React, { useState, useEffect } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./Modal";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

interface UserMemoryManagerProps {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
}

export const UserMemoryManager: React.FC<UserMemoryManagerProps> = ({
  isOpen,
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
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader
        title="Context Manager"
        subtitle="Persistent facts AI remembers across all projects"
        onClose={onClose}
      />
      <ModalBody>
        {/* Error Message */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/20 border border-red-500/50 rounded-xl flex items-center gap-2">
            <svg
              className="w-4 h-4 text-red-400 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-red-300 text-sm">{error}</span>
          </div>
        )}

        {/* Add Fact Section */}
        <div className="pb-4 border-b border-neutral-700/50 space-y-3">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
            Add New Context
          </label>
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
              placeholder="Example: I prefer TypeScript for all projects"
              className="flex-1 bg-neutral-900/50 border border-neutral-600/50 rounded-xl px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50"
              disabled={isSaving}
            />
            <button
              onClick={addFact}
              disabled={!newFact.trim() || isSaving}
              className="btn-primary"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Adding...</span>
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span>Add</span>
                </>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
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
            <span>Preferences, tech stack, constraints, or goals</span>
          </div>
        </div>

        {/* Facts List */}
        <div className="min-h-[200px] py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : facts.length === 0 ? (
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
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-neutral-300 font-medium">No context saved</p>
                <p className="text-neutral-500 text-sm mt-1">
                  Add manually or extract from recent chats
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {facts.map((fact, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-neutral-800/50 border border-neutral-700/50 rounded-xl hover:bg-neutral-800 transition-colors"
                >
                  <svg
                    className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5"
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
                  <p className="text-neutral-200 text-sm flex-1">{fact}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="flex items-center justify-between w-full gap-3">
          <button
            onClick={extractFactsFromChat}
            disabled={extracting}
            className="btn-secondary"
          >
            {extracting ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Analyzing...</span>
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                <span>Extract from Chat</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-400">
              {facts.length} {facts.length === 1 ? "item" : "items"}
            </span>
            {facts.length > 0 && (
              <button
                onClick={clearAllFacts}
                className="btn-ghost text-red-400 hover:text-red-300"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
};
