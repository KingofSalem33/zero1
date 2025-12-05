/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import type { VisualContextBundle } from "../types/goldenThread";

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
}

export interface ErrorEvent {
  message: string;
}

export interface MapDataEvent {
  bundle: VisualContextBundle;
}

export interface StreamingMessage {
  content: string;
  isComplete: boolean;
  citations?: string[];
  activeTools: string[]; // Tools currently executing
  completedTools: string[]; // Tools that finished successfully
  erroredTools: string[]; // Tools that errored
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
    async (message: string, userId?: string, history?: unknown[]) => {
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
      });

      const abortController = new (window as any).AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch("http://localhost:3001/api/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            userId: userId || "anonymous",
            history: history || [],
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
            } else if (line.startsWith("data:")) {
              const data = line.slice(5).trim();
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);
                console.log(
                  "[Frontend SSE] Event:",
                  currentEvent,
                  "Data length:",
                  JSON.stringify(parsed).length,
                );
                console.log(
                  "[Frontend SSE] currentEvent value:",
                  JSON.stringify(currentEvent),
                );
                console.log(
                  "[Frontend SSE] currentEvent === 'content':",
                  currentEvent === "content",
                );

                console.log("[Frontend SSE] About to call setStreamingMessage");
                try {
                  flushSync(() => {
                    setStreamingMessage((prev) => {
                      console.log(
                        "[Frontend SSE] setStreamingMessage called, prev:",
                        prev,
                      );
                      if (!prev) {
                        console.log(
                          "[Frontend SSE] prev is null/undefined, returning",
                        );
                        return prev;
                      }

                      console.log(
                        "[Frontend SSE] About to enter switch with currentEvent:",
                        currentEvent,
                      );
                      switch (currentEvent) {
                        case "content": {
                          const contentEvent = parsed as ContentEvent;
                          console.log(
                            "[Frontend SSE] Content event:",
                            contentEvent,
                          );
                          console.log(
                            "[Frontend SSE] Delta:",
                            contentEvent.delta,
                          );
                          console.log(
                            "[Frontend SSE] Delta length:",
                            contentEvent.delta?.length,
                          );
                          console.log(
                            "[Frontend SSE] Prev content length:",
                            prev.content.length,
                          );
                          const newContent =
                            prev.content + (contentEvent.delta || "");
                          console.log(
                            "[Frontend SSE] New content length:",
                            newContent.length,
                          );
                          return {
                            ...prev,
                            content: newContent,
                          };
                        }

                        case "tool_call": {
                          const toolCallEvent = parsed as ToolCallEvent;
                          return {
                            ...prev,
                            activeTools: [
                              ...prev.activeTools,
                              toolCallEvent.tool,
                            ],
                          };
                        }

                        case "tool_result": {
                          const toolResultEvent = parsed as ToolResultEvent;
                          return {
                            ...prev,
                            activeTools: prev.activeTools.filter(
                              (t) => t !== toolResultEvent.tool,
                            ),
                            completedTools: [
                              ...prev.completedTools,
                              toolResultEvent.tool,
                            ],
                          };
                        }

                        case "tool_error": {
                          const toolErrorEvent = parsed as ToolErrorEvent;
                          return {
                            ...prev,
                            activeTools: prev.activeTools.filter(
                              (t) => t !== toolErrorEvent.tool,
                            ),
                            erroredTools: [
                              ...prev.erroredTools,
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
                          return prev;
                        }

                        case "done": {
                          const doneEvent = parsed as DoneEvent;
                          return {
                            ...prev,
                            isComplete: true,
                            citations: doneEvent.citations,
                          };
                        }

                        case "error": {
                          const errorEvent = parsed as ErrorEvent;
                          setError(errorEvent.message);
                          return prev;
                        }

                        default:
                          return prev;
                      }
                    });
                  });
                  console.log(
                    "[Frontend SSE] setStreamingMessage call completed",
                  );
                } catch (setStateError) {
                  console.error(
                    "[Frontend SSE] Error calling setStreamingMessage:",
                    setStateError,
                  );
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
