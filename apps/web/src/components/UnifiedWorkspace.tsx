import React, { useState, useEffect, useRef, useCallback } from "react";
import { MarkdownMessage } from "./MarkdownMessage";
import { ToolBadges } from "./ToolBadges";
import ArtifactAnalysisCard from "./ArtifactAnalysisCard";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

interface ArtifactAnalysis {
  quality_score: number;
  satisfied_criteria: string[];
  partial_criteria: string[];
  missing_criteria: string[];
  tech_stack: string[];
  has_tests: boolean;
  feedback: string;
  suggest_completion: boolean;
  confidence: number;
}

interface LatestArtifact {
  artifact_id: string;
  file_name: string;
  analysis: ArtifactAnalysis;
  analyzed_at: string;
}

// Helper to convert phase format: "P1" -> 1, or pass through if already number
const getPhaseNumber = (phase: string | number): number => {
  return typeof phase === "string" ? parseInt(phase.replace("P", "")) : phase;
};

// V2 Roadmap Step
interface RoadmapStep {
  id: string;
  project_id: string;
  step_number: number;
  title: string;
  description: string;
  master_prompt: string;
  context: any;
  acceptance_criteria: string[];
  estimated_complexity: number;
  status: "pending" | "active" | "completed" | "skipped";
  created_at: string;
  completed_at?: string;
}

// V2 Project structure
interface Project {
  id: string;
  user_id: string;
  goal: string;
  status: "clarifying" | "active" | "completed" | "paused";
  current_step: number;
  roadmap_status: string;
  steps: RoadmapStep[];
  metadata: {
    total_steps: number;
    current_step: number;
    completion_percentage: number;
    roadmap_version: number;
    generated_by?: string;
    generation_prompt?: string;
  };
}

interface ChatMessage {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
}

interface ToolActivity {
  type: "tool_start" | "tool_end" | "tool_error";
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  timestamp: string;
}

interface UnifiedWorkspaceProps {
  project: Project | null;
  onCreateProject: (goal: string) => void;
  onInspireMe: (goal: string, callback: () => void) => void;
  toolsUsed: ToolActivity[];
  setToolsUsed: (tools: ToolActivity[]) => void;
  creating: boolean;
  inspiring: boolean;
  onRefreshProject: () => void;
  onAskAIRef?: React.MutableRefObject<(() => void) | null>;
  onOpenNewWorkspace?: () => void;
}

const UnifiedWorkspace: React.FC<UnifiedWorkspaceProps> = ({
  project,
  onCreateProject,
  onInspireMe,
  toolsUsed,
  setToolsUsed,
  creating,
  inspiring,
  onRefreshProject,
  onAskAIRef,
  onOpenNewWorkspace,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUploadButton, setShowUploadButton] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [latestArtifact, setLatestArtifact] = useState<LatestArtifact | null>(
    null,
  );
  const [dismissedArtifactId, setDismissedArtifactId] = useState<string | null>(
    null,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const isExpandingPhase = useRef(false);
  const messagesFetchedRef = useRef(false);

  // Auto-expand phase when current_substep === 0 (needs expansion) - V1 only
  useEffect(() => {
    // Skip for V2 projects (they have pre-generated steps)
    if (
      !project ||
      project.steps ||
      project.current_substep !== 0 ||
      isExpandingPhase.current
    ) {
      return;
    }

    // Get current phase that needs expansion
    const currentPhase = project.phases?.find(
      (p) => p.phase_number === getPhaseNumber(project.current_phase!),
    );

    if (!currentPhase) {
      console.log(
        "[UnifiedWorkspace] No current phase found for auto-expansion",
      );
      return;
    }

    console.log(
      `[UnifiedWorkspace] Auto-expanding phase ${currentPhase.phase_id} (current_substep === 0)`,
    );

    isExpandingPhase.current = true;

    // Call expand endpoint with explicit phase_id
    fetch(`${API_URL}/api/projects/${project.id}/expand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase_id: currentPhase.phase_id,
        thinking_input: `Auto-expanding ${currentPhase.goal}`,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log(
          "[UnifiedWorkspace] Phase expansion complete:",
          data.phase_expanded ? "success" : "no expansion",
        );
        if (data.phase_expanded) {
          // Refresh project to get new substeps
          onRefreshProject();
        }
      })
      .catch((error) => {
        console.error("[UnifiedWorkspace] Error expanding phase:", error);
      })
      .finally(() => {
        isExpandingPhase.current = false;
      });
  }, [
    project?.id,
    project?.current_phase,
    project?.current_substep,
    onRefreshProject,
  ]);

  // Fetch thread for V2 projects
  useEffect(() => {
    if (!project || !project.steps) return; // Only for V2 projects

    async function fetchThread() {
      try {
        const response = await fetch(
          `${API_URL}/api/v2/projects/${project.id}/thread`,
        );
        if (response.ok) {
          const data = await response.json();
          setThreadId(data.thread_id);
          console.log(`[UnifiedWorkspace] Fetched thread: ${data.thread_id}`);
        }
      } catch (error) {
        console.error("[UnifiedWorkspace] Error fetching thread:", error);
      }
    }

    fetchThread();
  }, [project?.id]);

  // Fetch messages from thread
  const fetchThreadMessages = useCallback(async () => {
    if (!threadId) return;

    try {
      const response = await fetch(
        `${API_URL}/api/threads/${threadId}/messages`,
      );
      if (response.ok) {
        const data = await response.json();
        const threadMessages: ChatMessage[] = data.data.map((msg: any) => ({
          id: msg.id,
          type: msg.role === "user" ? "user" : "ai",
          content: msg.content,
          timestamp: new Date(msg.created_at),
        }));
        setMessages(threadMessages);
        console.log(
          `[UnifiedWorkspace] Loaded ${threadMessages.length} messages from thread`,
        );
      }
    } catch (error) {
      console.error("[UnifiedWorkspace] Error fetching messages:", error);
    }
  }, [threadId]);

  // Initial fetch of messages
  useEffect(() => {
    if (!threadId || messagesFetchedRef.current) return;

    messagesFetchedRef.current = true;
    fetchThreadMessages();
  }, [threadId, fetchThreadMessages]);

  // Poll for new messages every 15 seconds
  useEffect(() => {
    if (!threadId) return;

    const interval = setInterval(() => {
      fetchThreadMessages();
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, [threadId, fetchThreadMessages]);

  // Fetch latest artifact analysis
  const fetchLatestArtifact = useCallback(async () => {
    if (!project) return;

    try {
      const response = await fetch(
        `${API_URL}/api/artifacts/project/${project.id}/latest`,
      );
      if (response.ok) {
        const data: LatestArtifact = await response.json();
        // Only update if it's a new artifact (different ID)
        if (data.artifact_id !== latestArtifact?.artifact_id) {
          setLatestArtifact(data);
          console.log(
            `[UnifiedWorkspace] New artifact analysis: ${data.file_name}`,
          );
        }
      } else if (response.status === 404) {
        // No analyzed artifacts yet
        setLatestArtifact(null);
      }
    } catch (error) {
      console.error(
        "[UnifiedWorkspace] Error fetching latest artifact:",
        error,
      );
    }
  }, [project, latestArtifact?.artifact_id]);

  // Initial fetch and poll for artifact analysis
  useEffect(() => {
    if (!project) return;

    // Initial fetch
    fetchLatestArtifact();

    // Poll every 10 seconds (less aggressive to avoid rate limits)
    const interval = setInterval(() => {
      fetchLatestArtifact();
    }, 10000);

    return () => clearInterval(interval);
  }, [project?.id, fetchLatestArtifact]);

  // Helper function to send a message directly with a specific prompt
  const sendMessageWithPrompt = useCallback(
    async (promptText: string) => {
      if (!project || !promptText.trim()) return;

      setIsProcessing(true);
      setToolsUsed([]); // Clear previous tools
      const userMessage = promptText.trim();
      const newMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "user",
        content: userMessage,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, newMessage]);

      // Get current step's master prompt
      const currentStep = project.steps.find(
        (s) => s.step_number === project.current_step,
      );

      if (!currentStep) {
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: "ai",
          content:
            "No active step found. Please make sure you have an active project with steps.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsProcessing(false);
        return;
      }

      const masterPrompt = currentStep.master_prompt;

      // Create placeholder for AI message that will be streamed
      const aiMessageId = (Date.now() + 1).toString();
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        type: "ai",
        content: "Thinking...",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      try {
        const response = await fetch(
          `${API_URL}/api/v2/projects/${project.id}/execute-step`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              master_prompt: masterPrompt,
              user_message: userMessage,
            }),
          },
        );

        if (!response.ok) {
          if (response.status === 429) {
            const errorData = await response.json().catch(() => ({}));
            const retryAfter = errorData.retryAfter || "1 minute";
            throw new Error(
              `⏱️ Rate limit exceeded. Please wait ${retryAfter} before trying again.`,
            );
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const decoder = new (window as any).TextDecoder();
        let buffer = "";
        let accumulatedContent = "";
        const allTools: ToolActivity[] = [];
        let receivedDone = false;
        let currentEvent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line === "") {
              currentEvent = "";
              continue;
            }

            if (line.startsWith("event:")) {
              currentEvent = line.substring(6).trim();
              continue;
            }

            if (line.startsWith("data:")) {
              const data = line.substring(5).trim();

              if (currentEvent === "content") {
                try {
                  const parsed = JSON.parse(data);
                  accumulatedContent += parsed.delta || "";
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === aiMessageId
                        ? { ...msg, content: accumulatedContent }
                        : msg,
                    ),
                  );
                } catch {
                  // Ignore JSON parse errors for content
                }
              } else if (currentEvent === "tool") {
                try {
                  const toolData = JSON.parse(data);
                  const toolActivity: ToolActivity = {
                    name: toolData.name,
                    status: toolData.status || "active",
                    timestamp: new Date(),
                  };
                  allTools.push(toolActivity);
                  setToolsUsed([...allTools]);
                } catch {
                  // Ignore JSON parse errors
                }
              } else if (currentEvent === "done") {
                receivedDone = true;
                // V2: No special handling needed for done event
              } else if (currentEvent === "error") {
                throw new Error(data);
              } else if (currentEvent === "project_refresh_request") {
                // ✅ NEW: Gap #2 Fix - Auto-refresh when backend updates state
                try {
                  const refreshData = JSON.parse(data);
                  console.log(
                    "🔄 [UnifiedWorkspace] Received refresh request:",
                    refreshData.trigger,
                  );
                  onRefreshProject();
                } catch {
                  // Ignore JSON parse errors
                }
              } else if (currentEvent === "substep_completed") {
                // ✅ NEW: Gap #2 Fix - Handle substep completion
                try {
                  const completionData = JSON.parse(data);
                  console.log(
                    "✅ [UnifiedWorkspace] Substep completed:",
                    completionData.phase_id,
                    "/",
                    completionData.substep_number,
                  );
                  // Show celebration message if briefing exists
                  if (completionData.briefing) {
                    const celebrationMessage: ChatMessage = {
                      id: (Date.now() + 2).toString(),
                      type: "ai",
                      content: completionData.briefing,
                      timestamp: new Date(),
                    };
                    setMessages((prev) => [...prev, celebrationMessage]);
                  }
                  // Refresh will happen via project_refresh_request event
                } catch {
                  // Ignore JSON parse errors
                }
              } else if (currentEvent === "artifact_completions") {
                // ✅ NEW: Gap #2 Fix - Handle artifact completions
                try {
                  const artifactData = JSON.parse(data);
                  console.log(
                    "🧪 [UnifiedWorkspace] Artifact completions:",
                    artifactData.completed_substeps.length,
                    "substeps",
                  );
                  // Show completion info in chat
                  const completionMessage: ChatMessage = {
                    id: (Date.now() + 3).toString(),
                    type: "ai",
                    content: `✅ **Artifact Analysis Complete**\n\nCompleted ${artifactData.completed_substeps.length} substep(s):\n${artifactData.completed_substeps.map((s: any) => `- P${s.phase_number}.${s.substep_number} (${s.status}, ${s.confidence}% confidence)`).join("\n")}\n\nProgress: ${artifactData.progress}%`,
                    timestamp: new Date(),
                  };
                  setMessages((prev) => [...prev, completionMessage]);
                  // Refresh will happen via project_refresh_request event
                } catch {
                  // Ignore JSON parse errors
                }
              } else if (currentEvent === "phase_unlocked") {
                // ✅ NEW: Gap #2 Fix - Handle phase unlock
                try {
                  const phaseData = JSON.parse(data);
                  console.log(
                    "🔓 [UnifiedWorkspace] Phase unlocked:",
                    phaseData.phase_id,
                  );
                  // Show celebration for phase unlock
                  const unlockMessage: ChatMessage = {
                    id: (Date.now() + 4).toString(),
                    type: "ai",
                    content: `🎉 **Phase ${phaseData.phase_id} Unlocked!**\n\n${phaseData.phase_goal}\n\nGreat progress! You've completed the previous phase and unlocked the next one.`,
                    timestamp: new Date(),
                  };
                  setMessages((prev) => [...prev, unlockMessage]);
                  // Refresh will happen via project_refresh_request event
                } catch {
                  // Ignore JSON parse errors
                }
              }
            }
          }
        }

        if (!receivedDone && accumulatedContent) {
          // Stream completed successfully even without explicit done event
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to get AI response";
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  content: `❌ Error: ${errorMessage}`,
                }
              : msg,
          ),
        );
      } finally {
        setIsProcessing(false);
        // Refresh messages from thread to catch any async messages (like artifact analysis)
        setTimeout(() => fetchThreadMessages(), 1000);
      }
    },
    [project, setToolsUsed, onRefreshProject, fetchThreadMessages],
  );

  const handleAskAI = useCallback(() => {
    if (!project || isProcessing) return;

    const currentStep = project.steps.find(
      (s) => s.step_number === project.current_step,
    );
    const masterPrompt = currentStep?.master_prompt;

    if (!masterPrompt || !masterPrompt.trim()) return;

    // Send the message directly without relying on state
    sendMessageWithPrompt(masterPrompt);
  }, [project, isProcessing, sendMessageWithPrompt]);

  // Expose handleAskAI to parent via ref
  useEffect(() => {
    if (onAskAIRef) {
      onAskAIRef.current = handleAskAI;
    }
  }, [onAskAIRef, handleAskAI]);

  // Disable auto-scroll; user controls scroll position manually

  const getContextualPlaceholder = (): string => {
    return "What's on your mind?";
  };

  const handleSendMessage = async () => {
    if (!currentInput.trim() || isProcessing) return;

    // If no project, create one
    if (!project) {
      onCreateProject(currentInput.trim());
      setCurrentInput("");
      return;
    }

    setIsProcessing(true);
    setToolsUsed([]); // Clear previous tools
    const userMessage = currentInput.trim();
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setCurrentInput("");

    // Get current step's master prompt
    const currentStep = project.steps.find(
      (s) => s.step_number === project.current_step,
    );

    if (!currentStep) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content:
          "No active step found. Please make sure you have an active project with steps.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsProcessing(false);
      return;
    }

    const masterPrompt = currentStep.master_prompt;

    // Create placeholder for AI message that will be streamed
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      type: "ai",
      content: "Thinking...",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, aiMessage]);

    try {
      const response = await fetch(
        `${API_URL}/api/v2/projects/${project.id}/execute-step`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            master_prompt: masterPrompt,
            user_message: userMessage,
          }),
        },
      );

      if (!response.ok) {
        if (response.status === 429) {
          const errorData = await response.json().catch(() => ({}));
          const retryAfter = errorData.retryAfter || "1 minute";
          throw new Error(
            `⏱️ Rate limit exceeded. Please wait ${retryAfter} before trying again.`,
          );
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decoder = new (window as any).TextDecoder();
      let buffer = "";
      let accumulatedContent = "";
      const allTools: ToolActivity[] = [];
      let receivedDone = false;
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line === "") {
            currentEvent = "";
            continue;
          }
          if (line.startsWith(":")) {
            continue;
          }
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              switch (currentEvent) {
                case "content":
                  accumulatedContent += parsed.delta;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === aiMessageId
                        ? { ...msg, content: accumulatedContent }
                        : msg,
                    ),
                  );
                  break;

                case "tool_call":
                  allTools.push({
                    type: "tool_start",
                    tool: parsed.tool,
                    args: parsed.args,
                    timestamp: new Date().toISOString(),
                  });
                  setToolsUsed([...allTools]);
                  break;

                case "tool_result":
                  allTools.push({
                    type: "tool_end",
                    tool: parsed.tool,
                    result: parsed.result,
                    timestamp: new Date().toISOString(),
                  });
                  setToolsUsed([...allTools]);
                  break;

                case "tool_error":
                  allTools.push({
                    type: "tool_error",
                    tool: parsed.tool,
                    error: parsed.error,
                    timestamp: new Date().toISOString(),
                  });
                  setToolsUsed([...allTools]);
                  break;

                case "done":
                  receivedDone = true;
                  break;

                case "error":
                  throw new Error(parsed.message || "Streaming error");
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
        if (receivedDone) {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancel errors
          }
          break;
        }
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        type: "ai",
        content:
          error instanceof Error
            ? error.message
            : "Network error. Please check your connection and try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      // Refresh messages from thread to catch any async messages (like artifact analysis)
      setTimeout(() => fetchThreadMessages(), 1000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Empty state when no project
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12">
        <div className="max-w-3xl w-full space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-brand mb-2">
              <svg
                className="w-9 h-9 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white">
              Dream it. Build it. Ship it.
            </h1>
            <p className="text-neutral-400 text-base max-w-md mx-auto">
              AI guides you through 7 phases—from vision to live product
            </p>
          </div>

          {/* Input Card */}
          <div className="space-y-6">
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 shadow-lg">
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 block">
                Describe your project
              </label>
              <textarea
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Example: A budget tracker that categorizes expenses automatically"
                className="w-full bg-neutral-900/50 border border-neutral-600/50 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50 resize-none"
                rows={3}
                disabled={creating || inspiring}
              />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    if (currentInput.trim()) {
                      onInspireMe(currentInput, setCurrentInput);
                    }
                  }}
                  disabled={!currentInput.trim() || creating || inspiring}
                  className="btn-secondary"
                >
                  {inspiring ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Refining...</span>
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
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                        />
                      </svg>
                      <span>Refine Idea</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!currentInput.trim() || creating || inspiring}
                  className="btn-primary"
                >
                  {creating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating...</span>
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      <span>Generate Roadmap</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Start Examples */}
            <div className="space-y-3">
              <div className="text-center">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Quick Start
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  {
                    icon: (
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
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    ),
                    text: "Personal budget tracker with AI categorization",
                  },
                  {
                    icon: (
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
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                        />
                      </svg>
                    ),
                    text: "Task manager with team notifications",
                  },
                  {
                    icon: (
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
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    ),
                    text: "Habit tracker with streak rewards",
                  },
                  {
                    icon: (
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
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      </svg>
                    ),
                    text: "Recipe collection with meal planning",
                  },
                ].map((example) => (
                  <button
                    key={example.text}
                    onClick={() => {
                      setCurrentInput(example.text);
                      onInspireMe(example.text, setCurrentInput);
                    }}
                    disabled={creating || inspiring}
                    className="btn-ghost text-left justify-start text-sm py-2.5"
                  >
                    <span className="text-neutral-400">{example.icon}</span>
                    <span className="text-neutral-300">{example.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main workspace with conversation
  return (
    <div className="flex flex-col h-full">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-6 py-8 pb-28">
        {/* Centered composer when no messages (ChatGPT-style start) */}
        {messages.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center">
            <div className="w-full max-w-3xl">
              <h1 className="text-4xl md:text-6xl font-extrabold text-white text-center mb-8">
                Let's Build
              </h1>
              <div className="relative flex gap-2 items-center bg-neutral-800/60 border border-neutral-700/50 rounded-2xl px-4 py-3 shadow-lg focus-within:ring-2 focus-within:ring-brand-primary-500/50 focus-within:border-brand-primary-500/50 transition-all">
                <button
                  onClick={() => setShowUploadButton(!showUploadButton)}
                  className="btn-icon-ghost w-8 h-8"
                  title="Add options"
                >
                  <svg
                    className={`w-5 h-5 transition-transform ${showUploadButton ? "rotate-45" : ""}`}
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
                </button>

                {/* Options dropdown (extensible) */}
                {showUploadButton && (
                  <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-600 rounded-xl shadow-xl overflow-hidden z-10 min-w-[220px]">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          onOpenNewWorkspace?.();
                          setShowUploadButton(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-neutral-200 hover:bg-gray-700/50 transition-colors flex items-center gap-3"
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
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        <span>Add Workspace</span>
                      </button>

                      <div className="border-t border-gray-700 mt-1 pt-1">
                        <button
                          disabled
                          className="w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-700/50 transition-colors flex items-center gap-3 opacity-50 cursor-not-allowed"
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
                              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                            />
                          </svg>
                          <span>More options coming soon...</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <textarea
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={getContextualPlaceholder()}
                  className="flex-1 bg-transparent text-white placeholder-neutral-500 focus:outline-none resize-none min-h-[44px] max-h-[200px] leading-relaxed"
                  rows={1}
                  disabled={isProcessing}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!currentInput.trim() || isProcessing}
                  className="btn-icon-primary"
                  title={isProcessing ? "Sending..." : "Send message"}
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
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
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((message, idx) => (
            <div key={message.id}>
              {idx > 0 && (
                <div className="h-px w-full bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-blue-500/30" />
              )}
              {message.type === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-2xl rounded-2xl px-5 py-3.5 bg-gradient-brand text-white shadow-sm">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      AI
                    </div>
                    <span className="text-xs text-neutral-500 font-medium">
                      Workshop AI
                    </span>
                  </div>
                  <div className="ml-[2.625rem]">
                    <MarkdownMessage content={message.content} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Tool Activity Inline */}
          {toolsUsed.length > 0 && (
            <div className="ml-[2.625rem]">
              <ToolBadges tools={toolsUsed} />
            </div>
          )}

          {/* Artifact Analysis Card */}
          {latestArtifact &&
            latestArtifact.artifact_id !== dismissedArtifactId && (
              <div className="mt-6">
                <ArtifactAnalysisCard
                  analysis={latestArtifact.analysis}
                  fileName={latestArtifact.file_name}
                  stepTitle={
                    project?.steps.find(
                      (s) => s.step_number === project.current_step,
                    )?.title || "Current Step"
                  }
                  onDismiss={() =>
                    setDismissedArtifactId(latestArtifact.artifact_id)
                  }
                />
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Composer (sticky bottom) */}
      {/* Bottom composer (shown only after first message) */}
      {messages.length > 0 && (
        <div
          ref={composerRef}
          className="sticky bottom-0 px-6 py-4 bg-neutral-950/40 backdrop-blur-sm"
        >
          <div className="max-w-4xl mx-auto">
            <div className="relative flex gap-2 items-center bg-neutral-800/50 border border-neutral-700/50 rounded-2xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-brand-primary-500/50 focus-within:border-brand-primary-500/50 transition-all shadow-lg">
              <button
                onClick={() => setShowUploadButton(!showUploadButton)}
                className="btn-icon-ghost w-8 h-8"
                title="Add options"
              >
                <svg
                  className={`w-5 h-5 transition-transform ${showUploadButton ? "rotate-45" : ""}`}
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
              </button>

              {/* Options Menu */}
              {showUploadButton && (
                <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-600 rounded-xl shadow-xl overflow-hidden z-10 min-w-[220px]">
                  <div className="py-1">
                    {/* Add Workspace Option */}
                    <button
                      onClick={() => {
                        onOpenNewWorkspace?.();
                        setShowUploadButton(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-neutral-200 hover:bg-gray-700/50 transition-colors flex items-center gap-3"
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      <span>Add Workspace</span>
                    </button>

                    {/* Placeholder for future options */}
                    <div className="border-t border-gray-700 mt-1 pt-1">
                      <button
                        disabled
                        className="w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-700/50 transition-colors flex items-center gap-3 opacity-50 cursor-not-allowed"
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
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          />
                        </svg>
                        <span>More options coming soon...</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <textarea
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={getContextualPlaceholder()}
                className="flex-1 bg-transparent text-white placeholder-neutral-500 focus:outline-none resize-none min-h-[40px] max-h-[200px] leading-relaxed"
                rows={1}
                disabled={isProcessing}
              />
              <button
                onClick={handleSendMessage}
                disabled={!currentInput.trim() || isProcessing}
                className="btn-icon-primary"
                title={isProcessing ? "Sending..." : "Send message"}
              >
                {isProcessing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
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
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedWorkspace;
