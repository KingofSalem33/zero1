/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import type { VisualContextBundle } from "../types/goldenThread";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

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
}

export function useChatStream(
  onMapData?: (bundle: VisualContextBundle) => void,
) {
  const [streamingMessage, setStreamingMessage] =
    useState<StreamingMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<any>(null);

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

      // Reset state
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
        let currentEvent = ""; // Persist event type across chunks

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            // Reset currentEvent on blank line (end of SSE message)
            if (line === "") {
              currentEvent = "";
              continue;
            }
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
              console.log("[useChatStream] Event line:", currentEvent);
            } else if (line.startsWith("data:")) {
              const data = line.slice(5).trim();
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);
                console.log(
                  "[useChatStream] Processing event:",
                  currentEvent,
                  "data:",
                  parsed,
                );

                // Capture event type before async operations (prevents currentEvent from being reset by blank lines)
                const eventType = currentEvent;

                // Use flushSync only for content to prevent text corruption
                // while allowing other updates to batch
                if (eventType === "content") {
                  flushSync(() => {
                    setStreamingMessage((prev) => {
                      if (!prev) return prev;
                      const contentEvent = parsed as ContentEvent;
                      return {
                        ...prev,
                        content: prev.content + (contentEvent.delta || ""),
                      };
                    });
                  });
                } else {
                  setStreamingMessage((prev) => {
                    // Initialize prev if null (defensive)
                    const currentState = prev || {
                      content: "",
                      isComplete: false,
                      activeTools: [],
                      completedTools: [],
                      erroredTools: [],
                      searchingVerses: [],
                    };

                    console.log(
                      "[useChatStream] About to switch on event:",
                      eventType,
                      "currentState:",
                      currentState,
                    );

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
                        // Handle Golden Thread visualization data
                        const mapDataEvent = parsed as VisualContextBundle;
                        if (onMapData) {
                          onMapData(mapDataEvent);
                        }
                        return currentState;
                      }

                      case "done": {
                        const doneEvent = parsed as DoneEvent;
                        console.log(
                          "[useChatStream] 🎉 DONE event received, setting isComplete=true",
                        );
                        return {
                          ...currentState,
                          isComplete: true,
                          citations: doneEvent.citations,
                          suggestTrace: doneEvent.suggestTrace,
                          connectionCount: doneEvent.connectionCount,
                          anchorId: doneEvent.anchorId,
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
            // Stream was intentionally cancelled
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
    [onMapData],
  );

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
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
