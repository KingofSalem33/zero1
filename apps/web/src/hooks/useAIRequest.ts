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
    const { endpoint, body, onSuccess, onError } = options;

    // Abort any in-flight request
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentRequestId = ++requestIdRef.current;

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      const data = await response.json();

      // Stale response check again after parsing
      if (currentRequestId !== requestIdRef.current) return;

      onSuccess(data);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      onError("Unavailable right now.");
    } finally {
      if (currentRequestId === requestIdRef.current) {
        abortControllerRef.current = null;
      }
    }
  }, []);

  return { execute, abort };
}


