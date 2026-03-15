import { WEB_ENV } from "../lib/env";
/**
 * useAIRequest â€” manages abort controller lifecycle for AI API calls.
 * Automatically aborts in-flight requests when a new one starts or on unmount.
 */

import { useRef, useCallback, useEffect } from "react";

const API_URL = WEB_ENV.API_URL;

interface AIRequestOptions {
  /** API endpoint path (e.g., "/api/synopsis") */
  endpoint: string;
  /** Request body */
  body: Record<string, unknown>;
  /** Called on success with parsed JSON data */
  onSuccess: (data: Record<string, unknown>) => void;
  /** Called on error with a user-facing message */
  onError: (message: string) => void;
  /** Optional SSE callbacks for endpoints that support streamed text. */
  stream?: {
    onContent?: (delta: string, fullText: string) => void;
  };
}

export function useAIRequest() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const execute = useCallback(async (options: AIRequestOptions) => {
    const { endpoint, body, onSuccess, onError, stream } = options;

    // Abort any in-flight request
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentRequestId = ++requestIdRef.current;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(stream ? { Accept: "text/event-stream" } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Stale response check
      if (currentRequestId !== requestIdRef.current) return;

      if (!response.ok) {
        await response.text();
        const message =
          response.status === 429
            ? "Unavailable (quota exceeded)."
            : `Request failed (${response.status}).`;
        onError(message);
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      if (stream && contentType.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new window.TextDecoder();
        let buffer = "";
        let currentEvent = "";
        let fullText = "";
        let donePayload: Record<string, unknown> | null = null;
        let streamError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) {
              currentEvent = "";
              continue;
            }
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
              continue;
            }
            if (!line.startsWith("data:")) {
              continue;
            }

            const json = line.slice(5).trim();
            if (!json) continue;

            try {
              const parsed = JSON.parse(json) as Record<string, unknown>;
              if (currentEvent === "content") {
                const delta =
                  typeof parsed.delta === "string" ? parsed.delta : "";
                if (delta) {
                  fullText += delta;
                  stream.onContent?.(delta, fullText);
                }
              } else if (currentEvent === "done") {
                donePayload = parsed;
              } else if (currentEvent === "error") {
                streamError =
                  typeof parsed.message === "string"
                    ? parsed.message
                    : "Unavailable right now.";
              }
            } catch {
              // Ignore malformed SSE payloads and continue streaming.
            }
          }
        }

        if (currentRequestId !== requestIdRef.current) return;

        if (donePayload) {
          onSuccess(donePayload);
          return;
        }

        if (streamError) {
          onError(streamError);
          return;
        }

        if (fullText.trim()) {
          onSuccess({ text: fullText, synopsis: fullText });
          return;
        }

        throw new Error("Streaming response ended before completion");
      }

      const data = await response.json();

      // Stale response check again after parsing
      if (currentRequestId !== requestIdRef.current) return;

      onSuccess(data);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        if (timedOut) {
          onError("Request timed out. Please try again.");
        }
        return;
      }
      onError("Unavailable right now.");
    } finally {
      window.clearTimeout(timeoutId);
      if (currentRequestId === requestIdRef.current) {
        abortControllerRef.current = null;
      }
    }
  }, []);

  return { execute, abort };
}
