import React, { useState, useEffect, useRef, useCallback } from "react";
import { MarkdownMessage } from "./MarkdownMessage";
import { ToolBadges } from "./ToolBadges";
import { ArtifactUploadButton } from "./ArtifactUploadButton";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

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
}

const UnifiedWorkspace: React.FC<UnifiedWorkspaceProps> = ({
  project,
  onCreateProject,
  onInspireMe,
  onSubstepComplete,
  toolsUsed,
  setToolsUsed,
  completionNudge,
  onDismissNudge,
  creating,
  inspiring,
  onRefreshProject,
  onAskAIRef,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
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
        (p) => p.phase_number === project.current_phase,
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
      (p) => p.phase_number === project.current_phase,
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s) => s.step_number === project.current_substep,
    );

    if (!currentSubstep || !currentSubstep.prompt_to_send.trim()) return;

    // Log for threading
    console.log("Ask AI triggered:", {
      substep_id: currentSubstep.substep_id,
      phase_id: currentPhase?.phase_id,
      phase_number: project.current_phase,
      substep_number: project.current_substep,
    });

    // Send the message directly without relying on state
    sendMessageWithPrompt(currentSubstep.prompt_to_send);
  }, [project, isProcessing, sendMessageWithPrompt]);

  // Expose handleAskAI to parent via ref
  useEffect(() => {
    if (onAskAIRef) {
      onAskAIRef.current = handleAskAI;
    }
  }, [onAskAIRef, handleAskAI]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getContextualPlaceholder = (): string => {
    if (!project) {
      return 'Describe your vision... (e.g., "I want to build a task manager")';
    }
    const currentPhase = project.phases?.find(
      (p) => p.phase_number === project.current_phase,
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s) => s.step_number === project.current_substep,
    );
    return currentSubstep?.label || "Continue building...";
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
      (p) => p.phase_number === project.current_phase,
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
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Zero-to-One Builder
            </h1>
            <p className="text-gray-400 text-lg">
              Transform your idea into reality with AI-powered scaffolding
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
              <label className="text-sm font-medium text-gray-300 mb-3 block">
                What do you want to build?
              </label>
              <textarea
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="I want to build a task manager that helps teams collaborate..."
                className="w-full bg-gray-900/50 border border-gray-600/50 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                rows={4}
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
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium transition-all disabled:cursor-not-allowed"
                >
                  {inspiring ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Inspiring...</span>
                    </div>
                  ) : (
                    "✨ Inspire Me"
                  )}
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!currentInput.trim() || creating || inspiring}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium transition-all disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating...</span>
                    </div>
                  ) : (
                    "Start Building"
                  )}
                </button>
              </div>
            </div>

            <div className="text-center text-sm text-gray-500">
              or try one of these ideas:
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                "A personal finance tracker",
                "A recipe sharing platform",
                "A habit tracking app",
                "A team collaboration tool",
              ].map((idea) => (
                <button
                  key={idea}
                  onClick={() => {
                    setCurrentInput(idea);
                    onInspireMe(idea, setCurrentInput);
                  }}
                  disabled={creating || inspiring}
                  className="px-4 py-3 rounded-xl bg-gray-800/30 border border-gray-700/50 hover:border-blue-500/50 hover:bg-gray-800/50 text-gray-300 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
                >
                  💡 {idea}
                </button>
              ))}
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
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((message) => (
            <div key={message.id}>
              {message.type === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl px-5 py-3 bg-gradient-to-br from-blue-600 to-purple-600 text-white">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                      AI
                    </div>
                    <span className="text-xs text-gray-500">Workshop AI</span>
                  </div>
                  <div className="pl-10 pr-4">
                    <MarkdownMessage content={message.content} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Tool Activity Inline */}
          {toolsUsed.length > 0 && (
            <div className="pl-10">
              <ToolBadges tools={toolsUsed} />
            </div>
          )}

          {/* Completion Nudge Inline */}
          {completionNudge && (
            <div className="pl-10">
              <div className="bg-green-600/20 border border-green-500/50 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">✅</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-green-400">
                      Ready to advance
                    </div>
                    <div className="text-sm text-gray-300 mt-1">
                      {completionNudge.message}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Confidence: {completionNudge.confidence} (Score:{" "}
                      {completionNudge.score})
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onSubstepComplete(completionNudge.substep_id);
                      onDismissNudge();
                    }}
                    className="px-4 py-2 rounded-lg bg-green-600/50 hover:bg-green-600/70 text-white text-sm font-medium transition-colors"
                  >
                    Mark Complete & Continue
                  </button>
                  <button
                    onClick={onDismissNudge}
                    className="px-4 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-700/70 text-gray-300 text-sm font-medium transition-colors"
                  >
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
      <div ref={composerRef} className="px-6 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2 items-center bg-gray-800/50 border border-gray-600/50 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
            <ArtifactUploadButton
              projectId={project?.id || null}
              onUploadComplete={onRefreshProject}
            />
            <textarea
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={getContextualPlaceholder()}
              className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none resize-none min-h-[40px] max-h-[200px]"
              rows={1}
              disabled={isProcessing}
            />
            <button
              onClick={handleSendMessage}
              disabled={!currentInput.trim() || isProcessing}
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-600 text-white transition-all disabled:cursor-not-allowed flex items-center justify-center"
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
    </div>
  );
};

export default UnifiedWorkspace;
