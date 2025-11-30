/* eslint-disable no-console */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { MarkdownMessage } from "./MarkdownMessage";
import { ToolBadges } from "./ToolBadges";
import { VoiceSettings } from "./VoiceSettings";
import { TextHighlightTooltip } from "./TextHighlightTooltip";
import { BookmarkPanel } from "./BookmarkPanel";
import { useChatStream } from "../hooks/useChatStream";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

// Removed MicroStep interface - no longer using cards UI

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
  plan_status?: "not_generated" | "generated" | "approved" | "rejected";
  current_micro_step?: number;
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
  onCreateProject: (
    goal: string,
    buildApproach?: "code" | "platform" | "auto",
    projectPurpose?: "personal" | "business" | "learning" | "creative",
    coreProof?: string,
    budgetLimit?: "$0" | "$100" | "$1000+",
    clarificationContext?: string,
  ) => void;
  onInspireMe: (goal: string, callback: () => void) => void;
  toolsUsed: ToolActivity[];
  setToolsUsed: (tools: ToolActivity[]) => void;
  creating: boolean;
  inspiring: boolean;
  onRefreshProject: () => void;
  onAskAIRef?: React.MutableRefObject<(() => void) | null>;
  onOpenNewWorkspace?: () => void;
  messages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

const UnifiedWorkspace: React.FC<UnifiedWorkspaceProps> = ({
  project,
  onCreateProject: _onCreateProject,
  onInspireMe,
  toolsUsed,
  setToolsUsed,
  creating,
  inspiring,
  onRefreshProject,
  onAskAIRef,
  onOpenNewWorkspace,
  messages: externalMessages,
  onMessagesChange,
}) => {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const messages =
    externalMessages !== undefined ? externalMessages : internalMessages;
  const setMessages = onMessagesChange || setInternalMessages;
  const [currentInput, setCurrentInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUploadButton, setShowUploadButton] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [buildApproach, setBuildApproach] = useState<
    "code" | "platform" | "auto" | null
  >(null);
  const [projectPurpose, setProjectPurpose] = useState<
    "personal" | "business" | "learning" | "creative" | null
  >(null);
  const [coreProof, setCoreProof] = useState("");
  const [budgetLimit, setBudgetLimit] = useState<
    "$0" | "$100" | "$1000+" | null
  >(null);
  const [additionalContext, setAdditionalContext] = useState("");
  const [showBookmarkPanel, setShowBookmarkPanel] = useState(false);

  // Completion modal state
  // Removed micro-step state variables - no longer using cards UI
  // Removed completion modal - AI auto-advances conversationally

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const messagesFetchedRef = useRef(false);

  // Removed auto-generation of micro-steps
  // Micro-steps will be generated and executed seamlessly when "Ask AI" is clicked

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
      } else if (response.status === 429) {
        // Rate limited - skip this poll
        console.warn(
          "[UnifiedWorkspace] Rate limited on message fetch, skipping",
        );
      }
    } catch (error) {
      // Only log errors that aren't rate limits
      if (error instanceof Error && !error.message.includes("429")) {
        console.error("[UnifiedWorkspace] Error fetching messages:", error);
      }
    }
  }, [threadId]);

  // Reset workspace state when project changes
  useEffect(() => {
    if (project?.id) {
      // Clear messages when switching to a new project
      setMessages([]);
      messagesFetchedRef.current = false;

      console.log(
        `[UnifiedWorkspace] Switched to project ${project.id}, cleared workspace state`,
      );
    }
  }, [project?.id]);

  // Initial fetch of messages
  useEffect(() => {
    if (!threadId || messagesFetchedRef.current) return;

    messagesFetchedRef.current = true;
    fetchThreadMessages();
  }, [threadId, fetchThreadMessages]);

  // No polling needed - SSE streams provide real-time updates
  // Messages are fetched once on mount and updated via streaming responses

  // Helper function to send a message directly with a specific prompt
  const sendMessageWithPrompt = useCallback(
    async (promptText: string) => {
      if (!project) return;

      setIsProcessing(true);
      setToolsUsed([]); // Clear previous tools
      const userMessage = promptText.trim();

      // Only show user message if they actually typed something
      if (userMessage) {
        const newMessage: ChatMessage = {
          id: Date.now().toString(),
          type: "user",
          content: userMessage,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, newMessage]);
      }

      // Get current step's master prompt
      // Handle both phase-based and step-based projects
      let currentStep;
      if (project.phases && project.phases.length > 0) {
        // Phase-based project: find current phase and active substep
        const currentPhase = project.phases.find((p) => p.status === "active");
        if (currentPhase && currentPhase.substeps) {
          currentStep = currentPhase.substeps.find(
            (s) => s.status === "active",
          );
        }
      } else if (project.steps) {
        // Step-based project (legacy)
        currentStep = project.steps.find(
          (s) => s.step_number === project.current_step,
        );
      }

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
        // Backend will fetch master_prompt from database based on current_step
        // This ensures we always use the latest step's prompt after auto-advancement
        const response = await fetch(
          `${API_URL}/api/v2/projects/${project.id}/execute-step`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
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
        let hasContent = false; // Track if we got any AI response
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
                  hasContent = true; // Mark that we received content
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

        if (!receivedDone && hasContent) {
          // Stream completed successfully even without explicit done event
        }

        // Note: Completion check is now manual via "Check Progress" button
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

  // Removed all micro-step API functions - no longer using cards UI workflow

  const handleAskAI = useCallback(() => {
    if (!project || isProcessing) return;

    // Backend will fetch master_prompt from database
    // Just trigger execution with empty message
    sendMessageWithPrompt("");
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

  // Use simple chat stream hook for LLM-only mode
  const { streamingMessage, isStreaming, startStream } = useChatStream();

  // Update messages when streaming message changes
  useEffect(() => {
    console.log("[UnifiedWorkspace] streamingMessage changed:", {
      hasContent: !!streamingMessage?.content,
      contentLength: streamingMessage?.content?.length,
      isComplete: streamingMessage?.isComplete,
    });
    if (streamingMessage && streamingMessage.content) {
      setMessages((prev) => {
        // Check if last message is the streaming AI message
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.type === "ai" && lastMsg.id === "streaming") {
          // Update existing streaming message
          return prev.map((msg) =>
            msg.id === "streaming"
              ? { ...msg, content: streamingMessage.content }
              : msg,
          );
        } else {
          // Add new AI message
          return [
            ...prev,
            {
              id: "streaming",
              type: "ai" as const,
              content: streamingMessage.content,
              timestamp: new Date(),
            },
          ];
        }
      });

      // Update tool badges from streaming message
      if (
        streamingMessage.activeTools.length > 0 ||
        streamingMessage.completedTools.length > 0
      ) {
        const newTools: ToolActivity[] = [
          ...streamingMessage.activeTools.map((tool) => ({
            type: "tool_start" as const,
            tool,
            timestamp: new Date().toISOString(),
          })),
          ...streamingMessage.completedTools.map((tool) => ({
            type: "tool_end" as const,
            tool,
            timestamp: new Date().toISOString(),
          })),
        ];
        setToolsUsed(newTools);
      }
    }

    // When streaming is complete, finalize the message and clear tool badges
    if (streamingMessage?.isComplete) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === "streaming" ? { ...msg, id: Date.now().toString() } : msg,
        ),
      );
      // Clear tool badges when streaming is complete
      setToolsUsed([]);
    }
  }, [streamingMessage, setToolsUsed]);

  const handleSendMessage = async () => {
    if (!currentInput.trim() || isProcessing || isStreaming) return;

    setIsProcessing(true);
    const userMessage = currentInput.trim();

    // Add user message to chat
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setCurrentInput("");

    // Convert ChatMessage format to API format (role/content)
    const historyForAPI = updatedMessages.slice(0, -1).map((msg) => ({
      role: msg.type === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    // Start streaming AI response with updated message history
    await startStream(userMessage, "user", historyForAPI);
    setIsProcessing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleGoDeeper = async (selectedText: string) => {
    // Create a prompt asking the LLM to explain the selected text
    const prompt = `Explain this in detail:\n\n"${selectedText}"`;

    if (isProcessing || isStreaming) return;

    setIsProcessing(true);

    // Add user message to chat
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: prompt,
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);

    // Convert ChatMessage format to API format (role/content)
    const historyForAPI = updatedMessages.slice(0, -1).map((msg) => ({
      role: msg.type === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    // Start streaming AI response with updated message history
    await startStream(prompt, "user", historyForAPI);
    setIsProcessing(false);
  };

  // LLM-only branch: Skip landing page, always show workshop
  // Empty state when no project
  // eslint-disable-next-line no-constant-condition, no-constant-binary-expression
  if (false && !project) {
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

            {/* Core Proof Statement */}
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 shadow-lg">
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 block">
                If your project accomplishes ONE thing to prove it works, what
                is it?
              </label>
              <textarea
                value={coreProof}
                onChange={(e) => setCoreProof(e.target.value)}
                placeholder="Example: I log an expense and see my remaining budget update instantly"
                className="w-full bg-neutral-900/50 border border-neutral-600/50 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50 resize-none"
                rows={2}
                disabled={creating || inspiring}
              />
              <div className="mt-2 text-xs text-neutral-500">
                Examples: "Someone creates a task and their teammate gets
                notified" • "I save a recipe and find it later by ingredient"
              </div>
            </div>

            {/* Build Approach Selection */}
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 shadow-lg">
              <h3 className="text-sm font-medium text-neutral-300 mb-6">
                A couple more things to personalize your roadmap:
              </h3>

              {/* Question 1: Build Approach */}
              <div className="mb-6">
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 block">
                  1. How do you want to build this?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Code Option */}
                  <button
                    onClick={() => setBuildApproach("code")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      buildApproach === "code"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {buildApproach === "code" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">🧑‍💻</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">
                        Write Code
                      </div>
                      <div className="text-xs opacity-80">
                        Full control, custom features
                      </div>
                    </div>
                  </button>

                  {/* Platform Option */}
                  <button
                    onClick={() => setBuildApproach("platform")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      buildApproach === "platform"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {buildApproach === "platform" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">🛠️</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">
                        Use a Platform
                      </div>
                      <div className="text-xs opacity-80">
                        Faster, Shopify/Wix/Bubble
                      </div>
                    </div>
                  </button>

                  {/* Not Sure Option */}
                  <button
                    onClick={() => setBuildApproach("auto")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      buildApproach === "auto"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {buildApproach === "auto" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">🤖</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">
                        Best for My Project
                      </div>
                      <div className="text-xs opacity-80">AI recommends</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Question 2: Project Purpose */}
              <div>
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 block">
                  2. Why are you building this?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Personal Option */}
                  <button
                    onClick={() => setProjectPurpose("personal")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      projectPurpose === "personal"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {projectPurpose === "personal" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">🏠</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">Personal</div>
                      <div className="text-xs opacity-80">For me/friends</div>
                    </div>
                  </button>

                  {/* Business Option */}
                  <button
                    onClick={() => setProjectPurpose("business")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      projectPurpose === "business"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {projectPurpose === "business" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">💼</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">Business</div>
                      <div className="text-xs opacity-80">Make money</div>
                    </div>
                  </button>

                  {/* Learning Option */}
                  <button
                    onClick={() => setProjectPurpose("learning")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      projectPurpose === "learning"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {projectPurpose === "learning" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">📚</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">Learning</div>
                      <div className="text-xs opacity-80">Build skills</div>
                    </div>
                  </button>

                  {/* Creative Option */}
                  <button
                    onClick={() => setProjectPurpose("creative")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      projectPurpose === "creative"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {projectPurpose === "creative" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">🎨</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">Creative</div>
                      <div className="text-xs opacity-80">Showcase work</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Question 3: Budget Constraints */}
              <div>
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 block">
                  3. What are your budget limits?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* $0 Budget Option */}
                  <button
                    onClick={() => setBudgetLimit("$0")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      budgetLimit === "$0"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {budgetLimit === "$0" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">🆓</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">
                        Strictly $0
                      </div>
                      <div className="text-xs opacity-80">Free tools only</div>
                    </div>
                  </button>

                  {/* $100/mo Budget Option */}
                  <button
                    onClick={() => setBudgetLimit("$100")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      budgetLimit === "$100"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {budgetLimit === "$100" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">💳</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">
                        Up to $100/mo
                      </div>
                      <div className="text-xs opacity-80">Tools & hosting</div>
                    </div>
                  </button>

                  {/* $1000+ Budget Option */}
                  <button
                    onClick={() => setBudgetLimit("$1000+")}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      budgetLimit === "$1000+"
                        ? "bg-gradient-brand border-brand-primary-400 text-white scale-100"
                        : "bg-neutral-800/30 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600/70 hover:scale-102"
                    }`}
                  >
                    {budgetLimit === "$1000+" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-brand-primary-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="text-3xl">💵</div>
                    <div className="text-center">
                      <div className="font-semibold text-sm mb-1">$1,000+</div>
                      <div className="text-xs opacity-80">
                        Can hire or run ads
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Additional Context (Optional) */}
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 shadow-lg">
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 block">
                Anything else we should know? (Optional)
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Example: Already have a logo designed, or working with a team of 2, or must work on mobile..."
                className="w-full bg-neutral-900/50 border border-neutral-600/50 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50 resize-none"
                rows={2}
                disabled={creating || inspiring}
              />
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
          {messages.map((message) => (
            <div key={message.id}>
              {message.type === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-2xl rounded-2xl px-5 py-3.5 bg-neutral-800 text-white shadow-sm">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold text-sm shadow-sm">
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-[2.625rem] space-y-2">
                    {message.content === "Thinking..." ? (
                      <div className="space-y-3 animate-pulse">
                        <div className="h-4 bg-neutral-700/50 rounded w-3/4"></div>
                        <div className="h-4 bg-neutral-700/50 rounded w-full"></div>
                        <div className="h-4 bg-neutral-700/50 rounded w-5/6"></div>
                      </div>
                    ) : (
                      <>
                        <MarkdownMessage
                          content={message.content}
                          onCopy={() => {
                            // Copy functionality is handled internally by MarkdownMessage
                          }}
                        />
                      </>
                    )}
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

          {/* Loading skeleton while streaming */}
          {isStreaming && !streamingMessage?.content && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold text-sm shadow-sm animate-pulse">
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
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
              </div>
              <div className="ml-[2.625rem] space-y-3 animate-pulse">
                <div className="h-4 bg-neutral-700/50 rounded w-3/4"></div>
                <div className="h-4 bg-neutral-700/50 rounded w-full"></div>
                <div className="h-4 bg-neutral-700/50 rounded w-5/6"></div>
              </div>
            </div>
          )}

          {/* Removed Plan Approval and Checkpoint Cards - micro-steps execute seamlessly now */}

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
              {/* Bookmark Button */}
              <button
                onClick={() => setShowBookmarkPanel(true)}
                className="p-2 rounded-lg text-neutral-400 hover:text-blue-400 hover:bg-white/5 transition-all"
                title="View bookmarks"
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
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </button>
              {/* Voice Settings Button */}
              <VoiceSettings />
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

      {/* Step Completion Modal */}

      {/* Text Highlight Tooltip */}
      <TextHighlightTooltip onGoDeeper={handleGoDeeper} userId="anonymous" />

      {/* Bookmark Panel */}
      {showBookmarkPanel && (
        <BookmarkPanel
          userId="anonymous"
          onClose={() => setShowBookmarkPanel(false)}
          onSelectBookmark={handleGoDeeper}
        />
      )}
    </div>
  );
};

export default UnifiedWorkspace;
