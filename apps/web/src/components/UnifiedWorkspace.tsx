import React, { useState, useEffect, useRef, useCallback } from "react";
import { MarkdownMessage } from "./MarkdownMessage";
import { ToolBadges } from "./ToolBadges";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

// Helper to convert phase format: "P1" -> 1, or pass through if already number
const getPhaseNumber = (phase: string | number): number => {
  return typeof phase === "string" ? parseInt(phase.replace("P", "")) : phase;
};

interface Project {
  id: string;
  goal: string;
  status: "clarifying" | "active" | "completed" | "paused";
  current_phase: number;
  current_substep: number;
  phases: ProjectPhase[];
}

interface ProjectPhase {
  phase_id: string;
  phase_number: number;
  goal: string;
  substeps: ProjectSubstep[];
}

interface ProjectSubstep {
  substep_id: string;
  step_number: number;
  label: string;
  prompt_to_send: string;
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

interface CompletionNudge {
  message: string;
  confidence: string;
  score: number;
  substep_id: string;
}

interface UnifiedWorkspaceProps {
  project: Project | null;
  onCreateProject: (goal: string) => void;
  onInspireMe: (goal: string, callback: () => void) => void;
  onSubstepComplete: (substepId: string) => void;
  onToggleSubstep: (substepId: string) => void;
  toolsUsed: ToolActivity[];
  setToolsUsed: (tools: ToolActivity[]) => void;
  completionNudge: CompletionNudge | null;
  onDismissNudge: () => void;
  creating: boolean;
  inspiring: boolean;
  onRefreshProject: () => void;
  onAskAIRef?: React.MutableRefObject<(() => void) | null>;
  pendingSubstepId: string | null;
  onOpenNewWorkspace?: () => void;
}
 
const UnifiedWorkspace: React.FC<UnifiedWorkspaceProps> = ({
  project,
  onCreateProject,
  onInspireMe,
  onSubstepComplete,
   
  onToggleSubstep: _onToggleSubstep,
  toolsUsed,
  setToolsUsed,
  completionNudge,
  onDismissNudge,
  creating,
  inspiring,
  onRefreshProject,
  onAskAIRef,
   
  pendingSubstepId: _pendingSubstepId,
  onOpenNewWorkspace,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUploadButton, setShowUploadButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

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

      // Get current substep's master prompt
      const currentPhase = project.phases?.find(
        (p) => p.phase_number === getPhaseNumber(project.current_phase),
      );
      const currentSubstep = currentPhase?.substeps?.find(
        (s) => s.step_number === project.current_substep,
      );

      if (!currentSubstep) {
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: "ai",
          content:
            "No active substep found. Please make sure you have an active project with substeps.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsProcessing(false);
        return;
      }

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
          `${API_URL}/api/projects/${project.id}/execute-step/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              master_prompt: currentSubstep.prompt_to_send,
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
                try {
                  const doneData = JSON.parse(data);
                  if (doneData.substepCompleted) {
                    onSubstepComplete(currentSubstep.substep_id);
                    onRefreshProject();
                  }
                } catch {
                  // Ignore JSON parse errors
                }
              } else if (currentEvent === "error") {
                throw new Error(data);
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
      }
    },
    [project, setToolsUsed, onSubstepComplete, onRefreshProject],
  );

  const handleAskAI = useCallback(() => {
    if (!project || isProcessing) return;

    const currentPhase = project.phases?.find(
      (p) => p.phase_number === getPhaseNumber(project.current_phase),
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s) => s.step_number === project.current_substep,
    );

    if (!currentSubstep || !currentSubstep.prompt_to_send.trim()) return;

    // Send the message directly without relying on state
    sendMessageWithPrompt(currentSubstep.prompt_to_send);
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

    // Get current substep's master prompt
    const currentPhase = project.phases?.find(
      (p) => p.phase_number === getPhaseNumber(project.current_phase),
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s) => s.step_number === project.current_substep,
    );

    if (!currentSubstep) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content:
          "No active substep found. Please make sure you have an active project with substeps.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsProcessing(false);
      return;
    }

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
        `${API_URL}/api/projects/${project.id}/execute-step/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            master_prompt: currentSubstep.prompt_to_send,
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

                case "completion_nudge": {
                  // Surface high-confidence prompt inline in the chat
                  const nudgeText = parsed.message
                    ? `?? ${parsed.message}`
                    : "?? Ready to mark this substep complete?";
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `${aiMessageId}-nudge-${Date.now()}`,
                      type: "ai",
                      content: nudgeText,
                      timestamp: new Date(),
                    },
                  ]);
                  break;
                }

                case "substep_completed": {
                  // Auto-completion detected; refresh project and append briefing
                  try {
                    if (project && parsed?.briefing) {
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: `${aiMessageId}-briefing-${Date.now()}`,
                          type: "ai",
                          content: `? ${parsed.briefing}`,
                          timestamp: new Date(),
                        },
                      ]);
                    }
                  } catch {
                    // ignore parse/append errors for briefing augmentation
                  }
                  // Trigger parent handlers to sync roadmap
                  onSubstepComplete(currentSubstep.substep_id);
                  onRefreshProject();
                  break;
                }

                case "completion_detected": {
                  // Optional: add a lightweight signal in the chat
                  break;
                }

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
              Ship your first version
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

          {/* Completion Nudge Inline */}
          {completionNudge && (
            <div className="ml-[2.625rem]">
              <div className="bg-green-600/20 border border-green-500/50 rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-green-400"
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
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-green-400">
                      Step complete
                    </div>
                    <div className="text-sm text-neutral-300 mt-1">
                      {completionNudge.message}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1.5 flex items-center gap-1">
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>
                        {completionNudge.confidence} confidence ·{" "}
                        {completionNudge.score}% match
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      onSubstepComplete(completionNudge.substep_id);
                      onDismissNudge();
                    }}
                    className="btn-success"
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
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                    <span>Continue to Next Step</span>
                  </button>
                  <button onClick={onDismissNudge} className="btn-ghost">
                    Keep Working
                  </button>
                </div>
              </div>
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
