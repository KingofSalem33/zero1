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
  }

  return {
    fontWeight: "font-normal" as const,
    opacity: "opacity-70" as const,
  };
}

const normalizeToken = (value: string) =>
  value.toLowerCase().replace(/\s+/g, "");

const makeVerseKey = (book: string, chapter: number, verse: number) =>
  `${normalizeToken(book)}:${chapter}:${verse}`;

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
    const modalWidth = modalRect.width || 320;

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

  const primaryBook = primaryVerse.book_name || primaryVerse.book_abbrev;
  const primaryKey = makeVerseKey(
    primaryBook,
    primaryVerse.chapter,
    primaryVerse.verse,
  );
  const primaryTokens = [primaryVerse.book_name, primaryVerse.book_abbrev]
    .filter(Boolean)
    .map((value) => normalizeToken(value as string));
  const seenParallelKeys = new Set<string>();
  const isSameReference = (reference?: string) => {
    if (!reference) return false;
    const ref = normalizeToken(reference);
    const verseToken = `${primaryVerse.chapter}:${primaryVerse.verse}`;
    if (!ref.includes(verseToken)) return false;
    return primaryTokens.some((token) => ref.includes(token));
  };
  const parallels = (primaryVerse.parallelPassages || []).filter((parallel) => {
    if (parallel.id === primaryVerse.id) return false;
    if (isSameReference(parallel.reference)) return false;
    const parallelBook = parallel.book_name || parallel.book_abbrev || "";
    const key = makeVerseKey(parallelBook, parallel.chapter, parallel.verse);
    if (key === primaryKey) return false;
    if (seenParallelKeys.has(key)) return false;
    seenParallelKeys.add(key);
    return true;
  });
  if (parallels.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/10 z-40" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="fixed z-50 w-[280px] sm:w-[320px] max-w-[90vw] rounded-lg border border-white/10 bg-neutral-900/95 shadow-xl backdrop-blur"
        style={{
          left: `${adjustedPosition.x}px`,
          top: `${adjustedPosition.y}px`,
          maxHeight: "calc(100vh - 140px)",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 border-b border-white/10 px-3 py-2 flex items-center justify-between bg-neutral-900/95">
          <div>
            <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide">
              Parallel Accounts
            </div>
            <div className="text-xs font-medium text-neutral-200 mt-0.5">
              {primaryVerse.book_name} {primaryVerse.chapter}:
              {primaryVerse.verse}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-4 h-4"
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
        <div className="px-3 py-2 border-b border-white/10">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">
            Primary
          </div>
          <p className="text-[11px] text-neutral-300 leading-relaxed line-clamp-2">
            {primaryVerse.text}
          </p>
        </div>

        {/* Parallel Passages List */}
        <div className="px-3 py-2 space-y-2">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-2">
            Also Found In
          </div>
          {parallels.map((parallel) => {
            const style = getSimilarityStyle(parallel.similarity);
            return (
              <button
                key={parallel.id}
                onClick={() => onNavigateToPassage?.(parallel)}
                className={`w-full text-left px-2.5 py-2 rounded-md border border-white/10 hover:border-white/20 hover:bg-white/5 transition-colors ${style.opacity}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[12px] ${style.fontWeight} text-neutral-100`}
                  >
                    {parallel.reference}
                  </span>
                  <span className="font-mono text-[10px] text-neutral-500">
                    {Math.round(parallel.similarity * 100)}%
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 line-clamp-1 leading-relaxed">
                  {parallel.text}
                </p>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 border-t border-white/10 text-[10px] text-neutral-500">
          Click a passage to open. ESC to close.
        </div>
      </div>
    </>
  );
}
