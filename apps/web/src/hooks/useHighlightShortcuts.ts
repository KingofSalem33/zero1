import { useEffect, useCallback } from "react";
import { HIGHLIGHT_COLORS } from "../contexts/BibleHighlightsContext";

interface UseHighlightShortcutsOptions {
  /** Called when user presses a highlight shortcut (Ctrl+1..5 for colors) */
  onHighlight?: (
    text: string,
    color: string,
    context?: { range?: Range },
  ) => void;
  /** Whether highlighting is enabled */
  enabled?: boolean;
}

/**
 * Keyboard shortcuts for highlight operations in the Bible reader.
 *
 * - Ctrl+1..5: Highlight selected text with color 1-5
 * - Escape: Clear text selection
 */
export function useHighlightShortcuts({
  onHighlight,
  enabled = true,
}: UseHighlightShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Ctrl+1..5 — highlight with color
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= HIGHLIGHT_COLORS.length) {
          const selection = window.getSelection();
          const text = selection?.toString().trim();
          if (
            text &&
            text.length > 0 &&
            selection &&
            selection.rangeCount > 0
          ) {
            e.preventDefault();
            const range = selection.getRangeAt(0);
            const color = HIGHLIGHT_COLORS[num - 1].value;
            onHighlight?.(text, color, { range });
          }
        }
      }

      // Escape — clear selection
      if (e.key === "Escape") {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          selection.removeAllRanges();
        }
      }
    },
    [onHighlight, enabled],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
