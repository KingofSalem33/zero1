import { useEffect, useRef, useCallback, type RefObject } from "react";

/**
 * Focus trap hook for modals and dialogs.
 * Traps focus within a container, auto-focuses first element,
 * and restores focus on close.
 *
 * @param isOpen - Whether the modal is open
 * @param options - Configuration options
 * @returns ref to attach to the modal container
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  options: {
    /** Called when ESC is pressed. If not provided, ESC does nothing. */
    onEscape?: () => void;
    /** Whether to auto-focus first focusable element. Default: true */
    autoFocus?: boolean;
    /** Whether to restore focus on close. Default: true */
    restoreFocus?: boolean;
    /** Initial element to focus (selector or ref). Default: first focusable */
    initialFocus?: string | RefObject<HTMLElement>;
  } = {},
) {
  const {
    onEscape,
    autoFocus = true,
    restoreFocus = true,
    initialFocus,
  } = options;

  const containerRef = useRef<T>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Get all focusable elements within container
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];

    const selector = [
      'button:not([disabled]):not([tabindex="-1"])',
      'a[href]:not([tabindex="-1"])',
      'input:not([disabled]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"]):not([disabled])',
    ].join(", ");

    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(selector),
    ).filter((el) => el.offsetParent !== null); // Filter out hidden elements
  }, []);

  // Handle keydown for tab trapping and escape
  const handleKeyDown = useCallback(
    (event: globalThis.KeyboardEvent) => {
      if (!containerRef.current) return;

      // Handle Escape
      if (event.key === "Escape" && onEscape) {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
        return;
      }

      // Handle Tab for focus trapping
      if (event.key === "Tab") {
        const focusable = getFocusableElements();
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          // Shift+Tab: if on first, go to last
          if (active === first || !containerRef.current.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          // Tab: if on last, go to first
          if (active === last || !containerRef.current.contains(active)) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    },
    [getFocusableElements, onEscape],
  );

  // Set up focus trap when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Store the currently focused element to restore later
    if (restoreFocus) {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }

    // Auto-focus initial element
    if (autoFocus) {
      // Small delay to ensure modal is rendered
      const focusTimer = setTimeout(() => {
        if (!containerRef.current) return;

        let elementToFocus: HTMLElement | null = null;

        // Check for custom initial focus
        if (initialFocus) {
          if (typeof initialFocus === "string") {
            elementToFocus = containerRef.current.querySelector(initialFocus);
          } else if (initialFocus.current) {
            elementToFocus = initialFocus.current;
          }
        }

        // Fall back to first focusable element
        if (!elementToFocus) {
          const focusable = getFocusableElements();
          elementToFocus = focusable[0] || containerRef.current;
        }

        elementToFocus?.focus();
      }, 0);

      return () => clearTimeout(focusTimer);
    }
  }, [isOpen, autoFocus, initialFocus, restoreFocus, getFocusableElements]);

  // Add keyboard event listener
  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, handleKeyDown]);

  // Restore focus when modal closes
  useEffect(() => {
    if (isOpen) return;

    if (restoreFocus && previousActiveElement.current) {
      // Small delay to ensure modal is fully closed
      const restoreTimer = setTimeout(() => {
        previousActiveElement.current?.focus();
        previousActiveElement.current = null;
      }, 0);

      return () => clearTimeout(restoreTimer);
    }
  }, [isOpen, restoreFocus]);

  return containerRef;
}

/**
 * Simpler hook that just provides the escape handler.
 * Use when you only need ESC to close, not full focus trapping.
 */
export function useEscapeKey(isOpen: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onEscape]);
}
