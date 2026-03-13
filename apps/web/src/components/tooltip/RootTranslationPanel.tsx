/**
 * RootTranslationPanel — shared ROOT translation view with word mapping,
 * Strong's definitions, and Lost in Translation pager.
 * Used by both TextHighlightTooltip and VerseTooltip.
 */

import React, { useMemo, useState, useRef, useEffect } from "react";
import { LoadingDots } from "./LoadingDots";
import type { RootWord } from "../../types/tooltip";
import {
  chunkLostContext,
  LOST_CONTEXT_MAX_WORDS,
  LOST_CONTEXT_MAX_SENTENCES,
} from "../../utils/lostContextChunker";

interface RootTranslationPanelProps {
  isLoading: boolean;
  language: string;
  words: RootWord[];
  lostContext: string;
  fallbackText: string;
  selectedWordIndex: number | null;
  onSelectWord: (index: number | null) => void;
  onBack: () => void;
  backLabel?: string;
}

export const RootTranslationPanel: React.FC<RootTranslationPanelProps> = ({
  isLoading,
  language,
  words,
  lostContext,
  fallbackText,
  selectedWordIndex,
  onSelectWord,
  onBack,
  backLabel = "Back to synopsis",
}) => {
  const [lostContextPage, setLostContextPage] = useState(0);
  const lostContextTouchStartRef = useRef<number | null>(null);

  const lostContextChunks = useMemo(
    () =>
      chunkLostContext(
        lostContext,
        LOST_CONTEXT_MAX_WORDS,
        LOST_CONTEXT_MAX_SENTENCES,
      ),
    [lostContext],
  );
  const lostContextTotal = lostContextChunks.length;
  const lostContextCurrent = lostContextChunks[lostContextPage] || lostContext;
  const canPrevLostContext = lostContextPage > 0;
  const canNextLostContext = lostContextPage < lostContextTotal - 1;

  // Reset page when content changes
  useEffect(() => {
    setLostContextPage(0);
  }, [lostContext]);

  return (
    <div className="space-y-3">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        <span>{backLabel}</span>
      </button>

      {isLoading ? (
        <LoadingDots
          label={`Translating from original ${language || "Hebrew/Greek"}...`}
        />
      ) : words.length > 0 || lostContext ? (
        <div className="space-y-3">
          {/* Word mapping */}
          {words.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-[13px] text-neutral-200 leading-relaxed">
                {words.map((word, index) => {
                  const isSelected = selectedWordIndex === index;
                  const isClickable = Boolean(word.strongs);
                  const originalLabel = word.original
                    ? `(${word.original})`
                    : "";

                  return (
                    <span
                      key={`${word.english}-${word.strongs || index}`}
                      className="whitespace-nowrap"
                    >
                      <span className="text-neutral-200">{word.english}</span>{" "}
                      {isClickable ? (
                        <button
                          type="button"
                          onClick={() => onSelectWord(index)}
                          className={`inline-flex items-center gap-1 font-semibold transition-colors ${
                            isSelected
                              ? "text-[#F0D77F]"
                              : "text-[#D4AF37] hover:text-[#F0D77F]"
                          }`}
                          title={`Strong's ${word.strongs}`}
                        >
                          <span>{originalLabel}</span>
                        </button>
                      ) : (
                        originalLabel && (
                          <span className="text-neutral-400">
                            {originalLabel}
                          </span>
                        )
                      )}
                    </span>
                  );
                })}
              </div>

              {/* Strong's definition popup */}
              {selectedWordIndex !== null && words[selectedWordIndex] && (
                <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] leading-relaxed text-neutral-200">
                  <div className="flex items-center gap-2 text-[11px] text-neutral-400 uppercase tracking-wide">
                    <span>Strong's</span>
                    <span>{words[selectedWordIndex].strongs}</span>
                  </div>
                  <p className="mt-1 text-neutral-200">
                    {words[selectedWordIndex].definition ||
                      "Definition unavailable."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Lost in Translation pager */}
          {lostContext && (
            <div className="pt-2 border-t border-white/5">
              <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                Lost in translation
              </h4>
              <div
                className="space-y-2 text-[12px] leading-relaxed text-neutral-200"
                onTouchStart={(event) => {
                  lostContextTouchStartRef.current =
                    event.touches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  const startX = lostContextTouchStartRef.current;
                  if (startX === null) return;
                  const endX = event.changedTouches[0]?.clientX;
                  if (endX === undefined) return;
                  const delta = startX - endX;
                  if (Math.abs(delta) < 40) return;
                  if (delta > 0 && canNextLostContext) {
                    setLostContextPage((p) =>
                      Math.min(p + 1, lostContextTotal - 1),
                    );
                  } else if (delta < 0 && canPrevLostContext) {
                    setLostContextPage((p) => Math.max(p - 1, 0));
                  }
                }}
              >
                <p>{lostContextCurrent}</p>
              </div>
              {lostContextTotal > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setLostContextPage((p) => Math.max(p - 1, 0))
                    }
                    disabled={!canPrevLostContext}
                    className={`p-1 transition-colors ${
                      canPrevLostContext
                        ? "text-neutral-400 hover:text-neutral-200"
                        : "text-neutral-700 cursor-not-allowed"
                    }`}
                    aria-label="Previous"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>

                  <span className="text-[10px] text-neutral-500">
                    {lostContextPage + 1}/{lostContextTotal}
                  </span>

                  <div className="flex items-center gap-2">
                    {canNextLostContext && (
                      <button
                        type="button"
                        onClick={() =>
                          setLostContextPage((p) =>
                            Math.min(p + 1, lostContextTotal - 1),
                          )
                        }
                        className="text-[11px] text-[#D4AF37] hover:text-[#F0D77F] transition-colors"
                      >
                        Read more
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setLostContextPage((p) =>
                          Math.min(p + 1, lostContextTotal - 1),
                        )
                      }
                      disabled={!canNextLostContext}
                      className={`p-1 transition-colors ${
                        canNextLostContext
                          ? "text-neutral-400 hover:text-neutral-200"
                          : "text-neutral-700 cursor-not-allowed"
                      }`}
                      aria-label="Next"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-neutral-200 font-normal break-words">
          {fallbackText || "Root translation unavailable."}
        </p>
      )}
    </div>
  );
};
