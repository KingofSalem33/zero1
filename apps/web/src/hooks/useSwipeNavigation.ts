import { useRef, useEffect, useCallback, type RefObject } from "react";

interface SwipeConfig {
  /** Minimum distance in pixels to trigger swipe. Default: 50 */
  threshold?: number;
  /** Maximum time in ms for swipe gesture. Default: 300 */
  maxTime?: number;
  /** Callback when user swipes left (next) */
  onSwipeLeft?: () => void;
  /** Callback when user swipes right (previous) */
  onSwipeRight?: () => void;
  /** Whether swipe is enabled. Default: true */
  enabled?: boolean;
}

/**
 * Hook for detecting horizontal swipe gestures on touch devices.
 * Returns a ref to attach to the swipeable container.
 */
export function useSwipeNavigation<T extends HTMLElement = HTMLDivElement>(
  config: SwipeConfig,
) {
  const {
    threshold = 50,
    maxTime = 300,
    onSwipeLeft,
    onSwipeRight,
    enabled = true,
  } = config;

  const containerRef = useRef<T>(null);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const handleTouchStart = useCallback(
    (e: globalThis.TouchEvent) => {
      if (!enabled) return;

      const touch = e.touches[0];
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    },
    [enabled],
  );

  const handleTouchEnd = useCallback(
    (e: globalThis.TouchEvent) => {
      if (!enabled || !touchStart.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStart.current.x;
      const deltaY = touch.clientY - touchStart.current.y;
      const deltaTime = Date.now() - touchStart.current.time;

      // Reset
      touchStart.current = null;

      // Don't swipe if user has an active text selection
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) return;

      // Check if it's a horizontal swipe (not vertical scroll)
      // Horizontal movement should be at least 1.5x vertical to avoid diagonal scrolls
      if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

      // Check threshold and timing
      if (Math.abs(deltaX) < threshold) return;
      if (deltaTime > maxTime) return;

      // Determine direction
      if (deltaX > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    },
    [enabled, threshold, maxTime, onSwipeLeft, onSwipeRight],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !enabled) return;

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchEnd]);

  return containerRef;
}

/**
 * Hook for keyboard arrow navigation.
 * Listens for left/right arrow keys when the container is focused or globally.
 */
export function useKeyboardNavigation(config: {
  onPrevious?: () => void;
  onNext?: () => void;
  /** If true, only works when an element inside container has focus. Default: false (global) */
  requireFocus?: boolean;
  /** Ref to the container for focus checking */
  containerRef?: RefObject<HTMLElement>;
  /** Whether keyboard nav is enabled. Default: true */
  enabled?: boolean;
}) {
  const {
    onPrevious,
    onNext,
    requireFocus = false,
    containerRef,
    enabled = true,
  } = config;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        target.isContentEditable
      ) {
        return;
      }

      // Check focus requirement
      if (requireFocus && containerRef?.current) {
        if (!containerRef.current.contains(document.activeElement)) {
          return;
        }
      }

      if (e.key === "ArrowLeft" && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onPrevious, onNext, requireFocus, containerRef]);
}
