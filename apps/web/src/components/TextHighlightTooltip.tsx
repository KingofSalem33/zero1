import React, { useState, useEffect, useRef, useCallback } from "react";
import { dispatchVerseNavigation } from "../utils/verseNavigation";
import { useAIRequest } from "../hooks/useAIRequest";
import { useRootTranslation } from "../hooks/useRootTranslation";
import { TooltipShell } from "./tooltip/TooltipShell";
import { LoadingDots } from "./tooltip/LoadingDots";
import { RootTranslationPanel } from "./tooltip/RootTranslationPanel";
import { HIGHLIGHT_COLORS } from "../contexts/BibleHighlightsContext";
import { hapticTap, hapticSuccess, hapticMedium } from "../utils/haptics";

interface TextHighlightTooltipProps {
  onGoDeeper: (text: string, anchorRef?: string) => void;
  onNavigateToChat?: (reference: string) => void;
  userId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onHighlight?: (text: string, color: string, context?: any) => void;
  enableHighlight?: boolean;
  bibleContext?: {
    book: string;
    chapter: number;
    verse: number;
  };
}

interface Position {
  top: number;
  left: number;
}

type VerseContext = {
  book: string;
  chapter: number;
  verses: number[];
};

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

// --- INTERACTIVE TEXT WITH SCRIPTURE PARSING ---
const InteractiveText = ({
  children,
  onVerseClick,
}: {
  children: React.ReactNode;
  onVerseClick?: (reference: string, event: React.MouseEvent) => void;
}) => {
  if (typeof children === "string") {
    const parts = children.split(
      /((?:\[)?(?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?(?:\])?)/g,
    );

    return (
      <span className="text-[13px] leading-relaxed text-neutral-200 font-normal">
        {parts.map((part, i) => {
          const scriptureMatch = part.match(
            /^(?:\[)?((?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?)(?:\])?$/,
          );

          if (scriptureMatch) {
            const reference = scriptureMatch[1];
            return (
              <button
                key={i}
                className="text-[#D4AF37] font-bold hover:text-[#F0D77F] hover:underline decoration-[#D4AF37] decoration-2 underline-offset-4 transition-all duration-200 mx-0.5 cursor-pointer inline-flex items-center gap-0.5"
                data-verse-link="true"
                onClick={(e) => onVerseClick?.(reference, e)}
                title="Click to view verse"
              >
                {reference}
              </button>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  }
  return (
    <span className="text-[13px] leading-relaxed text-neutral-200 font-normal">
      {children}
    </span>
  );
};

// --- INLINE VERSE TOOLTIP (for Scripture references in synopsis) ---
const InlineVerseTooltip = ({
  reference,
  position,
  onClose,
  onTrace,
  onGoDeeper,
}: {
  reference: string;
  position: { top: number; left: number };
  onClose: () => void;
  onTrace?: (text: string, anchorRef?: string) => void;
  onGoDeeper?: (reference: string) => void;
}) => {
  const [verseText, setVerseText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchVerse = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/verse/${encodeURIComponent(reference)}`,
        );
        if (!response.ok) throw new Error("Failed to fetch verse");
        const data = await response.json();
        setVerseText(data.text);
      } catch {
        setVerseText("Could not load verse text");
      } finally {
        setIsLoading(false);
      }
    };
    fetchVerse();
  }, [reference]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[60] transform -translate-x-1/2 transition-all duration-150 ease-out"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <TooltipShell onClose={onClose}>
        <div className="font-bold text-[#D4AF37] text-xs mb-2 uppercase tracking-wide">
          {reference}
        </div>
        {isLoading ? (
          <LoadingDots label="Loading" />
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-white font-serif italic">
              {verseText}
            </p>
            <div className="mt-3 flex items-center gap-2 justify-end">
              <button
                onClick={() => {
                  dispatchVerseNavigation(reference);
                  onClose();
                }}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-300 text-sm font-medium rounded transition-colors"
                title="Open in Bible reader"
              >
                View
              </button>
              {onTrace && (
                <button
                  onClick={() => {
                    onTrace(reference);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#F0D77F] text-black text-sm font-medium rounded transition-colors"
                  title="Explore deeper"
                >
                  Trace
                </button>
              )}
              {onGoDeeper && (
                <button
                  onClick={() => {
                    onGoDeeper(reference);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-300 text-sm font-medium rounded transition-colors"
                  title="Ask AI about this passage"
                >
                  Go Deeper
                </button>
              )}
            </div>
          </>
        )}
      </TooltipShell>
    </div>
  );
};

// --- Verse detection helpers ---
function getVerseContainerForRange(range: Range): HTMLElement | null {
  let element =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : (range.commonAncestorContainer as HTMLElement);

  while (element) {
    if (element.querySelectorAll?.("[data-verse]").length) return element;
    element = element.parentElement;
  }
  return null;
}

function getVerseNumbersFromRange(range: Range): number[] {
  const container = getVerseContainerForRange(range);
  if (!container) return [];

  const verses = new Set<number>();
  const verseElements = container.querySelectorAll<HTMLElement>("[data-verse]");

  verseElements.forEach((el) => {
    try {
      if (range.intersectsNode(el)) {
        const num = parseInt(el.getAttribute("data-verse") || "0", 10);
        if (num > 0) verses.add(num);
      }
    } catch {
      // Ignore nodes that cannot be intersected.
    }
  });

  return Array.from(verses).sort((a, b) => a - b);
}

function detectVerseElement(range: Range): HTMLElement | null {
  // Try start container, end container, then common ancestor
  for (const container of [
    range.startContainer,
    range.endContainer,
    range.commonAncestorContainer,
  ]) {
    const element =
      container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : (container as HTMLElement);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verseEl = (element as any)?.closest?.("[data-verse]");
    if (verseEl) return verseEl;
  }
  return null;
}

// --- MAIN COMPONENT ---
export function TextHighlightTooltip({
  onGoDeeper,
  onNavigateToChat,
  onHighlight,
  enableHighlight = false,
  bibleContext,
}: TextHighlightTooltipProps) {
  // Core tooltip state
  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [viewMode, setViewMode] = useState<"synopsis" | "root">("synopsis");

  // Synopsis state
  const [description, setDescription] = useState("");
  const [verseReference, setVerseReference] = useState<string | null>(null);
  const [isLoadingDescription, setIsLoadingDescription] = useState(false);

  // Highlight state
  const [highlightSuccess, setHighlightSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [detectedVerseContext, setDetectedVerseContext] = useState<
    VerseContext | undefined
  >(undefined);

  // Refs
  const tooltipRef = useRef<HTMLDivElement>(null);
  const selectionRangeRef = useRef<Range | null>(null);

  // Verse tooltip for Scripture references in synopsis
  const [verseTooltipData, setVerseTooltipData] = useState<{
    reference: string;
    position: { top: number; left: number };
  } | null>(null);

  // Shared hooks
  const synopsisRequest = useAIRequest();
  const root = useRootTranslation();

  const closeTooltip = useCallback(() => {
    synopsisRequest.abort();
    root.reset();
    selectionRangeRef.current = null;
    setIsVisible(false);
    setTimeout(() => {
      setPosition(null);
      setSelectedText("");
      setDescription("");
      setVerseReference(null);
      setIsLoadingDescription(false);
      setHighlightSuccess(false);
      setCopySuccess(false);
      setViewMode("synopsis");
      setDetectedVerseContext(undefined);
    }, 150);
  }, [synopsisRequest, root]);

  const generateAISynopsis = useCallback(
    async (text: string, verseContext?: VerseContext) => {
      const requestBody: Record<string, unknown> = {
        text,
        maxWords: 34,
      };

      const normalizedVerses = verseContext?.verses
        ? Array.from(
            new Set(
              verseContext.verses.filter(
                (num) => Number.isFinite(num) && num > 0,
              ),
            ),
          ).sort((a, b) => a - b)
        : [];

      if (verseContext?.book && verseContext.chapter) {
        requestBody.book = verseContext.book;
        requestBody.chapter = verseContext.chapter;
      }

      if (normalizedVerses.length === 1) {
        requestBody.verse = normalizedVerses[0];
      } else if (normalizedVerses.length > 1) {
        requestBody.verses = normalizedVerses;
      }

      await synopsisRequest.execute({
        endpoint: "/api/synopsis",
        body: requestBody,
        onSuccess: (data) => {
          const reference =
            (data?.verse as { reference?: string })?.reference ||
            (data?.verses as { reference?: string })?.reference ||
            null;
          setVerseReference(reference);
          setDescription(
            (data.synopsis as string) || "Unable to generate synopsis.",
          );
          setIsLoadingDescription(false);
        },
        onError: (message) => {
          setDescription(message);
          setVerseReference(null);
          setIsLoadingDescription(false);
        },
      });
    },
    [synopsisRequest],
  );

  // Text selection handler
  useEffect(() => {
    const handleMouseUp = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.closest('button[data-verse-link="true"]')) return;
      if (
        tooltipRef.current &&
        target instanceof Element &&
        tooltipRef.current.contains(target)
      )
        return;

      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();

        if (rect && range) {
          selectionRangeRef.current = range.cloneRange();

          let nextVerseContext: VerseContext | undefined;
          setDetectedVerseContext(undefined);

          try {
            const verseNumbers = getVerseNumbersFromRange(range);

            if (verseNumbers.length && bibleContext) {
              nextVerseContext = {
                book: bibleContext.book,
                chapter: bibleContext.chapter,
                verses: verseNumbers,
              };
            } else {
              const verseElement = detectVerseElement(range);
              if (verseElement && bibleContext) {
                const verseNum = parseInt(
                  verseElement.getAttribute("data-verse") || "0",
                  10,
                );
                if (verseNum > 0) {
                  nextVerseContext = {
                    book: bibleContext.book,
                    chapter: bibleContext.chapter,
                    verses: [verseNum],
                  };
                }
              }
            }
          } catch {
            // Could not detect verse
          }

          if (nextVerseContext) setDetectedVerseContext(nextVerseContext);

          // Cancel any ongoing requests
          synopsisRequest.abort();
          root.reset();

          // Reset state for new selection
          setSelectedText(text);
          setDescription("");
          setVerseReference(null);
          setIsLoadingDescription(true);
          setIsVisible(false);
          setViewMode("synopsis");

          // Position tooltip
          const spacing = 12;
          const tooltipEstimatedWidth = 384;

          const scrollContainer = range.startContainer.parentElement?.closest?.(
            ".overflow-y-auto",
          ) as HTMLElement;

          if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const tooltipEstimatedHeight = 200;
            const belowTop =
              rect.bottom -
              containerRect.top +
              scrollContainer.scrollTop +
              spacing;
            const aboveTop =
              rect.top -
              containerRect.top +
              scrollContainer.scrollTop -
              spacing -
              tooltipEstimatedHeight;

            const roomBelow = containerRect.bottom - rect.bottom;
            const top =
              roomBelow < tooltipEstimatedHeight + spacing * 2
                ? Math.max(scrollContainer.scrollTop + 8, aboveTop)
                : belowTop;

            let left =
              rect.left -
              containerRect.left +
              scrollContainer.scrollLeft +
              rect.width / 2;

            const containerWidth = containerRect.width;
            const rightEdge = left + tooltipEstimatedWidth / 2;
            const leftEdge = left - tooltipEstimatedWidth / 2;

            if (rightEdge > containerWidth - 16) {
              left = containerWidth - tooltipEstimatedWidth / 2 - 16;
            } else if (leftEdge < 16) {
              left = tooltipEstimatedWidth / 2 + 16;
            }

            setPosition({ top, left });
          }

          setTimeout(() => setIsVisible(true), 10);
          await generateAISynopsis(text, nextVerseContext);
        }
      } else {
        const clickedElement = document.activeElement;
        const isClickInsideTooltip =
          tooltipRef.current &&
          clickedElement &&
          tooltipRef.current.contains(clickedElement);

        if (!isClickInsideTooltip) closeTooltip();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (
        tooltipRef.current &&
        target instanceof Element &&
        !tooltipRef.current.contains(target)
      ) {
        closeTooltip();
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [closeTooltip, generateAISynopsis, bibleContext, synopsisRequest, root]);

  const handleHighlight = (color?: string) => {
    if (!selectedText || !onHighlight) return;

    const highlightColor = color || HIGHLIGHT_COLORS[0].value;
    let range = selectionRangeRef.current;

    if (!range) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
      }
    }
    if (!range) return;

    onHighlight(selectedText, highlightColor, { range });
    hapticTap();
    setHighlightSuccess(true);

    setTimeout(() => {
      closeTooltip();
      window.getSelection()?.removeAllRanges();
    }, 800);
  };

  const handleGoDeeper = () => {
    if (!selectedText) return;
    let anchorRef: string | undefined;
    if (
      detectedVerseContext?.book &&
      detectedVerseContext.chapter &&
      detectedVerseContext.verses?.length
    ) {
      anchorRef = `${detectedVerseContext.book} ${detectedVerseContext.chapter}:${detectedVerseContext.verses[0]}`;
    }
    onGoDeeper(selectedText, anchorRef);
    closeTooltip();
    window.getSelection()?.removeAllRanges();
  };

  const handleRootTranslation = async () => {
    if (!selectedText) return;
    setViewMode("root");
    const verseNumbers = detectedVerseContext?.verses;
    await root.generate(selectedText, {
      book: detectedVerseContext?.book || bibleContext?.book,
      chapter: detectedVerseContext?.chapter || bibleContext?.chapter,
      verse: !verseNumbers?.length ? bibleContext?.verse : undefined,
      verses: verseNumbers?.length ? verseNumbers : undefined,
    });
  };

  const handleBackToSynopsis = () => {
    root.reset();
    setViewMode("synopsis");
  };

  const formatVerseForCopy = useCallback(() => {
    const ref =
      verseReference ||
      (detectedVerseContext
        ? `${detectedVerseContext.book} ${detectedVerseContext.chapter}:${detectedVerseContext.verses.join("-")}`
        : null);
    return ref ? `"${selectedText}" \u2014 ${ref} (KJV)` : selectedText;
  }, [selectedText, verseReference, detectedVerseContext]);

  const handleCopy = useCallback(async () => {
    const text = formatVerseForCopy();
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      hapticSuccess();
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopySuccess(true);
      hapticSuccess();
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [formatVerseForCopy]);

  const handleShare = useCallback(async () => {
    const text = formatVerseForCopy();
    if (navigator.share) {
      hapticMedium();
      try {
        await navigator.share({ text });
      } catch {
        // User cancelled share
      }
    }
  }, [formatVerseForCopy]);

  const handleVerseClick = (reference: string, event: React.MouseEvent) => {
    event.preventDefault();
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const spacing = 12;
    setVerseTooltipData({
      reference,
      position: {
        top: rect.bottom + spacing,
        left: rect.left + rect.width / 2,
      },
    });
  };

  if (!position || !selectedText) return null;

  return (
    <div
      ref={tooltipRef}
      className={`absolute z-[60] transform -translate-x-1/2 transition-all duration-150 ease-out ${
        isVisible ? "opacity-100" : "opacity-0 -translate-y-2"
      }`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <TooltipShell onClose={closeTooltip}>
        <div className="relative overflow-hidden">
          {/* Synopsis view */}
          <div
            className={`transition-all duration-200 ease-out ${
              viewMode === "synopsis"
                ? "opacity-100 translate-x-0"
                : "opacity-0 -translate-x-4 absolute inset-0 pointer-events-none"
            }`}
          >
            {viewMode === "synopsis" && (
              <>
                {isLoadingDescription ? (
                  <LoadingDots label="Analyzing" />
                ) : (
                  <div className="space-y-2">
                    {verseReference && (
                      <div className="font-bold text-[#D4AF37] text-xs uppercase tracking-wide">
                        {verseReference}
                      </div>
                    )}
                    <InteractiveText onVerseClick={handleVerseClick}>
                      {description}
                    </InteractiveText>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleGoDeeper}
                        className="group px-3 py-1.5 bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] hover:text-[#E5C158] text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5"
                      >
                        <span>Trace</span>
                        <svg
                          className="w-3 h-3 transition-transform group-hover:translate-x-0.5"
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

                      {/* Copy button */}
                      <button
                        onClick={handleCopy}
                        className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5"
                        title="Copy verse with reference"
                      >
                        {copySuccess ? (
                          <svg
                            className="w-3.5 h-3.5 text-green-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
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
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                        <span>{copySuccess ? "Copied" : "Copy"}</span>
                      </button>

                      {/* Share button (mobile only, when Web Share API available) */}
                      {typeof navigator !== "undefined" && navigator.share && (
                        <button
                          onClick={handleShare}
                          className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 md:hidden"
                          title="Share verse"
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
                              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                            />
                          </svg>
                        </button>
                      )}

                      {enableHighlight && (
                        <button
                          onClick={handleRootTranslation}
                          className="group px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5"
                          title="See original Hebrew/Greek translation"
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
                              d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                            />
                          </svg>
                          <span>ROOT</span>
                        </button>
                      )}

                      {enableHighlight &&
                        (highlightSuccess ? (
                          <span className="flex items-center gap-1 px-2 py-1 text-xs text-[#D4AF37]">
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
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            Saved
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 ml-auto">
                            {HIGHLIGHT_COLORS.map((c) => (
                              <button
                                key={c.value}
                                onClick={() => handleHighlight(c.value)}
                                className="w-5 h-5 rounded-full border-2 border-transparent hover:border-white/40 transition-all duration-150 hover:scale-110"
                                style={{ backgroundColor: c.value }}
                                title={`Highlight ${c.name}`}
                                aria-label={`Highlight with ${c.name}`}
                              />
                            ))}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Root translation view */}
          <div
            className={`transition-all duration-200 ease-out ${
              viewMode === "root"
                ? "opacity-100 translate-x-0"
                : "opacity-0 translate-x-4 absolute inset-0 pointer-events-none"
            }`}
          >
            {viewMode === "root" && (
              <RootTranslationPanel
                isLoading={root.isLoading}
                language={root.language}
                words={root.words}
                lostContext={root.lostContext}
                fallbackText={root.fallbackText}
                selectedWordIndex={root.selectedWordIndex}
                onSelectWord={root.setSelectedWordIndex}
                onBack={handleBackToSynopsis}
                backLabel="Back to synopsis"
              />
            )}
          </div>
        </div>
      </TooltipShell>

      {/* Verse tooltip for Scripture references in synopsis */}
      {verseTooltipData && (
        <InlineVerseTooltip
          reference={verseTooltipData.reference}
          position={verseTooltipData.position}
          onClose={() => setVerseTooltipData(null)}
          onTrace={onGoDeeper}
          onGoDeeper={onNavigateToChat}
        />
      )}
    </div>
  );
}
