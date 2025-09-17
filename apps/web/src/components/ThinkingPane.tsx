import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ThinkingPaneProps {
  onCreateProject: (goal: string) => Promise<void>;
  loading: boolean;
  projectId?: string;
}

export default function ThinkingPane({
  onCreateProject,
  loading: projectLoading,
  projectId,
}: ThinkingPaneProps) {
  const [thinking, setThinking] = useState("");
  const [loading, setLoading] = useState(false);
  const [latestClarification, setLatestClarification] = useState<string>("");

  async function handleSubmit() {
    if (!thinking.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thinking,
          projectId: projectId || "",
        }),
      });
      const data = await res.json();
      if (data?.ok && data.clarifications) {
        setLatestClarification(data.clarifications);
      } else {
        setLatestClarification(`Error: ${data?.error || "Unknown error"}`);
      }
    } catch {
      setLatestClarification("Network error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject() {
    if (!thinking.trim()) return;
    await onCreateProject(thinking.trim());
    setThinking("");
    setLatestClarification("");
  }

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Thinking Space
        </h2>
        {!projectId ? (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800">
              <strong>Start here:</strong> Describe your project idea, goal, or
              challenge. Be as detailed or as brief as you like - I'll help you
              clarify and plan.
            </p>
          </div>
        ) : null}
        <label
          htmlFor="thinking"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          {projectId
            ? "Share your thoughts or ask questions about your project..."
            : "What would you like to build or accomplish?"}
        </label>
        <textarea
          id="thinking"
          value={thinking}
          onChange={(e) => setThinking(e.target.value)}
          className="w-full h-32 p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder={
            projectId
              ? "Ask questions, share updates, or describe challenges..."
              : "I want to build a mobile app for...\nI'm planning to learn...\nI need help organizing..."
          }
        />
        <div className="flex gap-2 mt-3">
          {!projectId ? (
            <>
              <button
                onClick={handleCreateProject}
                disabled={projectLoading || !thinking.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {projectLoading ? "Creating..." : "Create Project"}
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !thinking.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Processing..." : "Get Help"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSubmit}
                disabled={loading || !thinking.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Processing..." : "Get Clarification"}
              </button>
              <button
                onClick={handleCreateProject}
                disabled={projectLoading || !thinking.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {projectLoading ? "Creating..." : "New Project"}
              </button>
            </>
          )}
        </div>

        {latestClarification && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              Latest Coach Notes:
            </h3>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {latestClarification}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
