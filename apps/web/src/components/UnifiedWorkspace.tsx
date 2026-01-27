import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { MessageStream } from "./golden-thread/MessageStream";
import { ToolBadges } from "./ToolBadges";
import { TextHighlightTooltip } from "./TextHighlightTooltip";
import { BookmarkPanel } from "./BookmarkPanel";
import { useChatStream } from "../hooks/useChatStream";
import { NarrativeMap } from "./golden-thread/NarrativeMap";
import { useGoldenThreadHighlighting } from "../hooks/useGoldenThreadHighlighting";
import { useChatScrollMemory } from "../hooks/useScrollMemory";
import type { VisualContextBundle } from "../types/goldenThread";
import type {
  GoDeeperPayload,
  PendingPrompt,
  PromptMode,
  MapSession,
  MapConnection,
} from "../types/chat";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

const EDGE_TYPE_TO_STYLE: Record<string, string> = {
  DEEPER: "GREY",
  ROOTS: "GOLD",
  ECHOES: "PURPLE",
  PROPHECY: "CYAN",
  GENEALOGY: "GENEALOGY",
  NARRATIVE: "GREY",
  TYPOLOGY: "TYPOLOGY",
  FULFILLMENT: "FULFILLMENT",
  CONTRAST: "CONTRAST",
  PROGRESSION: "PROGRESSION",
  PATTERN: "PATTERN",
};

const REFERENCE_REGEX =
  /((?:\x5B\s*)?(?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?(?:\s*\x5D)?)/g;

// Removed MicroStep interface - no longer using cards UI

// V2 Roadmap Step
interface RoadmapStep {
  id: string;
  project_id: string;
  step_number: number;
  title: string;
  description: string;
  master_prompt: string;
  context: unknown;
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
  rawContent?: string;
  timestamp: Date;
  visualBundle?: VisualContextBundle; // Reference genealogy tree for this message
  suggestTrace?: boolean;
  tracePrompt?: string;
  connectionCount?: number;
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
  pendingPrompt?: GoDeeperPayload;
  onPromptConsumed?: () => void;
  bibleStudyMode?: boolean;
  onExitBibleStudy?: () => void;
  onResetBibleStudy?: () => void;
  onTrace?: (text: string) => void; // Canonical trace handler from App
  onGoDeeper?: (prompt: GoDeeperPayload) => void; // Go Deeper handler for Bible Study
  onShowVisualization?: (bundle: VisualContextBundle) => void; // Show full-screen map with existing bundle
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
  onOpenNewWorkspace: _onOpenNewWorkspace,
  messages: externalMessages,
  onMessagesChange,
  pendingPrompt,
  onPromptConsumed,
  bibleStudyMode = false,

  onExitBibleStudy: _onExitBibleStudy,
  onResetBibleStudy,
  onTrace,
  onGoDeeper,
  onShowVisualization,
}) => {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const messages =
    externalMessages !== undefined ? externalMessages : internalMessages;
  const setMessages = onMessagesChange || setInternalMessages;
  const [currentInput, setCurrentInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUploadButton, setShowUploadButton] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [randomTopicLoading, setRandomTopicLoading] = useState<
    "random" | "ot" | "nt" | null
  >(null);
  const [randomTopicsLoading, setRandomTopicsLoading] = useState(false);
  const [randomPericopes, setRandomPericopes] = useState<
    Array<{
      id: number;
      title: string;
      rangeRef: string;
      displayText: string;
      promptText: string;
      kind: "random" | "ot" | "nt";
    }>
  >([]);
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
  const [traceModeEnabled, setTraceModeEnabled] = useState(false);

  // Completion modal state
  // Removed micro-step state variables - no longer using cards UI
  // Removed completion modal - AI auto-advances conversationally

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const messagesFetchedRef = useRef(false);
  const lastPromptModeRef = useRef<PromptMode | null>(null);

  // Scroll position memory - remembers where user was in the chat
  const { scrollRef: chatScrollRef } = useChatScrollMemory(threadId);
  const lastUserPromptRef = useRef<string | null>(null);
  const [nextSuggestedPrompt, setNextSuggestedPrompt] =
    useState<PendingPrompt | null>(null);

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

  useEffect(() => {
    if (!bibleStudyMode) {
      setTraceModeEnabled(false);
    }
  }, [bibleStudyMode]);

  // Fetch messages from thread
  const fetchThreadMessages = useCallback(async () => {
    if (!threadId) return;

    try {
      const response = await fetch(
        `${API_URL}/api/threads/${threadId}/messages`,
      );
      if (response.ok) {
        const data = await response.json();
        const threadMessages: ChatMessage[] = data.data.map((msg: unknown) => ({
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
                // NEW: Gap #2 Fix - Auto-refresh when backend updates state
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
                // NEW: Gap #2 Fix - Handle substep completion
                try {
                  const completionData = JSON.parse(data);
                  console.log(
                    "[UnifiedWorkspace] Substep completed:",
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
                // NEW: Gap #2 Fix - Handle artifact completions
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
                    content: `**Artifact Analysis Complete**\n\nCompleted ${artifactData.completed_substeps.length} substep(s):\n${artifactData.completed_substeps.map((s: unknown) => `- P${s.phase_number}.${s.substep_number} (${s.status}, ${s.confidence}% confidence)`).join("\n")}\n\nProgress: ${artifactData.progress}%`,
                    timestamp: new Date(),
                  };
                  setMessages((prev) => [...prev, completionMessage]);
                  // Refresh will happen via project_refresh_request event
                } catch {
                  // Ignore JSON parse errors
                }
              } else if (currentEvent === "phase_unlocked") {
                // NEW: Gap #2 Fix - Handle phase unlock
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
                  content: `Error: ${errorMessage}`,
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
    if (bibleStudyMode && traceModeEnabled) {
      return "Trace mode: map a passage or question...";
    }
    if (bibleStudyMode) return "What's on your heart?";
    return "What's on your mind?";
  };

  // Active map session bundle (kept while map flag is on)
  const [visualBundle, setVisualBundle] = useState<VisualContextBundle | null>(
    null,
  );
  const [mapSession, setMapSession] = useState<MapSession | null>(null);
  const [fullMapPending, setFullMapPending] = useState(false);
  const [mapPendingFullMessageId, setMapPendingFullMessageId] = useState<
    string | null
  >(null);
  const fullMapRequestRef = useRef<{
    id: string;
    prompt: string;
    messageId?: string;
  } | null>(null);
  const [showVisualization, setShowVisualization] = useState(false);
  const [pendingVisualBundle, setPendingVisualBundle] =
    useState<VisualContextBundle | null>(null); // Store bundle until message is complete
  const [mapPrepActive, setMapPrepActive] = useState(false);
  const [mapPrepCount, setMapPrepCount] = useState<number | null>(null);
  const [mapReadyMessageId, setMapReadyMessageId] = useState<string | null>(
    null,
  );
  const { highlightedRefs, addReferencesFromText, resetHighlights } =
    useGoldenThreadHighlighting();
  const activeBundle = visualBundle;
  const activeHighlightedRefs = highlightedRefs;

  // TTS state management
  /* global HTMLAudioElement */
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop any playing audio
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingMessageId(null);
  }, []);

  // Handle TTS playback
  const handleTTS = useCallback(
    async (messageId: string, text: string) => {
      // If this message is already playing, stop it
      if (playingMessageId === messageId) {
        stopAudio();
        return;
      }

      // Stop any other audio that might be playing
      stopAudio();

      try {
        /* global URL, Audio */
        const response = await fetch("http://localhost:3001/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.substring(0, 4000),
            voice: "onyx",
            model: "tts-1",
            speed: 1.0,
          }),
        });

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audioRef.current = audio;
        setPlayingMessageId(messageId);

        // Cleanup when audio finishes
        audio.onended = () => {
          setPlayingMessageId(null);
          audioRef.current = null;
        };

        // Cleanup on error
        audio.onerror = () => {
          setPlayingMessageId(null);
          audioRef.current = null;
        };

        audio.play();
      } catch (error) {
        void error;
        setPlayingMessageId(null);
        audioRef.current = null;
      }
    },
    [playingMessageId, stopAudio],
  );

  // Handler for map_data events from backend
  // Now stores the bundle but doesn't display it automatically
  const handleMapData = useCallback((bundle: VisualContextBundle) => {
    // Store the bundle to attach to the message, but don't show it yet
    setVisualBundle((prev) => {
      if (prev && bundle.rootId !== prev.rootId) {
        setMapSession(null);
        setNextSuggestedPrompt(null);
      }
      return bundle;
    });
    setPendingVisualBundle(bundle);
    setMapPrepActive(true);
    setMapPrepCount(bundle.nodes?.length ?? 0);
  }, []);

  // Use simple chat stream hook for LLM-only mode
  const { streamingMessage, isStreaming, startStream } =
    useChatStream(handleMapData);

  const isEmptyState =
    messages.length === 0 &&
    !isStreaming &&
    !(streamingMessage?.content && !streamingMessage.isComplete);
  const showWorkspace = !isEmptyState || showVisualization;
  // Track processed prompt to prevent StrictMode double-invocation
  const processedPromptRef = useRef<GoDeeperPayload | null>(null);

  const isAffirmation = useCallback((text: string): boolean => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.split(/\s+/).length > 6) return false;
    return /^(yes|yep|yeah|sure|ok|okay|alright|go ahead|continue|lets go|let us go|do it|please)[.!]*$/.test(
      normalized,
    );
  }, []);

  const normalizeReference = useCallback((value: string) => {
    return value
      .replace(/[\x5B\x5D]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }, []);

  const formatNodeReference = useCallback(
    (node: VisualContextBundle["nodes"][number]) =>
      node.displaySubLabel || `${node.book_name} ${node.chapter}:${node.verse}`,
    [],
  );

  const buildReferenceLookup = useCallback(
    (bundle: VisualContextBundle) => {
      const lookup = new Map<string, number>();
      bundle.nodes.forEach((node) => {
        const canonical = formatNodeReference(node);
        lookup.set(normalizeReference(canonical), node.id);
        if (node.displayLabel) {
          lookup.set(normalizeReference(node.displayLabel), node.id);
        }
        if (node.book_abbrev) {
          lookup.set(
            normalizeReference(
              `${node.book_abbrev} ${node.chapter}:${node.verse}`,
            ),
            node.id,
          );
        }
        if (node.referenceKey) {
          lookup.set(node.referenceKey, node.id);
        }
      });
      return lookup;
    },
    [formatNodeReference, normalizeReference],
  );

  const buildPericopeScopeSet = useCallback((bundle: VisualContextBundle) => {
    const ids = bundle.pericopeBundle?.nodes?.map((node) => node.id) || [];
    if (ids.length > 0) return new Set(ids);
    if (bundle.pericopeContext?.id) return new Set([bundle.pericopeContext.id]);
    return new Set<number>();
  }, []);

  const extractReferences = useCallback((text: string): string[] => {
    const matches = text.match(REFERENCE_REGEX);
    if (!matches) return [];
    return matches.map((value) =>
      value.replace(/^\s*\x5B|\x5D\s*$/g, "").trim(),
    );
  }, []);

  const buildEdgeKey = useCallback(
    (connectionType: string, fromId: number, toId: number) => {
      const a = Math.min(fromId, toId);
      const b = Math.max(fromId, toId);
      return `${connectionType}:${a}-${b}`;
    },
    [],
  );

  const getEdgeStyleType = useCallback((edgeType: string | undefined) => {
    if (!edgeType) return "GREY";
    return EDGE_TYPE_TO_STYLE[edgeType] || "GREY";
  }, []);

  const findBestEdge = useCallback(
    (bundle: VisualContextBundle, fromId: number, toId: number) => {
      const candidates = (bundle.edges || []).filter(
        (edge) =>
          (edge.from === fromId && edge.to === toId) ||
          (edge.from === toId && edge.to === fromId),
      );
      if (candidates.length === 0) return null;
      return candidates.reduce((best, current) => {
        const bestWeight = typeof best.weight === "number" ? best.weight : 0.7;
        const currentWeight =
          typeof current.weight === "number" ? current.weight : 0.7;
        return currentWeight > bestWeight ? current : best;
      }, candidates[0]);
    },
    [],
  );

  const resolveConnectionType = useCallback(
    (
      bundle: VisualContextBundle,
      fromId: number,
      toId: number,
      fallback: string,
    ) => {
      const bestEdge = findBestEdge(bundle, fromId, toId);
      if (!bestEdge) return fallback;
      return getEdgeStyleType(bestEdge.type);
    },
    [findBestEdge, getEdgeStyleType],
  );

  const buildClusterFromBundle = useCallback(
    (
      bundle: VisualContextBundle,
      baseId: number,
      connectionType: string,
      seedVerseIds: number[] = [],
    ) => {
      const verseIdSet = new Set<number>(seedVerseIds);
      verseIdSet.add(baseId);
      (bundle.edges || []).forEach((edge) => {
        const styleType = getEdgeStyleType(edge.type);
        if (styleType !== connectionType) return;
        if (edge.from === baseId) {
          verseIdSet.add(edge.to);
        } else if (edge.to === baseId) {
          verseIdSet.add(edge.from);
        }
      });
      return {
        baseId,
        verseIds: Array.from(verseIdSet),
        connectionType,
      };
    },
    [getEdgeStyleType],
  );

  const buildClusterEdges = useCallback(
    (
      bundle: VisualContextBundle,
      cluster: NonNullable<MapSession["cluster"]>,
    ) =>
      cluster.verseIds
        .filter((id) => id !== cluster.baseId)
        .map((id) => {
          const bestEdge = findBestEdge(bundle, cluster.baseId, id);
          return {
            fromId: cluster.baseId,
            toId: id,
            connectionType: cluster.connectionType,
            weight: bestEdge?.weight ?? 0.7,
          };
        }),
    [findBestEdge],
  );

  const buildAllClusters = useCallback(
    (bundle: VisualContextBundle) => {
      const clusters = new Map<
        string,
        {
          key: string;
          baseId: number;
          connectionType: string;
          verseIds: Set<number>;
          totalWeight: number;
        }
      >();
      (bundle.edges || []).forEach((edge) => {
        const styleType = getEdgeStyleType(edge.type);
        const weight = typeof edge.weight === "number" ? edge.weight : 0.7;
        const addEdge = (baseId: number, otherId: number) => {
          const key = `${baseId}:${styleType}`;
          if (!clusters.has(key)) {
            clusters.set(key, {
              key,
              baseId,
              connectionType: styleType,
              verseIds: new Set<number>(),
              totalWeight: 0,
            });
          }
          const cluster = clusters.get(key);
          if (cluster) {
            cluster.verseIds.add(otherId);
            cluster.totalWeight += weight;
          }
        };
        addEdge(edge.from, edge.to);
        addEdge(edge.to, edge.from);
      });
      return Array.from(clusters.values()).map((cluster) => ({
        ...cluster,
        verseIds: Array.from(cluster.verseIds),
      }));
    },
    [getEdgeStyleType],
  );

  const pickNextConnection = useCallback(
    (
      bundle: VisualContextBundle,
      cluster: MapSession["cluster"] | undefined,
      visited: Set<string>,
    ): {
      nextConnection: MapConnection | null;
      nextCluster: MapSession["cluster"] | undefined;
    } => {
      const pericopeScope = buildPericopeScopeSet(bundle);
      const nodeLookup = new Map(bundle.nodes.map((node) => [node.id, node]));
      const isEdgeInScope = (fromId: number, toId: number) => {
        if (pericopeScope.size === 0) return true;
        const fromNode = nodeLookup.get(fromId);
        const toNode = nodeLookup.get(toId);
        if (!fromNode || !toNode) return false;
        if (!fromNode.pericopeId || !toNode.pericopeId) return false;
        return (
          pericopeScope.has(fromNode.pericopeId) &&
          pericopeScope.has(toNode.pericopeId)
        );
      };

      if (cluster) {
        const edges = buildClusterEdges(bundle, cluster);
        const filtered = edges.filter(
          (edge) =>
            !visited.has(
              buildEdgeKey(edge.connectionType, edge.fromId, edge.toId),
            ),
        );
        const scopedEdges = filtered.filter((edge) =>
          isEdgeInScope(edge.fromId, edge.toId),
        );
        const candidateEdges = scopedEdges.length > 0 ? scopedEdges : filtered;
        const nextInCluster = candidateEdges.sort((a, b) => {
          if (b.weight !== a.weight) return b.weight - a.weight;
          return a.toId - b.toId;
        })[0];
        if (nextInCluster) {
          return {
            nextConnection: {
              fromId: nextInCluster.fromId,
              toId: nextInCluster.toId,
              connectionType: nextInCluster.connectionType,
            },
            nextCluster: cluster,
          };
        }
      }

      const clusters = buildAllClusters(bundle)
        .map((entry) => {
          const edgeKeys = entry.verseIds.map((id) =>
            buildEdgeKey(entry.connectionType, entry.baseId, id),
          );
          const remainingIds = entry.verseIds.filter(
            (id) =>
              !visited.has(
                buildEdgeKey(entry.connectionType, entry.baseId, id),
              ),
          );
          const inScopeIds = remainingIds.filter((id) =>
            isEdgeInScope(entry.baseId, id),
          );
          const effectiveRemainingIds =
            inScopeIds.length > 0 ? inScopeIds : remainingIds;
          return {
            ...entry,
            edgeKeys,
            inScopeCount: inScopeIds.length,
            remainingIds: effectiveRemainingIds,
            remainingCount: effectiveRemainingIds.length,
          };
        })
        .filter((entry) => entry.remainingCount > 0);

      if (clusters.length === 0) {
        return { nextConnection: null, nextCluster: cluster };
      }

      const remainingByType = clusters.reduce(
        (acc, entry) => {
          acc[entry.connectionType] =
            (acc[entry.connectionType] || 0) + entry.remainingCount;
          return acc;
        },
        {} as Record<string, number>,
      );

      const targetType = Object.entries(remainingByType).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })[0]?.[0];

      const sameBaseTargetClusters =
        cluster && targetType
          ? clusters.filter(
              (entry) =>
                entry.baseId === cluster.baseId &&
                entry.connectionType === targetType,
            )
          : [];

      const candidateClusters =
        sameBaseTargetClusters.length > 0
          ? sameBaseTargetClusters
          : targetType
            ? clusters.filter((entry) => entry.connectionType === targetType)
            : clusters;

      candidateClusters.sort((a, b) => {
        if (b.remainingCount !== a.remainingCount) {
          return b.remainingCount - a.remainingCount;
        }
        if (b.totalWeight !== a.totalWeight) {
          return b.totalWeight - a.totalWeight;
        }
        if (b.verseIds.length !== a.verseIds.length) {
          return b.verseIds.length - a.verseIds.length;
        }
        if (a.baseId !== b.baseId) return a.baseId - b.baseId;
        return a.connectionType.localeCompare(b.connectionType);
      });

      const selectedCluster = candidateClusters[0];
      const nextId = selectedCluster.remainingIds.sort((a, b) => a - b)[0];

      if (!nextId) {
        return { nextConnection: null, nextCluster: cluster };
      }

      return {
        nextConnection: {
          fromId: selectedCluster.baseId,
          toId: nextId,
          connectionType: selectedCluster.connectionType,
        },
        nextCluster: {
          baseId: selectedCluster.baseId,
          verseIds: selectedCluster.verseIds,
          connectionType: selectedCluster.connectionType,
        },
      };
    },
    [buildAllClusters, buildClusterEdges, buildEdgeKey, buildPericopeScopeSet],
  );

  const buildMapSessionPayload = useCallback(
    ({
      bundle,
      seedSession,
      existingSession,
      inputText,
      useQueuedConnection,
    }: {
      bundle: VisualContextBundle;
      seedSession?: MapSession | null;
      existingSession?: MapSession | null;
      inputText?: string;
      useQueuedConnection: boolean;
    }) => {
      const visited = new Set<string>(
        seedSession?.visitedEdgeKeys || existingSession?.visitedEdgeKeys || [],
      );
      let cluster = seedSession?.cluster || existingSession?.cluster;
      let currentConnection =
        seedSession?.currentConnection || existingSession?.currentConnection;
      let previousConnection =
        seedSession?.previousConnection || existingSession?.previousConnection;

      const references = inputText ? extractReferences(inputText) : [];
      const lookup = buildReferenceLookup(bundle);
      const referencedIds = references
        .map((ref) => lookup.get(normalizeReference(ref)))
        .filter((id): id is number => typeof id === "number");
      const offMapReferences = references.filter(
        (ref) => !lookup.has(normalizeReference(ref)),
      );

      if (!seedSession) {
        if (useQueuedConnection && existingSession?.nextConnection) {
          currentConnection = existingSession.nextConnection;
          previousConnection = existingSession.currentConnection;
        } else if (referencedIds.length > 0) {
          previousConnection = undefined;
          const baseId =
            referencedIds.length > 1
              ? referencedIds[0]
              : cluster?.baseId || bundle.rootId || referencedIds[0];
          let toId =
            referencedIds.length > 1
              ? referencedIds[1]
              : referencedIds[0] === baseId
                ? bundle.rootId || referencedIds[0]
                : referencedIds[0];
          if (toId === baseId) {
            const fallbackId = cluster?.verseIds?.find((id) => id !== baseId);
            if (fallbackId) {
              toId = fallbackId;
            }
          }
          const connectionType = resolveConnectionType(
            bundle,
            baseId,
            toId,
            cluster?.connectionType || "GREY",
          );
          currentConnection = { fromId: baseId, toId, connectionType };
          cluster = buildClusterFromBundle(bundle, baseId, connectionType, [
            baseId,
            toId,
          ]);
        }
      }

      if (currentConnection) {
        visited.add(
          buildEdgeKey(
            currentConnection.connectionType,
            currentConnection.fromId,
            currentConnection.toId,
          ),
        );
      }

      const { nextConnection, nextCluster } = pickNextConnection(
        bundle,
        cluster,
        visited,
      );

      const session: MapSession = {
        cluster: nextCluster || cluster,
        currentConnection,
        previousConnection,
        nextConnection,
        visitedEdgeKeys: Array.from(visited),
        offMapReferences: offMapReferences.length
          ? offMapReferences
          : undefined,
        exhausted: !nextConnection,
      };

      return {
        session,
        queuedConnection: nextConnection,
      };
    },
    [
      buildClusterFromBundle,
      buildEdgeKey,
      buildReferenceLookup,
      extractReferences,
      normalizeReference,
      pickNextConnection,
      resolveConnectionType,
    ],
  );

  /**
   * Detect if a message is a contextual follow-up that doesn't need re-anchoring.
   * Returns true if the question references existing context without introducing new verses.
   */
  const isContextualFollowUp = useCallback(
    (message: string, hasBundle: boolean): boolean => {
      if (!hasBundle) return false;

      const normalized = message.trim().toLowerCase();
      const wordCount = normalized.split(/\s+/).length;

      // If there's an explicit verse reference, it's not a simple follow-up
      const hasVerseRef = /\b\d?\s?[a-z]+\s+\d+:\d+/i.test(message);
      if (hasVerseRef) return false;

      // Pronoun-heavy questions reference prior context
      const pronounPattern =
        /\b(it|that|this|these|those|the same|what you said|you mentioned|the passage|the verse|the text)\b/i;
      const hasPronoun = pronounPattern.test(normalized);

      // Follow-up indicator phrases
      const followUpPattern =
        /^(what|why|how|can you|could you|tell me|explain|more about|go deeper|elaborate|clarify|meaning|significance|does this|does that|what does)/i;
      const isFollowUpPhrase = followUpPattern.test(normalized);

      // Short question with pronoun or follow-up phrase = contextual follow-up
      if (wordCount <= 15 && (hasPronoun || isFollowUpPhrase)) {
        return true;
      }

      // Very short questions without verse refs are likely follow-ups
      if (wordCount <= 6) {
        return true;
      }

      return false;
    },
    [],
  );

  const startFullMapFetch = useCallback(
    async (prompt: string) => {
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      fullMapRequestRef.current = { id: requestId, prompt };
      setFullMapPending(true);

      try {
        const response = await fetch(`${API_URL}/api/trace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: prompt }),
        });

        if (!response.ok) {
          setFullMapPending(false);
          setMapPendingFullMessageId(null);
          fullMapRequestRef.current = null;
          return;
        }

        const bundle: VisualContextBundle = await response.json();
        const pendingRequest = fullMapRequestRef.current;
        if (!pendingRequest || pendingRequest.id !== requestId) {
          return;
        }

        setVisualBundle(bundle);
        setFullMapPending(false);
        setMapPendingFullMessageId(null);
        fullMapRequestRef.current = null;

        if (pendingRequest.messageId) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === pendingRequest.messageId
                ? { ...msg, visualBundle: bundle }
                : msg,
            ),
          );
        }

        setMapSession((prevSession) => {
          if (!prevSession) return prevSession;
          const { session } = buildMapSessionPayload({
            bundle,
            existingSession: prevSession,
            useQueuedConnection: false,
          });
          return session;
        });
      } catch (error) {
        void error;
        setFullMapPending(false);
        setMapPendingFullMessageId(null);
        fullMapRequestRef.current = null;
      }
    },
    [buildMapSessionPayload, setMessages],
  );

  // Handle pending prompt from Bible reader (auto-start stream)
  useEffect(() => {
    if (pendingPrompt && !isStreaming && !isProcessing) {
      // Prevent StrictMode from processing the same prompt twice
      if (processedPromptRef.current === pendingPrompt) {
        return;
      }

      processedPromptRef.current = pendingPrompt;
      const normalizedPrompt: PendingPrompt =
        typeof pendingPrompt === "string"
          ? { displayText: pendingPrompt, prompt: pendingPrompt }
          : pendingPrompt;

      // Auto-start stream with the prompt from Bible footer
      const startPendingPrompt = async () => {
        setIsProcessing(true);
        setMapPrepActive(!bibleStudyMode || traceModeEnabled);
        setMapPrepCount(bibleStudyMode && !traceModeEnabled ? null : 0);
        setMapReadyMessageId(null);
        setPendingVisualBundle(null);
        const inferredPromptMode = normalizedPrompt.mode ?? "go_deeper_short";
        lastPromptModeRef.current = inferredPromptMode;
        if (normalizedPrompt.visualBundle) {
          setVisualBundle(normalizedPrompt.visualBundle);
        }

        const bundleForMap = normalizedPrompt.visualBundle || visualBundle;
        const referenceSource =
          normalizedPrompt.prompt || normalizedPrompt.displayText;
        const references = extractReferences(referenceSource);
        const hasExplicitRef = references.length > 0;
        const offMapReferences =
          bundleForMap && hasExplicitRef
            ? references.filter(
                (ref) =>
                  !buildReferenceLookup(bundleForMap).has(
                    normalizeReference(ref),
                  ),
              )
            : [];
        const isFollowUp = isContextualFollowUp(
          normalizedPrompt.displayText,
          !!bundleForMap,
        );
        const shouldReanchor =
          !bundleForMap ||
          (!fullMapPending &&
            !isFollowUp &&
            (!hasExplicitRef || offMapReferences.length > 0));
        let mapSessionPayload: MapSession | undefined;
        if (bundleForMap && (normalizedPrompt.mapSession || mapSession)) {
          const { session } = buildMapSessionPayload({
            bundle: bundleForMap,
            seedSession: normalizedPrompt.mapSession || null,
            existingSession: mapSession,
            inputText: normalizedPrompt.displayText,
            useQueuedConnection: false,
          });
          mapSessionPayload = session;
          setMapSession(session);
        } else if (shouldReanchor) {
          setMapSession(null);
          setVisualBundle(null);
          setMapPendingFullMessageId(null);
        }

        // Add user message to chat
        const newMessage: ChatMessage = {
          id: Date.now().toString(),
          type: "user",
          content: normalizedPrompt.displayText,
          rawContent: normalizedPrompt.prompt,
          timestamp: new Date(),
        };
        const updatedMessages = [...messages, newMessage];
        setMessages(updatedMessages);

        // Convert ChatMessage format to API format (role/content)
        const historyForAPI = updatedMessages.slice(0, -1).map((msg) => ({
          role: msg.type === "user" ? "user" : "assistant",
          content: msg.rawContent ?? msg.content,
        }));

        if (shouldReanchor && (!bibleStudyMode || traceModeEnabled)) {
          void startFullMapFetch(referenceSource);
        }

        lastUserPromptRef.current = referenceSource;

        // Start streaming AI response
        await startStream(
          referenceSource,
          "user",
          historyForAPI,
          inferredPromptMode ?? undefined,
          bundleForMap || undefined,
          mapSessionPayload,
          shouldReanchor ? "fast" : undefined,
          bibleStudyMode && !traceModeEnabled
            ? `${API_URL}/api/bible-study`
            : undefined,
        );
        setIsProcessing(false);

        // Notify parent that prompt has been consumed
        onPromptConsumed?.();
      };

      startPendingPrompt();
    }
  }, [
    pendingPrompt,
    isStreaming,
    isProcessing,
    messages,
    setMessages,
    startStream,
    onPromptConsumed,
    visualBundle,
    mapSession,
    buildMapSessionPayload,
    extractReferences,
    buildReferenceLookup,
    normalizeReference,
    fullMapPending,
    startFullMapFetch,
    bibleStudyMode,
    traceModeEnabled,
  ]);

  // Reset processed prompt when prompt is consumed
  useEffect(() => {
    if (!pendingPrompt) {
      processedPromptRef.current = null;
    }
  }, [pendingPrompt]);

  useEffect(() => {
    if (!mapReadyMessageId) return;
    const timer = window.setTimeout(() => {
      setMapReadyMessageId(null);
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [mapReadyMessageId]);

  // Track citations from streaming content for Golden Thread highlighting
  // Only update when streaming is complete to avoid performance issues
  useEffect(() => {
    if (streamingMessage?.isComplete && streamingMessage.content) {
      addReferencesFromText(streamingMessage.content);
    }
  }, [
    streamingMessage?.isComplete,
    streamingMessage?.content,
    addReferencesFromText,
  ]);

  // Update tool badges from streaming message
  // Only update when tools actually change, not on every render
  useEffect(() => {
    if (
      streamingMessage &&
      (streamingMessage.activeTools.length > 0 ||
        streamingMessage.completedTools.length > 0)
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
  }, [
    // Stringify arrays to prevent unnecessary re-renders on content changes
    JSON.stringify(streamingMessage?.activeTools),
    JSON.stringify(streamingMessage?.completedTools),
    setToolsUsed,
  ]);

  // Track if we've already added the current streaming message to prevent duplicates
  const addedStreamingMessageRef = useRef(false);

  // Reset the flag when a new streaming session starts
  useEffect(() => {
    if (streamingMessage && !streamingMessage.isComplete) {
      addedStreamingMessageRef.current = false;
    }
  }, [streamingMessage?.isComplete]);

  // When streaming is complete, add it to messages array
  useEffect(() => {
    console.log(
      "[UnifiedWorkspace] Effect triggered - streamingMessage:",
      streamingMessage
        ? {
            isComplete: streamingMessage.isComplete,
            hasContent: !!streamingMessage.content,
            contentLength: streamingMessage.content?.length || 0,
          }
        : "null",
    );

    if (!streamingMessage) return;

    // Early return if streaming is not complete - prevents running during streaming
    if (!streamingMessage.isComplete) return;

    console.log(
      "[UnifiedWorkspace] Stream COMPLETE:",
      "isComplete:",
      streamingMessage.isComplete,
      "hasContent:",
      !!streamingMessage.content,
      "contentLength:",
      streamingMessage.content?.length || 0,
      "alreadyAdded:",
      addedStreamingMessageRef.current,
    );

    if (streamingMessage.content && !addedStreamingMessageRef.current) {
      console.log("[UnifiedWorkspace] Adding completed message to array");
      addedStreamingMessageRef.current = true;

      const newMessage = {
        id: Date.now().toString(),
        type: "ai" as const,
        content: streamingMessage.content,
        timestamp: new Date(),
        visualBundle: pendingVisualBundle || visualBundle || undefined,
        suggestTrace: streamingMessage.suggestTrace,
        connectionCount: streamingMessage.connectionCount,
        tracePrompt: lastUserPromptRef.current ?? undefined,
      };
      if (fullMapPending && fullMapRequestRef.current) {
        fullMapRequestRef.current.messageId = newMessage.id;
        setMapPendingFullMessageId(newMessage.id);
      }
      setNextSuggestedPrompt(null);

      setMessages((prev) => {
        console.log(
          "[UnifiedWorkspace] Created message - ID:",
          newMessage.id,
          "Type:",
          newMessage.type,
          "Content length:",
          newMessage.content.length,
        );
        console.log(
          "[UnifiedWorkspace] Messages before:",
          prev.length,
          "Messages after:",
          prev.length + 1,
        );
        return [...prev, newMessage];
      });

      // Clear tool badges and pending bundle when streaming is complete
      setToolsUsed([]);
      setMapPrepActive(false);
      setMapPrepCount(null);
      setMapReadyMessageId(newMessage.visualBundle ? newMessage.id : null);
      setPendingVisualBundle(null);
    }
  }, [
    streamingMessage?.isComplete,
    pendingVisualBundle,
    visualBundle,
    mapSession,
    fullMapPending,
  ]);

  const handleSendMessage = async (
    overrideInput?: string | { displayText: string; promptText: string },
  ) => {
    const hasOverride = overrideInput !== undefined;
    const displayText =
      typeof overrideInput === "string"
        ? overrideInput
        : (overrideInput?.displayText ?? currentInput);
    const promptText =
      typeof overrideInput === "string"
        ? overrideInput
        : (overrideInput?.promptText ?? displayText);
    const inputText = displayText.trim();
    const promptInput = promptText.trim();
    if (!inputText || !promptInput || isProcessing || isStreaming) return;

    setIsProcessing(true);
    setMapPrepActive(!bibleStudyMode || traceModeEnabled);
    setMapPrepCount(bibleStudyMode && !traceModeEnabled ? null : 0);
    setMapReadyMessageId(null);
    setPendingVisualBundle(null);
    const shouldUseSuggested =
      !hasOverride && nextSuggestedPrompt && isAffirmation(inputText);
    const apiMessage = shouldUseSuggested
      ? nextSuggestedPrompt.prompt
      : promptInput;
    const userMessage = apiMessage;
    const displayMessage = inputText;

    // Add user message to chat
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: displayMessage,
      rawContent: apiMessage,
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    if (!hasOverride) {
      setCurrentInput("");
    }

    // Convert ChatMessage format to API format (role/content)
    const historyForAPI = updatedMessages.slice(0, -1).map((msg) => ({
      role: msg.type === "user" ? "user" : "assistant",
      content: msg.rawContent ?? msg.content,
    }));

    const bundleForMap = visualBundle;
    const hasActiveBundle = Boolean(bundleForMap);
    const references = extractReferences(userMessage);
    const hasExplicitRef = references.length > 0;
    const offMapReferences =
      hasActiveBundle && hasExplicitRef
        ? references.filter(
            (ref) =>
              !buildReferenceLookup(bundleForMap!).has(normalizeReference(ref)),
          )
        : [];
    const isFollowUp = isContextualFollowUp(userMessage, hasActiveBundle);
    const shouldReanchor =
      !hasActiveBundle ||
      (!fullMapPending &&
        !shouldUseSuggested &&
        !isFollowUp &&
        (!hasExplicitRef || offMapReferences.length > 0));
    const mapPromptMode =
      shouldReanchor || hasActiveBundle || fullMapPending
        ? "go_deeper_short"
        : undefined;
    const promptMode = shouldUseSuggested
      ? (nextSuggestedPrompt?.mode ?? mapPromptMode)
      : mapPromptMode;
    if (shouldUseSuggested) {
      setNextSuggestedPrompt(null);
    }
    lastPromptModeRef.current = promptMode ?? null;

    const useQueuedConnection = shouldUseSuggested && !hasExplicitRef;
    let mapSessionPayload: MapSession | undefined;
    if (bundleForMap && !shouldReanchor) {
      const { session } = buildMapSessionPayload({
        bundle: bundleForMap,
        existingSession: mapSession,
        inputText: userMessage,
        useQueuedConnection,
      });
      mapSessionPayload = session;
      setMapSession(session);
    } else if (shouldReanchor) {
      setMapSession(null);
      setNextSuggestedPrompt(null);
      setVisualBundle(null);
      setMapPendingFullMessageId(null);
    }

    const streamBundle = shouldReanchor ? undefined : bundleForMap || undefined;
    const mapMode = shouldReanchor ? "fast" : undefined;

    // Start streaming AI response with updated message history
    lastUserPromptRef.current = promptInput;
    const streamPromise = startStream(
      apiMessage,
      "user",
      historyForAPI,
      promptMode,
      streamBundle,
      mapSessionPayload,
      mapMode,
      bibleStudyMode && !traceModeEnabled
        ? `${API_URL}/api/bible-study`
        : undefined,
    );
    if (shouldReanchor && (!bibleStudyMode || traceModeEnabled)) {
      void startFullMapFetch(userMessage);
    }
    await streamPromise;
    setIsProcessing(false);
  };

  const fetchRandomPericope = useCallback(
    async (
      kind: "random" | "ot" | "nt",
      options?: { testament?: "OT" | "NT" },
    ) => {
      const params = new URLSearchParams();
      if (options?.testament) {
        params.set("testament", options.testament);
      }
      const url = params.toString()
        ? `${API_URL}/api/pericope/random?${params.toString()}`
        : `${API_URL}/api/pericope/random`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to load random pericope");
      }
      const data = (await response.json()) as {
        pericopeId?: number;
        prompt?: string;
        title?: string;
        rangeRef?: string;
      };

      const title =
        typeof data.title === "string" ? data.title.trim() : "Pericope";
      const rangeRef =
        typeof data.rangeRef === "string" ? data.rangeRef.trim() : "";
      const basePrompt =
        typeof data.prompt === "string" && data.prompt.trim().length > 0
          ? data.prompt.trim()
          : rangeRef
            ? `Go deeper on [${rangeRef}].`
            : `Go deeper on ${title}.`;
      const displayText = basePrompt;
      const promptText = basePrompt;

      return {
        id: typeof data.pericopeId === "number" ? data.pericopeId : Date.now(),
        title,
        rangeRef,
        displayText,
        promptText,
        kind,
      };
    },
    [],
  );

  const sendPericopePrompt = async (
    kind: "random" | "ot" | "nt",
    displayText: string,
    promptText: string,
  ) => {
    if (
      !bibleStudyMode ||
      !isEmptyState ||
      isProcessing ||
      isStreaming ||
      randomTopicLoading
    ) {
      return;
    }
    setRandomTopicLoading(kind);
    try {
      if (onGoDeeper) {
        onGoDeeper({
          displayText,
          prompt: promptText,
          mode: "go_deeper_short",
        });
      } else {
        await handleSendMessage({ displayText, promptText });
      }
    } catch (error) {
      console.error("[UnifiedWorkspace] Random pericope failed:", error);
      setRandomTopicLoading(null);
    } finally {
      if (!onGoDeeper) {
        setRandomTopicLoading(null);
      }
    }
  };

  useEffect(() => {
    if (randomTopicLoading && !pendingPrompt && !isStreaming && !isProcessing) {
      setRandomTopicLoading(null);
    }
  }, [randomTopicLoading, pendingPrompt, isStreaming, isProcessing]);

  useEffect(() => {
    if (!bibleStudyMode || !isEmptyState) return;
    if (randomPericopes.length > 0) return;

    let isActive = true;
    setRandomTopicsLoading(true);

    const loadTopics = async () => {
      try {
        const results = await Promise.all([
          fetchRandomPericope("random"),
          fetchRandomPericope("ot", { testament: "OT" }),
          fetchRandomPericope("nt", { testament: "NT" }),
        ]);

        if (!isActive) return;
        const unique = new Map<number, (typeof results)[number]>();
        results.forEach((item) => {
          if (item) unique.set(item.id, item);
        });
        setRandomPericopes(Array.from(unique.values()));
      } catch (error) {
        console.error(
          "[UnifiedWorkspace] Failed to load pericope topics:",
          error,
        );
      } finally {
        if (isActive) setRandomTopicsLoading(false);
      }
    };

    void loadTopics();

    return () => {
      isActive = false;
    };
  }, [
    bibleStudyMode,
    isEmptyState,
    randomPericopes.length,
    fetchRandomPericope,
  ]);

  const resetBibleStudySession = () => {
    if (isProcessing || isStreaming) return;

    stopAudio();
    setCurrentInput("");
    setMessages([]);
    setToolsUsed([]);
    setRandomTopicLoading(null);
    setRandomTopicsLoading(false);
    setRandomPericopes([]);
    setVisualBundle(null);
    setPendingVisualBundle(null);
    setMapSession(null);
    setFullMapPending(false);
    setMapPendingFullMessageId(null);
    setMapReadyMessageId(null);
    fullMapRequestRef.current = null;
    setMapPrepActive(false);
    setMapPrepCount(null);
    setNextSuggestedPrompt(null);
    setShowVisualization(false);
    resetHighlights();

    onResetBibleStudy?.();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Use the canonical trace handler passed from App
  const handleGoDeeper = useCallback(
    (selectedText: string) => {
      if (onTrace) {
        onTrace(selectedText);
      }
    },
    [onTrace],
  );

  const visualizationPanel = useMemo(
    () =>
      showVisualization &&
      activeBundle && (
        <div className="w-1/2 bg-neutral-900 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-neutral-300">
                Theological Thread Explorer ({activeBundle.nodes?.length || 0}{" "}
                verses)
              </h3>
            </div>
            <button
              onClick={() => setShowVisualization(false)}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              title="Close visualization"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto relative">
            <NarrativeMap
              bundle={activeBundle}
              highlightedRefs={activeHighlightedRefs}
              onTrace={handleGoDeeper}
              onGoDeeper={onGoDeeper}
              userId="anonymous"
            />
          </div>
        </div>
      ),
    [
      showVisualization,
      activeBundle,
      activeHighlightedRefs,
      handleGoDeeper,
      onGoDeeper,
    ],
  );

  // Handle verse click from MessageStream component
  const handleVerseClick = async (reference: string) => {
    // Reference is in format like "John 3:16" or "1 Peter 5:7"
    if (isProcessing || isStreaming) return;

    setIsProcessing(true);
    setCurrentInput(reference); // Show it in the input briefly

    // Add user message to chat
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: reference,
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setCurrentInput(""); // Clear input after adding message

    // Convert ChatMessage format to API format (role/content)
    const historyForAPI = updatedMessages.slice(0, -1).map((msg) => ({
      role: msg.type === "user" ? "user" : "assistant",
      content: msg.rawContent ?? msg.content,
    }));

    const bundleForMap = visualBundle;
    const hasActiveBundle = Boolean(bundleForMap);
    const hasExplicitRef = true;
    const offMapReferences =
      hasActiveBundle && hasExplicitRef
        ? [reference].filter(
            (ref) =>
              !buildReferenceLookup(bundleForMap!).has(normalizeReference(ref)),
          )
        : [];
    const isFollowUp = isContextualFollowUp(reference, hasActiveBundle);
    const shouldReanchor =
      !hasActiveBundle ||
      (!fullMapPending && !isFollowUp && offMapReferences.length > 0);
    const promptMode =
      shouldReanchor || hasActiveBundle || fullMapPending
        ? "go_deeper_short"
        : undefined;

    let mapSessionPayload: MapSession | undefined;
    if (bundleForMap && !shouldReanchor) {
      const { session } = buildMapSessionPayload({
        bundle: bundleForMap,
        existingSession: mapSession,
        inputText: reference,
        useQueuedConnection: false,
      });
      mapSessionPayload = session;
      setMapSession(session);
      setNextSuggestedPrompt(null);
    } else if (shouldReanchor) {
      setMapSession(null);
      setNextSuggestedPrompt(null);
      setVisualBundle(null);
      setMapPendingFullMessageId(null);
    }

    setMapPrepActive(!bibleStudyMode || traceModeEnabled);
    setMapPrepCount(bibleStudyMode && !traceModeEnabled ? null : 0);
    setMapReadyMessageId(null);
    setPendingVisualBundle(null);
    lastPromptModeRef.current = promptMode ?? null;

    // Start streaming AI response
    lastUserPromptRef.current = reference;
    const streamPromise = startStream(
      reference,
      "user",
      historyForAPI,
      promptMode,
      shouldReanchor ? undefined : bundleForMap || undefined,
      mapSessionPayload,
      shouldReanchor ? "fast" : undefined,
      bibleStudyMode && !traceModeEnabled
        ? `${API_URL}/api/bible-study`
        : undefined,
    );
    if (shouldReanchor && (!bibleStudyMode || traceModeEnabled)) {
      void startFullMapFetch(reference);
    }
    await streamPromise;
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
              AI guides you through 7 phases - from vision to live product
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
                  onClick={() => handleSendMessage()}
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
                notified" / "I save a recipe and find it later by ingredient"
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
                    <div className="text-3xl">👨‍💻</div>
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
      {/* Split View: Chat + Visualization */}
      {showWorkspace && (
        <div className="flex-1 flex overflow-hidden">
          {/* Messages Container */}
          {!isEmptyState && (
            <div
              ref={chatScrollRef}
              className={`flex-1 overflow-y-auto px-6 py-8 pb-28 ${showVisualization ? "border-r border-neutral-700" : ""}`}
            >
              {/* Message list - always visible */}
              <div className="max-w-4xl mx-auto space-y-6">
                {messages.map((message) => {
                  console.log("[Message Render Debug]", {
                    id: message.id,
                    type: message.type,
                    typeCheck: message.type === "ai",
                    idCheck: message.id !== "streaming",
                    shouldShowButtons:
                      message.type === "ai" && message.id !== "streaming",
                  });
                  const isMapReady = mapReadyMessageId === message.id;
                  const isMapPendingFull =
                    mapPendingFullMessageId === message.id && fullMapPending;
                  const mapVerseCount =
                    message.visualBundle?.nodes?.length ?? 0;

                  return (
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
                          <div className="ml-[2.625rem]">
                            {message.content === "Thinking..." ? (
                              <div className="space-y-3 animate-pulse">
                                <div className="h-4 bg-neutral-700/50 rounded w-3/4"></div>
                                <div className="h-4 bg-neutral-700/50 rounded w-full"></div>
                                <div className="h-4 bg-neutral-700/50 rounded w-5/6"></div>
                              </div>
                            ) : (
                              <>
                                <MessageStream
                                  content={message.content}
                                  onVerseClick={handleVerseClick}
                                  onTrace={handleGoDeeper}
                                />
                                {/* Icons directly after message - AI messages only, not while streaming */}
                                {message.type === "ai" &&
                                  message.id !== "streaming" && (
                                    <div className="max-w-3xl mx-auto px-6 pt-2 flex gap-2">
                                      <button
                                        onClick={() =>
                                          handleTTS(message.id, message.content)
                                        }
                                        className={`p-1 rounded-md transition-colors ${
                                          playingMessageId === message.id
                                            ? "bg-blue-500/20 text-blue-400"
                                            : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60"
                                        }`}
                                        title={
                                          playingMessageId === message.id
                                            ? "Stop playback"
                                            : "Read aloud"
                                        }
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
                                            d={
                                              playingMessageId === message.id
                                                ? "M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10h6v4H9z"
                                                : "M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                            }
                                          />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() =>
                                          navigator.clipboard.writeText(
                                            message.content,
                                          )
                                        }
                                        className="p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60 transition-colors"
                                        title="Copy to clipboard"
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
                                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                          />
                                        </svg>
                                      </button>
                                      {!message.visualBundle &&
                                        message.suggestTrace &&
                                        message.tracePrompt &&
                                        onTrace && (
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() =>
                                                onTrace(message.tracePrompt!)
                                              }
                                              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60 transition-colors"
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
                                                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                                                />
                                              </svg>
                                              View Map
                                            </button>
                                            {typeof message.connectionCount ===
                                              "number" && (
                                              <span className="text-[11px] text-neutral-500">
                                                {message.connectionCount}{" "}
                                                connection
                                                {message.connectionCount === 1
                                                  ? ""
                                                  : "s"}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      {message.visualBundle && (
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => {
                                              if (onShowVisualization) {
                                                onShowVisualization(
                                                  message.visualBundle!,
                                                );
                                                resetHighlights();
                                              }
                                            }}
                                            className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                                              isMapReady
                                                ? "text-emerald-200 bg-emerald-500/10 ring-1 ring-emerald-400/40 animate-pulse"
                                                : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60"
                                            }`}
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
                                                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                                              />
                                            </svg>
                                            {isMapPendingFull
                                              ? "Loading full map"
                                              : "View Map"}
                                          </button>
                                          <span
                                            className={`text-[11px] ${
                                              isMapReady
                                                ? "text-emerald-200/90"
                                                : "text-neutral-500"
                                            }`}
                                          >
                                            {isMapPendingFull
                                              ? "Richer connections loading"
                                              : "Map ready"}{" "}
                                            - {mapVerseCount} verse
                                            {mapVerseCount === 1 ? "" : "s"}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Streaming message (renders progressively as content arrives) */}
                {streamingMessage &&
                  streamingMessage.content &&
                  !streamingMessage.isComplete && (
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
                        <MessageStream
                          content={streamingMessage.content}
                          onVerseClick={handleVerseClick}
                          onTrace={handleGoDeeper}
                        />
                        {mapPrepActive && (
                          <div className="inline-flex items-center gap-2 rounded-md border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100/90">
                            <svg
                              className="w-3.5 h-3.5 text-cyan-200/90"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                              />
                            </svg>
                            <span>Preparing map...</span>
                            {mapPrepCount !== null && mapPrepCount > 0 && (
                              <span className="text-cyan-100/70">
                                ({mapPrepCount} verses found)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

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
                    {mapPrepActive && (
                      <div className="ml-[2.625rem] inline-flex items-center gap-2 rounded-md border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100/90">
                        <svg
                          className="w-3.5 h-3.5 text-cyan-200/90"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                          />
                        </svg>
                        <span>Preparing map...</span>
                        {mapPrepCount !== null && mapPrepCount > 0 && (
                          <span className="text-cyan-100/70">
                            ({mapPrepCount} verses found)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Removed Plan Approval and Checkpoint Cards - micro-steps execute seamlessly now */}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* Genealogy Visualization Panel */}
          {visualizationPanel}
        </div>
      )}

      {/* Input Composer */}
      <div
        ref={composerRef}
        className={
          isEmptyState
            ? "flex-1 flex flex-col items-center justify-start px-6 pt-[22vh]"
            : "sticky bottom-0 px-6 py-4 bg-neutral-950/40 backdrop-blur-sm"
        }
      >
        <div
          className={
            isEmptyState ? "max-w-3xl w-full space-y-8" : "max-w-4xl mx-auto"
          }
        >
          {isEmptyState && (
            <div className="text-center mb-10">
              <h1 className="text-4xl font-medium text-neutral-100 tracking-tight">
                What would you like to examine?
              </h1>
            </div>
          )}
          <div className="relative flex gap-2 items-center bg-neutral-800/50 border border-neutral-700/50 rounded-2xl px-4 py-2.5 transition-all shadow-lg focus-within:ring-2 focus-within:ring-brand-primary-500/50 focus-within:border-brand-primary-500/50">
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
              <div className="absolute bottom-full left-0 mb-2 z-10 min-w-[220px] rounded-2xl border border-neutral-700/60 bg-neutral-900/95 shadow-2xl backdrop-blur-sm">
                <div className="p-2">
                  <button
                    onClick={() => {
                      setTraceModeEnabled((prev) => !prev);
                      setShowUploadButton(false);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800/80 flex items-center gap-3"
                    aria-pressed={traceModeEnabled}
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
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                      />
                    </svg>
                    <span>Trace mode</span>
                    {traceModeEnabled && (
                      <span className="ml-auto rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                        On
                      </span>
                    )}
                  </button>
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
              autoFocus={bibleStudyMode && isEmptyState}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!currentInput.trim() || isProcessing}
              className="btn-icon-ghost text-neutral-300 hover:text-neutral-100"
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
          {bibleStudyMode && isEmptyState && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {randomTopicsLoading && randomPericopes.length === 0 && (
                <div className="text-xs text-neutral-500">
                  Loading pericopes...
                </div>
              )}
              {!randomTopicsLoading &&
                randomPericopes.length > 0 &&
                ["random", "ot", "nt"].map((kind) => {
                  const topic = randomPericopes.find(
                    (entry) => entry.kind === kind,
                  );
                  if (!topic) return null;

                  const lensClass =
                    kind === "ot"
                      ? "text-amber-300/80 border-amber-500/30 bg-amber-500/10"
                      : kind === "nt"
                        ? "text-purple-300/80 border-purple-500/30 bg-purple-500/10"
                        : "text-slate-300/70 border-slate-500/20 bg-slate-500/5";
                  const label =
                    kind === "ot"
                      ? "Roots"
                      : kind === "nt"
                        ? "Thread"
                        : "Explore";
                  const titleText = topic.title || "Pericope";
                  const displayText = topic.displayText;
                  const titleAttr = topic.rangeRef
                    ? `${topic.title} (${topic.rangeRef})`
                    : topic.title;

                  return (
                    <button
                      key={topic.id}
                      onClick={() =>
                        sendPericopePrompt(
                          kind as "random" | "ot" | "nt",
                          displayText,
                          topic.promptText,
                        )
                      }
                      disabled={
                        Boolean(randomTopicLoading) ||
                        isProcessing ||
                        isStreaming
                      }
                      className={`group relative flex items-center gap-2 px-3 py-2 border transition-all duration-300 ${lensClass} bg-opacity-50 hover:bg-opacity-100 disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={titleAttr}
                    >
                      <svg
                        className="w-3 h-3 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      <span className="text-[10px] uppercase tracking-wider font-normal flex-shrink-0">
                        {label}
                      </span>
                      <span className="text-xs font-normal text-neutral-300 max-w-[220px] truncate">
                        {randomTopicLoading === kind ? "Sending..." : titleText}
                      </span>
                      <svg
                        className="w-2.5 h-2.5 flex-shrink-0 text-neutral-500 opacity-60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  );
                })}
            </div>
          )}
          {bibleStudyMode && !isEmptyState && (
            <div className="mt-3 flex items-center justify-center">
              <button
                onClick={resetBibleStudySession}
                disabled={isProcessing || isStreaming}
                className="group relative flex items-center gap-2 px-3 py-2 border transition-all duration-300 text-slate-300/70 border-slate-500/20 bg-slate-500/5 bg-opacity-50 hover:bg-opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Start a new Bible study session"
              >
                <svg
                  className="w-3 h-3 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 4v6h6M20 20v-6h-6"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20 10a8 8 0 00-14-5M4 14a8 8 0 0014 5"
                  />
                </svg>
                <span className="text-[10px] uppercase tracking-wider font-normal flex-shrink-0">
                  Session
                </span>
                <span className="text-xs font-normal whitespace-nowrap text-neutral-300">
                  New
                </span>
                <svg
                  className="w-2.5 h-2.5 flex-shrink-0 text-neutral-500 opacity-60"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Step Completion Modal */}

      {/* Text Highlight Tooltip */}
      <TextHighlightTooltip onGoDeeper={handleGoDeeper} userId="anonymous" />

      {/* Bookmark Panel */}
      {showBookmarkPanel && (
        <BookmarkPanel
          userId="anonymous"
          onClose={() => setShowBookmarkPanel(false)}
          onGoDeeper={onGoDeeper}
          onOpenMap={onShowVisualization}
        />
      )}
    </div>
  );
};

export default UnifiedWorkspace;
