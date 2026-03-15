import { WEB_ENV } from "../lib/env";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useRef, useEffect } from "react";
import {
  isChainData,
  type ChainData,
  type VisualContextBundle,
} from "../types/goldenThread";

const API_URL = WEB_ENV.API_URL;

export interface ToolCallEvent {
  tool: string;
  args: unknown;
}

export interface ToolResultEvent {
  tool: string;
  result: unknown;
}

export interface ToolErrorEvent {
  tool: string;
  error: string;
}

export interface ContentEvent {
  delta: string;
}

export interface DoneEvent {
  citations: string[];
  suggestTrace?: boolean;
  connectionCount?: number;
  anchorId?: number;
}

export interface ErrorEvent {
  message: string;
}

export interface MapDataEvent {
  bundle: VisualContextBundle;
}

export interface VerseSearchEvent {
  verse: string;
}

export interface StreamingMessage {
  content: string;
  isComplete: boolean;
  citations?: string[];
  suggestTrace?: boolean;
  connectionCount?: number;
  anchorId?: number;
  activeTools: string[]; // Tools currently executing
  completedTools: string[]; // Tools that finished successfully
  erroredTools: string[]; // Tools that errored
  searchingVerses: string[]; // Verses being explored during search
  chainData?: ChainData;
}

const MIN_CHARS_PER_FRAME = 12;
const MAX_CHARS_PER_FRAME = 48;

const resolveCharsPerFrame = (remainingChars: number) =>
  Math.min(
    remainingChars,
    Math.min(
      MAX_CHARS_PER_FRAME,
      Math.max(MIN_CHARS_PER_FRAME, Math.ceil(remainingChars / 6)),
    ),
  );

export function useChatStream(
  onMapData?: (bundle: VisualContextBundle) => void,
) {
  const [streamingMessage, setStreamingMessage] =
    useState<StreamingMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<any>(null);

  // Delta buffering for smooth text release
  const deltaBufferRef = useRef<string>("");
  const displayedContentRef = useRef<string>("");
  const rafRef = useRef<number>(0);
  const isAnimatingRef = useRef(false);

  // Animation loop - drains buffer at steady pace
  const animateText = useCallback(() => {
    const buffer = deltaBufferRef.current;
    const displayed = displayedContentRef.current;

    if (buffer.length > displayed.length) {
      // Release next chunk of characters
      const charsToAdd = resolveCharsPerFrame(buffer.length - displayed.length);
      const newContent = buffer.slice(0, displayed.length + charsToAdd);
      displayedContentRef.current = newContent;

      setStreamingMessage((prev) => {
        if (!prev) return prev;
        return { ...prev, content: newContent };
      });

      rafRef.current = window.requestAnimationFrame(animateText);
    } else {
      isAnimatingRef.current = false;
    }
  }, []);

  // Start animation if not running
  const ensureAnimating = useCallback(() => {
    if (!isAnimatingRef.current) {
      isAnimatingRef.current = true;
      rafRef.current = window.requestAnimationFrame(animateText);
    }
  }, [animateText]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const startStream = useCallback(
    async (
      message: string,
      userId?: string,
      history?: unknown[],
      promptMode?: string,
      visualBundle?: unknown,
      mapSession?: unknown,
      mapMode?: "fast" | "full",
      endpoint?: string,
    ) => {
      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Reset state and buffers
      deltaBufferRef.current = "";
      displayedContentRef.current = "";
      isAnimatingRef.current = false;
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }

      setIsStreaming(true);
      setError(null);
      setStreamingMessage({
        content: "",
        isComplete: false,
        activeTools: [],
        completedTools: [],
        erroredTools: [],
        searchingVerses: [],
      });

      const abortController = new (window as any).AbortController();
      abortControllerRef.current = abortController;

      try {
        const targetUrl = endpoint || `${API_URL}/api/chat/stream`;
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            userId: userId || "anonymous",
            history: history || [],
            ...(promptMode ? { promptMode } : {}),
            ...(visualBundle ? { visualBundle } : {}),
            ...(mapSession ? { mapSession } : {}),
            ...(mapMode ? { mapMode } : {}),
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new (window as any).TextDecoder();
        let buffer = "";
        let currentEvent = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line === "") {
              currentEvent = "";
              continue;
            }
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              const data = line.slice(5).trim();
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);
                const eventType = currentEvent;

                if (eventType === "content") {
                  // Buffer the delta instead of immediate update
                  const contentEvent = parsed as ContentEvent;
                  deltaBufferRef.current += contentEvent.delta || "";
                  ensureAnimating();
                } else if (eventType === "done") {
                  // Handle done outside setState to properly manage refs
                  const doneEvent = parsed as DoneEvent;

                  // Stop animation
                  if (rafRef.current) {
                    window.cancelAnimationFrame(rafRef.current);
                    rafRef.current = 0;
                  }
                  isAnimatingRef.current = false;

                  // Capture final content from buffer
                  const finalContent = deltaBufferRef.current;
                  displayedContentRef.current = finalContent;

                  setStreamingMessage((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      content: finalContent,
                      isComplete: true,
                      citations: doneEvent.citations,
                      suggestTrace: doneEvent.suggestTrace,
                      connectionCount: doneEvent.connectionCount,
                      anchorId: doneEvent.anchorId,
                      chainData: prev.chainData,
                    };
                  });
                } else {
                  setStreamingMessage((prev) => {
                    const currentState = prev || {
                      content: "",
                      isComplete: false,
                      activeTools: [],
                      completedTools: [],
                      erroredTools: [],
                      searchingVerses: [],
                    };

                    switch (eventType) {
                      case "verse_search": {
                        const verseEvent = parsed as VerseSearchEvent;
                        return {
                          ...currentState,
                          searchingVerses: [
                            ...currentState.searchingVerses,
                            verseEvent.verse,
                          ],
                        };
                      }

                      case "tool_call": {
                        const toolCallEvent = parsed as ToolCallEvent;
                        return {
                          ...currentState,
                          activeTools: [
                            ...currentState.activeTools,
                            toolCallEvent.tool,
                          ],
                        };
                      }

                      case "tool_result": {
                        const toolResultEvent = parsed as ToolResultEvent;
                        return {
                          ...currentState,
                          activeTools: currentState.activeTools.filter(
                            (t) => t !== toolResultEvent.tool,
                          ),
                          completedTools: [
                            ...currentState.completedTools,
                            toolResultEvent.tool,
                          ],
                        };
                      }

                      case "tool_error": {
                        const toolErrorEvent = parsed as ToolErrorEvent;
                        return {
                          ...currentState,
                          activeTools: currentState.activeTools.filter(
                            (t) => t !== toolErrorEvent.tool,
                          ),
                          erroredTools: [
                            ...currentState.erroredTools,
                            toolErrorEvent.tool,
                          ],
                        };
                      }

                      case "map_data": {
                        const mapDataEvent = parsed as VisualContextBundle;
                        if (onMapData) {
                          onMapData(mapDataEvent);
                        }
                        return currentState;
                      }

                      case "chain_data": {
                        if (!isChainData(parsed)) {
                          return currentState;
                        }
                        return {
                          ...currentState,
                          chainData: parsed,
                        };
                      }

                      case "error": {
                        const errorEvent = parsed as ErrorEvent;
                        setError(errorEvent.message);
                        return currentState;
                      }

                      default:
                        return currentState;
                    }
                  });
                }
              } catch (parseError) {
                console.error("Failed to parse SSE data:", parseError);
              }
            }
          }
        }

        setIsStreaming(false);
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === "AbortError") {
            console.log("Stream cancelled");
          } else {
            setError(err.message);
          }
        } else {
          setError("Unknown streaming error");
        }
        setIsStreaming(false);
      }
    },
    [onMapData, ensureAnimating],
  );

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
    }
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    deltaBufferRef.current = "";
    displayedContentRef.current = "";
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
    }
    setStreamingMessage(null);
    setError(null);
    setIsStreaming(false);
  }, []);

  return {
    streamingMessage,
    isStreaming,
    error,
    startStream,
    cancelStream,
    reset,
  };
}
