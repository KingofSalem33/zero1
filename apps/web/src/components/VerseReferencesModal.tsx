import React, { useState, useEffect, useRef } from "react";
import { calcPopoverPosition } from "../utils/tooltipPosition";
import { hapticTap } from "../utils/haptics";
import {
  fetchCrossReferences as cachedFetchCrossRefs,
  fetchVerseText,
} from "../utils/verseCache";

interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

interface VerseReferencesModalProps {
  book: string;
  chapter: number;
  verse: number;
  position: { top: number; left: number };
  onClose: () => void;
  onRequestVerseTooltip?: (
    reference: string,
    position: { top: number; left: number },
  ) => void;
  verseTooltipRef?: React.RefObject<HTMLDivElement>;
}

// OT books (Genesis–Malachi) for testament detection
const OT_BOOKS = new Set([
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
]);

// Gospel/synoptic books
const GOSPELS = new Set(["Matthew", "Mark", "Luke", "John"]);

// Prophetic OT books
const PROPHETS = new Set([
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
]);

type RefType = "parallel" | "prophecy" | "thematic";

function classifyReference(sourceBook: string, targetBook: string): RefType {
  const sourceIsOT = OT_BOOKS.has(sourceBook);
  const targetIsOT = OT_BOOKS.has(targetBook);

  // Gospel → Gospel = parallel account
  if (
    GOSPELS.has(sourceBook) &&
    GOSPELS.has(targetBook) &&
    sourceBook !== targetBook
  ) {
    return "parallel";
  }

  // OT prophet → NT or NT → OT prophet = prophecy-fulfillment
  if (
    (sourceIsOT && !targetIsOT && PROPHETS.has(sourceBook)) ||
    (!sourceIsOT && targetIsOT && PROPHETS.has(targetBook))
  ) {
    return "prophecy";
  }

  // Same book = parallel/related
  if (sourceBook === targetBook) {
    return "parallel";
  }

  return "thematic";
}

const REF_TYPE_LABELS: Record<RefType, string> = {
  parallel: "Parallel",
  prophecy: "Prophecy",
  thematic: "Thematic",
};

export function VerseReferencesModal({
  book,
  chapter,
  verse,
  position,
  onClose,
  onRequestVerseTooltip,
  verseTooltipRef,
}: VerseReferencesModalProps) {
  const [crossReferences, setCrossReferences] = useState<VerseRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [versePreviews, setVersePreviews] = useState<Record<string, string>>(
    {},
  );
  const tooltipRef = useRef<HTMLDivElement>(null);

  const reference = `${book} ${chapter}:${verse}`;

  // Trigger entrance animation on mount
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Fetch cross-references on mount
  useEffect(() => {
    const controller = new AbortController();
    let minLoadTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const fetchCrossReferences = async () => {
      setLoading(true);
      setError(null);
      const startTime = Date.now();

      try {
        const refs = await cachedFetchCrossRefs(reference, controller.signal);
        if (cancelled) return;

        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 300 - elapsed);

        // Ensure loading state is visible long enough to avoid a flash
        minLoadTimer = setTimeout(() => {
          setCrossReferences(refs);
          setLoading(false);
        }, remaining);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Could not load references");
        setLoading(false);
      }
    };

    fetchCrossReferences();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(minLoadTimer);
    };
  }, [reference]);

  // Batch-fetch verse text previews after cross-refs load
  useEffect(() => {
    if (crossReferences.length === 0) return;
    const controller = new AbortController();
    let cancelled = false;

    // Fetch up to 10 previews in parallel
    const toFetch = crossReferences.slice(0, 10);
    const promises = toFetch.map(async (ref) => {
      const refStr = `${ref.book} ${ref.chapter}:${ref.verse}`;
      const text = await fetchVerseText(refStr, controller.signal);
      return [refStr, text || ""] as const;
    });

    Promise.allSettled(promises).then((results) => {
      if (cancelled) return;
      const previews: Record<string, string> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          const [key, text] = result.value;
          if (text) previews[key] = text;
        }
      }
      setVersePreviews(previews);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [crossReferences]);

  // Close on click outside (but not when clicking on the verse tooltip)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideModal = tooltipRef.current?.contains(target);
      const clickedInsideVerseTooltip =
        verseTooltipRef?.current?.contains(target);

      // Only close if clicking outside both the modal and the verse tooltip
      if (!clickedInsideModal && !clickedInsideVerseTooltip) {
        onClose();
      }
    };

    // Small delay to prevent immediate closure on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, verseTooltipRef]);

  const handleReferenceClick = (ref: VerseRef, event: React.MouseEvent) => {
    event.stopPropagation();
    hapticTap();
    const refString = `${ref.book} ${ref.chapter}:${ref.verse}`;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const scrollContainer = (event.target as HTMLElement).closest(
      ".relative.flex-1.overflow-y-auto",
    ) as HTMLElement;

    if (scrollContainer && onRequestVerseTooltip) {
      const position = calcPopoverPosition(rect, scrollContainer);
      onRequestVerseTooltip(refString, position);
    }
  };

  // Ensure modal doesn't go off-screen horizontally
  const modalWidth = 384; // max-w-sm = 24rem = 384px
  const edgePadding = 16;
  const minLeft = modalWidth / 2 + edgePadding;
  const containerWidth =
    tooltipRef.current?.offsetParent?.clientWidth || window.innerWidth;
  const maxLeft = containerWidth - modalWidth / 2 - edgePadding;
  const adjustedLeft = Math.min(Math.max(position.left, minLeft), maxLeft);

  return (
    <div
      ref={tooltipRef}
      className={`absolute z-[60] transform -translate-x-1/2 transition-all duration-150 ease-out ${isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
      style={{
        top: `${position.top}px`,
        left: `${adjustedLeft}px`,
      }}
    >
      {/* Compact popover card */}
      <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden max-w-sm">
        {/* Header - Compact */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <div>
            <div className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wide">
              Cross-References
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              {reference}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all duration-150"
            aria-label="Close"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content - Compact */}
        <div className="p-3 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse" />
              <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:150ms]" />
              <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:300ms]" />
              <span className="text-xs text-neutral-400 ml-1 font-medium">
                Loading
              </span>
            </div>
          ) : error ? (
            <div className="text-xs text-red-400 py-2">{error}</div>
          ) : crossReferences.length === 0 ? (
            <div className="text-xs text-neutral-400 py-2">
              No cross-references found
            </div>
          ) : (
            <div role="list" aria-label={`Cross references for ${reference}`}>
              {(() => {
                // Group references by type
                const grouped = new Map<RefType, VerseRef[]>();
                for (const ref of crossReferences) {
                  const type = classifyReference(book, ref.book);
                  if (!grouped.has(type)) grouped.set(type, []);
                  grouped.get(type)!.push(ref);
                }

                // Render order: parallel, prophecy, thematic
                const order: RefType[] = ["parallel", "prophecy", "thematic"];
                const sections = order.filter((t) => grouped.has(t));

                return sections.map((type) => (
                  <div
                    key={type}
                    className={sections.length > 1 ? "mb-2 last:mb-0" : ""}
                  >
                    {sections.length > 1 && (
                      <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-medium px-1 mb-1">
                        {REF_TYPE_LABELS[type]}
                      </div>
                    )}
                    <div className="space-y-1">
                      {grouped.get(type)!.map((ref, index) => {
                        const refString = `${ref.book} ${ref.chapter}:${ref.verse}`;
                        const preview = versePreviews[refString];

                        return (
                          <div
                            key={`${type}-${index}`}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleReferenceClick(ref, e)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleReferenceClick(
                                  ref,
                                  e as unknown as React.MouseEvent,
                                );
                              }
                            }}
                            className="px-1 py-1 cursor-pointer group border-l-2 border-[#D4AF37]/15 hover:border-[#D4AF37]/40 pl-2 transition-all rounded-r-sm hover:bg-white/[0.03]"
                          >
                            <span className="text-xs font-medium text-[#D4AF37]/70 group-hover:text-[#D4AF37] transition-colors">
                              {refString}
                            </span>
                            {preview ? (
                              <p className="text-[11px] leading-relaxed text-neutral-500 group-hover:text-neutral-400 font-serif italic mt-0.5 line-clamp-2 transition-colors">
                                {preview}
                              </p>
                            ) : (
                              <div className="mt-1 space-y-1">
                                <div className="h-2.5 w-3/4 rounded bg-white/5 animate-pulse" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Arrow pointer - points up to verse number */}
      <div
        className="absolute"
        style={{
          top: "-8px",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        {/* Arrow shadow */}
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1">
          <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-black/20 blur-sm" />
        </div>

        {/* Main arrow */}
        <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-white/[0.08]" />

        {/* Arrow border */}
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2">
          <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-b-[9px] border-b-white/10" />
        </div>
      </div>
    </div>
  );
}
