import { useEffect, useRef, useCallback } from "react";

/**
 * Custom hook to remember and restore scroll position for a scrollable container.
 * Persists scroll position to localStorage and restores it when the component mounts.
 *
 * @param key - Unique key for localStorage (e.g., "bible-scroll", "chat-scroll")
 * @param dependencies - Array of dependencies that should reset scroll (e.g., [chatId])
 * @param options - Configuration options
 * @returns ref to attach to the scrollable container
 */
export function useScrollMemory<T extends HTMLElement = HTMLDivElement>(
  key: string,
  dependencies: unknown[] = [],
  options: {
    /** Delay in ms before saving scroll position (debounce). Default: 150 */
    debounceMs?: number;
    /** Whether to restore scroll on mount. Default: true */
    restoreOnMount?: boolean;
  } = {},
) {
  const { debounceMs = 150, restoreOnMount = true } = options;

  const scrollRef = useRef<T>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRestoringRef = useRef(false);

  // Build the full storage key including dependencies
  const storageKey = `scroll-memory:${key}:${dependencies.map(String).join(":")}`;

  // Save scroll position (debounced)
  const saveScrollPosition = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (scrollRef.current && !isRestoringRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        // Also save the scroll percentage for cases where content height changes
        const scrollPercentage =
          scrollHeight > clientHeight
            ? scrollTop / (scrollHeight - clientHeight)
            : 0;

        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              scrollTop,
              scrollPercentage,
              timestamp: Date.now(),
            }),
          );
        } catch {
          // localStorage might be full or disabled
        }
      }
    }, debounceMs);
  }, [storageKey, debounceMs]);

  // Restore scroll position (can be called manually via restoreNow or automatically on mount)
  const restoreScrollPosition = useCallback(
    (forceRestore = false) => {
      if (!scrollRef.current) return;

      // Skip if not restoring on mount and not forced
      if (!restoreOnMount && !forceRestore) return;

      try {
        const saved = localStorage.getItem(storageKey);
        if (!saved) return;

        const { scrollTop, scrollPercentage, timestamp } = JSON.parse(saved);

        // Don't restore if saved more than 24 hours ago
        if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
          localStorage.removeItem(storageKey);
          return;
        }

        isRestoringRef.current = true;

        const { scrollHeight, clientHeight } = scrollRef.current;
        const maxScroll = scrollHeight - clientHeight;

        // Try to use saved scrollTop, but fall back to percentage if content changed
        let targetScroll = scrollTop;
        if (targetScroll > maxScroll) {
          targetScroll = maxScroll * scrollPercentage;
        }

        // Apply scroll immediately (no requestAnimationFrame to avoid flash)
        scrollRef.current.scrollTop = Math.max(0, targetScroll);

        // Allow saving again after a short delay
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 100);
      } catch {
        // Ignore errors
      }
    },
    [storageKey, restoreOnMount],
  );

  // Attach scroll listener
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener("scroll", saveScrollPosition, { passive: true });

    return () => {
      element.removeEventListener("scroll", saveScrollPosition);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [saveScrollPosition]);

  // Restore on mount and when dependencies change
  useEffect(() => {
    // Small delay to ensure content is rendered
    const timer = setTimeout(restoreScrollPosition, 50);
    return () => clearTimeout(timer);
  }, [restoreScrollPosition, ...dependencies]);

  // Clear saved position (useful when navigating to a specific item)
  const clearSavedPosition = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore errors
    }
  }, [storageKey]);

  // Manually save current position (useful before navigation)
  const saveNow = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (scrollRef.current && !isRestoringRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const scrollPercentage =
        scrollHeight > clientHeight
          ? scrollTop / (scrollHeight - clientHeight)
          : 0;

      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            scrollTop,
            scrollPercentage,
            timestamp: Date.now(),
          }),
        );
      } catch {
        // Ignore errors
      }
    }
  }, [storageKey]);

  // Manually trigger scroll restoration (useful after content loads)
  const restoreNow = useCallback(() => {
    restoreScrollPosition(true); // Force restore even if restoreOnMount is false
  }, [restoreScrollPosition]);

  return {
    scrollRef,
    clearSavedPosition,
    saveNow,
    restoreNow,
  };
}

/**
 * Hook specifically for Bible scroll memory.
 * Remembers scroll position per book+chapter combination.
 * Note: restoreOnMount is false because Bible content loads async,
 * so the component manually calls restoreNow() after loading.
 */
export function useBibleScrollMemory(book: string, chapter: number) {
  return useScrollMemory("bible", [book, chapter], {
    debounceMs: 200,
    restoreOnMount: false, // We restore manually after content loads
  });
}

/**
 * Hook specifically for chat scroll memory.
 * Remembers scroll position per chat ID.
 */
export function useChatScrollMemory(chatId: string | null) {
  return useScrollMemory("chat", [chatId || "default"], {
    debounceMs: 150,
  });
}

/**
 * Hook specifically for library scroll memory.
 * Remembers scroll position per tab.
 */
export function useLibraryScrollMemory(tab: string) {
  return useScrollMemory("library", [tab], {
    debounceMs: 150,
  });
}
