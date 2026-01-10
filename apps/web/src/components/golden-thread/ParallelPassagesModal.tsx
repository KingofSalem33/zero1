import React, { useRef, useEffect, useState } from "react";
import type { ParallelPassage, ThreadNode } from "../../types/goldenThread";

interface ParallelPassagesModalProps {
  primaryVerse: ThreadNode;
  position: { x: number; y: number };
  onClose: () => void;
  onNavigateToPassage?: (passage: ParallelPassage) => void;
}

/**
 * Get color class for similarity score
 * 95%+ = High confidence (bold)
 * 92-94% = Medium confidence (regular)
 */
function getSimilarityStyle(similarity: number) {
  if (similarity >= 0.95) {
    return {
      fontWeight: "font-semibold" as const,
      opacity: "opacity-100" as const,
    };
  } else if (similarity >= 0.93) {
    return {
      fontWeight: "font-normal" as const,
      opacity: "opacity-100" as const,
    };
  } else {
    return {
      fontWeight: "font-normal" as const,
      opacity: "opacity-70" as const,
    };
  }
}

export function ParallelPassagesModal({
  primaryVerse,
  position,
  onClose,
  onNavigateToPassage,
}: ParallelPassagesModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position to keep modal within viewport
  useEffect(() => {
    if (!modalRef.current) return;

    const modalRect = modalRef.current.getBoundingClientRect();
    const modalWidth = modalRect.width || 400;

    let newX = position.x;
    let newY = position.y;

    // Keep within horizontal bounds
    if (newX + modalWidth > window.innerWidth) {
      newX = window.innerWidth - modalWidth - 20;
    }
    if (newX < 20) {
      newX = 20;
    }

    // Keep within vertical bounds
    if (newY < 20) {
      newY = 20;
    }

    setAdjustedPosition({ x: newX, y: newY });
  }, [position]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: Event) => {
      if ((e as { key?: string }).key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const primaryKey = `${primaryVerse.book_abbrev}:${primaryVerse.chapter}:${primaryVerse.verse}`;
  const seenParallelKeys = new Set<string>();
  const parallels = (primaryVerse.parallelPassages || []).filter((parallel) => {
    const key = `${parallel.book_abbrev}:${parallel.chapter}:${parallel.verse}`;
    if (key === primaryKey) return false;
    if (seenParallelKeys.has(key)) return false;
    seenParallelKeys.add(key);
    return true;
  });
  if (parallels.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="fixed z-50 bg-white dark:bg-neutral-900 rounded-lg shadow-2xl border border-neutral-200 dark:border-neutral-700 max-w-md w-full"
        style={{
          left: `${adjustedPosition.x}px`,
          top: `${adjustedPosition.y}px`,
          maxHeight: "calc(100vh - 100px)",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              Parallel Accounts
            </div>
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-0.5">
              {primaryVerse.book_name} {primaryVerse.chapter}:
              {primaryVerse.verse}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
            aria-label="Close"
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

        {/* Primary Verse */}
        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
              Primary
            </span>
          </div>
          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
            {primaryVerse.text}
          </p>
        </div>

        {/* Parallel Passages List */}
        <div className="p-4 space-y-2">
          <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
            Also Found In
          </div>
          {parallels.map((parallel) => {
            const style = getSimilarityStyle(parallel.similarity);
            return (
              <button
                key={parallel.id}
                onClick={() => onNavigateToPassage?.(parallel)}
                className={`w-full text-left p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${style.opacity}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-sm ${style.fontWeight} text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5`}
                  >
                    <span className="text-base">📖</span>
                    {parallel.reference}
                  </span>
                  <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500">
                    {Math.round(parallel.similarity * 100)}%
                  </span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                  {parallel.text}
                </p>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400">
          Click a passage to view in Bible reader • ESC to close
        </div>
      </div>
    </>
  );
}
