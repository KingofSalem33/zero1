import React, { useState, useEffect, useRef, useCallback } from "react";

/* global Element, AbortController, Range */

interface TextHighlightTooltipProps {
  onGoDeeper: (text: string) => void;
  userId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onHighlight?: (text: string, color: string, context?: any) => void;
  enableHighlight?: boolean;
  // Bible context for ROOT translation
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

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "#FEF3C7", textColor: "#92400E" },
  { name: "Green", value: "#D1FAE5", textColor: "#065F46" },
  { name: "Blue", value: "#DBEAFE", textColor: "#1E40AF" },
  { name: "Pink", value: "#FCE7F3", textColor: "#9F1239" },
  { name: "Purple", value: "#EDE9FE", textColor: "#5B21B6" },
];

// --- VERSE TOOLTIP ---
// Shows verse text in a tooltip when clicking a Scripture citation
const VerseTooltip = ({
  reference,
  position,
  onClose,
  onTrace,
}: {
  reference: string;
  position: { top: number; left: number };
  onClose: () => void;
  onTrace?: (reference: string) => void;
}) => {
  const [verseText, setVerseText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch verse text from API
    const fetchVerse = async () => {
      try {
        const response = await fetch(
          `http://localhost:3001/api/verse/${encodeURIComponent(reference)}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch verse");
        }

        const data = await response.json();
        setVerseText(data.text);
        setIsLoading(false);
      } catch {
        setVerseText("Could not load verse text");
        setIsLoading(false);
      }
    };

    fetchVerse();
  }, [reference]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
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
  }, [onClose]);

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[80] transform -translate-x-1/2 transition-all duration-150 ease-out"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Compact card matching highlight tooltip */}
      <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-lg shadow-xl overflow-hidden max-w-sm">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all duration-150 z-10"
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

        {/* Content */}
        <div className="p-3 pr-8">
          {/* Reference header */}
          <div className="font-bold text-[#D4AF37] text-xs mb-2 uppercase tracking-wide">
            {reference}
          </div>

          {/* Verse text */}
          {isLoading ? (
            <div className="flex items-center gap-2 py-1.5">
              <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse" />
              <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:150ms]" />
              <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:300ms]" />
              <span className="text-xs text-neutral-400 ml-1 font-medium">
                Loading
              </span>
            </div>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed text-white font-serif italic">
                {verseText}
              </p>

              {/* Trace button */}
              {onTrace && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      console.log(
                        "[VerseTooltip] Trace button clicked, reference:",
                        reference,
                      );
                      onTrace(reference);
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#F0D77F] text-black text-sm font-medium rounded transition-colors"
                    title="Explore with AI"
                  >
                    Trace
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Arrow pointer - always points up to clicked text */}
      <div
        className="absolute left-1/2 transform -translate-x-1/2"
        style={{ top: "0", transform: "translate(-50%, -100%)" }}
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
};

// --- INTERACTIVE TEXT WITH SCRIPTURE PARSING ---
// Parses text for Scripture references and makes them clickable gold links
const InteractiveText = ({
  children,
  onVerseClick,
}: {
  children: React.ReactNode;
  onVerseClick?: (reference: string, event: React.MouseEvent) => void;
}) => {
  if (typeof children === "string") {
    // Regex catches ALL Scripture references with or without brackets:
    // - [John 3:16] (with brackets)
    // - John 3:16 (without brackets)
    // - 1 Timothy 3:16 (multi-word books)
    // - Galatians 2:11-14 (verse ranges)
    // - Song of Solomon 2:1 (long book names)
    const parts = children.split(
      /((?:\[)?(?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?(?:\])?)/g,
    );

    return (
      <span className="text-[13px] leading-relaxed text-neutral-200 font-normal">
        {parts.map((part, i) => {
          // Check if this part is a Scripture reference
          const scriptureMatch = part.match(
            /^(?:\[)?((?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?)(?:\])?$/,
          );

          if (scriptureMatch) {
            // Extract reference (remove brackets if present)
            const reference = scriptureMatch[1];

            return (
              <button
                key={i}
                className="text-[#D4AF37] font-bold hover:text-[#F0D77F] hover:underline decoration-[#D4AF37] decoration-2 underline-offset-4 transition-all duration-200 mx-0.5 cursor-pointer inline-flex items-center gap-0.5"
                onClick={(e) => {
                  onVerseClick?.(reference, e);
                }}
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

export function TextHighlightTooltip({
  onGoDeeper,
  onHighlight,
  enableHighlight = false,
  bibleContext,
}: TextHighlightTooltipProps) {
  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [description, setDescription] = useState("");
  const [isLoadingDescription, setIsLoadingDescription] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [highlightSuccess, setHighlightSuccess] = useState(false);
  const [viewMode, setViewMode] = useState<"synopsis" | "root">("synopsis");
  const [rootTranslation, setRootTranslation] = useState("");
  const [rootLanguage, setRootLanguage] = useState<string>("");
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);
  const [rootInsights, setRootInsights] = useState<
    Array<{
      word: string;
      original: string;
      strongsNumber: string;
      definition: string;
      insight: string;
    }>
  >([]);
  const [plainMeaning, setPlainMeaning] = useState("");
  const [detectedVerseContext, setDetectedVerseContext] = useState<
    | {
        book: string;
        chapter: number;
        verses: number[];
      }
    | undefined
  >(undefined);
  const [currentRootCardIndex, setCurrentRootCardIndex] = useState(0);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const selectionRangeRef = useRef<Range | null>(null);

  // State for verse tooltip
  const [verseTooltipData, setVerseTooltipData] = useState<{
    reference: string;
    position: { top: number; left: number };
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  const getVerseContainerForRange = (range: Range): HTMLElement | null => {
    let element =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : (range.commonAncestorContainer as HTMLElement);

    while (element) {
      if (element.querySelectorAll?.("[data-verse]").length) {
        return element;
      }
      element = element.parentElement;
    }

    return null;
  };

  const getVerseNumbersFromRange = (range: Range): number[] => {
    const container = getVerseContainerForRange(range);
    if (!container) return [];

    const verses = new Set<number>();
    const verseElements =
      container.querySelectorAll<HTMLElement>("[data-verse]");

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
  };

  const closeTooltip = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isStreamingRef.current = false;
    selectionRangeRef.current = null;
    setIsVisible(false);
    setTimeout(() => {
      setPosition(null);
      setSelectedText("");
      setDescription("");
      setIsLoadingDescription(false);
      setHighlightSuccess(false);
      setViewMode("synopsis");
      setRootTranslation("");
      setRootLanguage("");
      setIsLoadingRoot(false);
      setRootInsights([]);
      setPlainMeaning("");
      setDetectedVerseContext(undefined);
      setCurrentRootCardIndex(0);
    }, 150);
  }, []);

  const generateAISynopsis = useCallback(async (text: string) => {
    try {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      isStreamingRef.current = true;

      const response = await fetch(`${API_URL}/api/synopsis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          maxWords: 34,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        await response.text();
        const errorMessage =
          response.status === 429
            ? "Highlight insight unavailable (quota exceeded)."
            : `Failed to generate synopsis (${response.status}).`;
        setIsLoadingDescription(false);
        setDescription(errorMessage);
        isStreamingRef.current = false;
        abortControllerRef.current = null;
        return;
      }

      const data = await response.json();
      const fullSynopsis = data.synopsis || "Unable to generate synopsis.";

      // Check if we were cancelled before starting to stream
      if (!isStreamingRef.current) {
        return;
      }

      // Stream the text word by word
      setIsLoadingDescription(false);
      setDescription("");

      const words = fullSynopsis.split(" ");
      let currentText = "";

      for (let i = 0; i < words.length; i++) {
        if (!isStreamingRef.current) {
          // Streaming was cancelled
          return;
        }

        currentText += (i > 0 ? " " : "") + words[i];
        setDescription(currentText);

        // Wait between words for streaming effect
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      isStreamingRef.current = false;
      abortControllerRef.current = null;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setDescription(
        'Highlight insight unavailable right now. Click "Trace" to continue.',
      );
      setIsLoadingDescription(false);
      isStreamingRef.current = false;
      abortControllerRef.current = null;
    }
  }, []);

  const generateRootTranslation = useCallback(
    async (text: string) => {
      try {
        setIsLoadingRoot(true);
        setRootTranslation("");
        setRootLanguage("");

        // Create new abort controller for this request
        abortControllerRef.current = new AbortController();
        isStreamingRef.current = true;

        const verseNumbers = detectedVerseContext?.verses;
        const requestBody = {
          selectedText: text,
          maxWords: 140,
          book: detectedVerseContext?.book || bibleContext?.book,
          chapter: detectedVerseContext?.chapter || bibleContext?.chapter,
          verse: !verseNumbers?.length ? bibleContext?.verse : undefined,
          verses: verseNumbers?.length ? verseNumbers : undefined,
        };

        console.log("[Root Translation] Sending request:", requestBody);

        const response = await fetch(`${API_URL}/api/root-translation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          await response.text();
          const errorMessage =
            response.status === 429
              ? "Root translation unavailable (quota exceeded)."
              : `Failed to generate translation (${response.status}).`;
          setIsLoadingRoot(false);
          setRootTranslation(errorMessage);
          isStreamingRef.current = false;
          abortControllerRef.current = null;
          return;
        }

        const data = await response.json();
        const fullTranslation =
          data.translation || "Unable to generate translation.";
        const language = data.language || "";

        setRootLanguage(language);

        // Parse the structured response with Strong's numbers
        const parseRootTranslation = (text: string) => {
          const rootsMatch = text.match(/ROOTS:\s*([\s\S]*?)\n\nPLAIN:/);
          const plainMatch = text.match(/PLAIN:\s*([\s\S]*?)$/);

          const rootsText = rootsMatch?.[1] || "";
          const plain = plainMatch?.[1]?.trim() || text; // Fallback to full text

          // Split by word entries (lines starting with "- ")
          const wordBlocks = rootsText
            .split(/\n- /)
            .filter((block) => block.trim());

          const insights = wordBlocks
            .map((block) => {
              // Match: "Word — original (Strong's GXXXX)\ndefinition\n\ninsight"
              const headerMatch = block.match(
                /^(.+?)\s*[—-]\s*(.+?)\s*\(Strong's\s+([^)]+)\)/m,
              );
              if (!headerMatch) return null;

              const word = headerMatch[1].trim();
              const original = headerMatch[2].trim();
              const strongsNumber = headerMatch[3].trim();

              // Get everything after the header
              const restOfBlock = block.substring(block.indexOf("\n") + 1);

              // First line is the definition, rest is insight
              const lines = restOfBlock.split("\n").filter((l) => l.trim());
              const definition = lines[0]?.trim() || "";

              // Everything after the definition (skip empty lines)
              const insightLines = lines.slice(1).filter((l) => l.trim());
              const insight = insightLines.join(" ").trim();

              return {
                word,
                original,
                strongsNumber,
                definition,
                insight,
              };
            })
            .filter(Boolean) as Array<{
            word: string;
            original: string;
            strongsNumber: string;
            definition: string;
            insight: string;
          }>;

          return { insights, plain };
        };

        const parsed = parseRootTranslation(fullTranslation);

        console.log("[ROOT] Full translation:", fullTranslation);
        console.log("[ROOT] Parsed insights:", parsed.insights);
        console.log("[ROOT] Parsed plain:", parsed.plain);

        // Check if we were cancelled before starting to stream
        if (!isStreamingRef.current) {
          return;
        }

        setIsLoadingRoot(false);

        // Stream the structured content
        // Stream insights one by one
        for (let i = 0; i < parsed.insights.length; i++) {
          if (!isStreamingRef.current) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
          setRootInsights((prev) => [...prev, parsed.insights[i]]);
        }

        // Stream plain meaning word by word
        if (isStreamingRef.current && parsed.plain) {
          const words = parsed.plain.split(" ");
          for (let i = 0; i < words.length; i++) {
            if (!isStreamingRef.current) break;
            await new Promise((resolve) => setTimeout(resolve, 30));
            setPlainMeaning((prev) =>
              prev ? prev + " " + words[i] : words[i],
            );
          }
        }

        setRootTranslation(fullTranslation); // Keep for fallback
        isStreamingRef.current = false;
        abortControllerRef.current = null;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setRootTranslation("Root translation unavailable right now.");
        setIsLoadingRoot(false);
        isStreamingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [detectedVerseContext, bibleContext],
  );

  useEffect(() => {
    const handleMouseUp = async (e: MouseEvent) => {
      // Don't interfere with verse citation clicks
      const target = e.target as HTMLElement;
      if (target && target.closest('button[class*="text-[#B5942F]"]')) {
        console.log("[TextHighlight] Ignoring verse citation click");
        return;
      }

      // Ignore clicks inside the tooltip itself
      if (
        tooltipRef.current &&
        target instanceof Element &&
        tooltipRef.current.contains(target)
      ) {
        console.log("[TextHighlight] Ignoring click inside tooltip");
        return;
      }

      const selection = window.getSelection();
      const text = selection?.toString().trim();

      console.log("[TextHighlight] Mouse up, selected text:", text);

      if (text && text.length > 0) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();

        console.log("[TextHighlight] Showing tooltip for:", text);

        if (rect && range) {
          // Store the selection range for later use
          selectionRangeRef.current = range.cloneRange();

          // Detect verse numbers from the selection (supports multi-verse)
          setDetectedVerseContext(undefined);
          try {
            const verseNumbers = getVerseNumbersFromRange(range);

            if (verseNumbers.length && bibleContext) {
              setDetectedVerseContext({
                book: bibleContext.book,
                chapter: bibleContext.chapter,
                verses: verseNumbers,
              });
              console.log("[TextHighlight] Detected verse context:", {
                book: bibleContext.book,
                chapter: bibleContext.chapter,
                verses: verseNumbers,
              });
            } else {
              let verseElement = null;

              // Try multiple approaches to find the verse element (same as BibleReader does)
              const startContainer = range.startContainer;
              const startElement =
                startContainer.nodeType === Node.TEXT_NODE
                  ? startContainer.parentElement
                  : (startContainer as HTMLElement);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              verseElement = (startElement as any)?.closest?.("[data-verse]");

              if (!verseElement) {
                const endContainer = range.endContainer;
                const endElement =
                  endContainer.nodeType === Node.TEXT_NODE
                    ? endContainer.parentElement
                    : (endContainer as HTMLElement);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                verseElement = (endElement as any)?.closest?.("[data-verse]");
              }

              if (!verseElement) {
                const container = range.commonAncestorContainer;
                const element =
                  container.nodeType === Node.TEXT_NODE
                    ? container.parentElement
                    : (container as HTMLElement);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                verseElement = (element as any)?.closest?.("[data-verse]");
              }

              if (verseElement && bibleContext) {
                const verseNum = parseInt(
                  verseElement.getAttribute("data-verse") || "0",
                  10,
                );
                if (verseNum > 0) {
                  // Combine verse from DOM with book/chapter from context
                  setDetectedVerseContext({
                    book: bibleContext.book,
                    chapter: bibleContext.chapter,
                    verses: [verseNum],
                  });
                  console.log("[TextHighlight] Detected verse context:", {
                    book: bibleContext.book,
                    chapter: bibleContext.chapter,
                    verses: [verseNum],
                  });
                }
              }
            }
          } catch (err) {
            console.log("[TextHighlight] Could not detect verse:", err);
          }

          // Cancel any ongoing streaming
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
          }
          isStreamingRef.current = false;

          // Reset all state for new selection
          setSelectedText(text);
          setDescription("");
          setIsLoadingDescription(true);
          setIsVisible(false);

          // Position tooltip directly below the highlighted text
          const spacing = 12;
          const tooltipEstimatedWidth = 384; // max-w-sm = 24rem = 384px

          // Find the scrolling container (has overflow-y-auto class)
          const scrollContainer = range.startContainer.parentElement?.closest?.(
            ".overflow-y-auto",
          ) as HTMLElement;

          if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();

            // Calculate position relative to the scrolling container
            // rect.bottom is viewport-relative, so we subtract containerRect.top and add scrollTop
            const top =
              rect.bottom -
              containerRect.top +
              scrollContainer.scrollTop +
              spacing;

            // Center horizontally on the selection, relative to container
            let left =
              rect.left -
              containerRect.left +
              scrollContainer.scrollLeft +
              rect.width / 2;

            // Keep tooltip within container horizontally
            const containerWidth = containerRect.width;
            const rightEdge = left + tooltipEstimatedWidth / 2;
            const leftEdge = left - tooltipEstimatedWidth / 2;

            if (rightEdge > containerWidth - 16) {
              left = containerWidth - tooltipEstimatedWidth / 2 - 16;
            } else if (leftEdge < 16) {
              left = tooltipEstimatedWidth / 2 + 16;
            }

            setPosition({
              top,
              left,
            });
          }

          setTimeout(() => setIsVisible(true), 10);
          await generateAISynopsis(text);
        }
      } else {
        // Only close if not clicking inside the tooltip
        const clickedElement = document.activeElement;
        const isClickInsideTooltip =
          tooltipRef.current &&
          clickedElement &&
          tooltipRef.current.contains(clickedElement);

        if (!isClickInsideTooltip) {
          closeTooltip();
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Close tooltip if clicking outside
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      isStreamingRef.current = false;
    };
  }, [closeTooltip, generateAISynopsis, bibleContext]);

  const handleHighlight = (color?: string) => {
    console.log("[TextHighlight] handleHighlight called", {
      selectedText,
      hasOnHighlight: !!onHighlight,
      color,
      hasStoredRange: !!selectionRangeRef.current,
    });

    if (!selectedText || !onHighlight) {
      console.warn("[TextHighlight] Cannot highlight:", {
        hasSelectedText: !!selectedText,
        hasOnHighlight: !!onHighlight,
      });
      return;
    }

    // Use default yellow color if no color specified
    const highlightColor = color || HIGHLIGHT_COLORS[0].value;

    // Try to use stored range, but fall back to current selection if needed
    let range = selectionRangeRef.current;

    // If no stored range or it's invalid, try to get current selection
    if (!range) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0);

        console.log(
          "[TextHighlight] Using current selection range as fallback",
        );
      }
    }

    if (!range) {
      console.error("[TextHighlight] No range available for highlighting");
      return;
    }

    console.log("[TextHighlight] Calling onHighlight with:", {
      text: selectedText,
      color: highlightColor,
      hasRange: !!range,
    });

    // Pass the range as context
    onHighlight(selectedText, highlightColor, {
      range: range,
    });

    setHighlightSuccess(true);

    // Auto-close after highlighting
    setTimeout(() => {
      closeTooltip();
      window.getSelection()?.removeAllRanges();
    }, 800);
  };

  const handleGoDeeper = () => {
    if (selectedText) {
      onGoDeeper(selectedText);
      closeTooltip();
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleRootTranslation = async () => {
    if (selectedText) {
      setViewMode("root");
      // Reset state before streaming new content
      setRootInsights([]);
      setPlainMeaning("");
      setCurrentRootCardIndex(0);
      await generateRootTranslation(selectedText);
    }
  };

  const handleBackToSynopsis = () => {
    // Cancel any ongoing root translation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isStreamingRef.current = false;
    setViewMode("synopsis");
    setRootTranslation("");
    setRootLanguage("");
    setIsLoadingRoot(false);
    setRootInsights([]);
    setPlainMeaning("");
    setCurrentRootCardIndex(0);
  };

  const handleVerseClick = (reference: string, event: React.MouseEvent) => {
    event.preventDefault();

    // Get click position for tooltip
    const rect = (event.target as HTMLElement).getBoundingClientRect();

    // Position below the clicked reference
    const spacing = 12;
    const top = rect.bottom + spacing;
    const left = rect.left + rect.width / 2;

    setVerseTooltipData({
      reference,
      position: {
        top,
        left,
      },
    });
  };

  if (!position || !selectedText) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className={`absolute z-[70] transform -translate-x-1/2 transition-all duration-150 ease-out ${
        isVisible ? "opacity-100" : "opacity-0 -translate-y-2"
      }`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Compact, dynamic card */}
      <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-lg shadow-xl overflow-hidden max-w-sm">
        {/* Close button */}
        <button
          onClick={closeTooltip}
          className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all duration-150 z-10"
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

        {/* Content */}
        <div className="p-3 pr-8">
          {viewMode === "synopsis" ? (
            <>
              {/* Synopsis View */}
              {isLoadingDescription ? (
                <div className="flex items-center gap-2 py-1.5">
                  <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse" />
                  <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:150ms]" />
                  <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:300ms]" />
                  <span className="text-xs text-neutral-400 ml-1 font-medium">
                    Analyzing
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <InteractiveText onVerseClick={handleVerseClick}>
                    {description}
                  </InteractiveText>
                  {description && isStreamingRef.current && (
                    <span className="inline-block w-1 h-3 ml-0.5 bg-[#D4AF37] animate-pulse" />
                  )}

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

                    {/* ROOT Button */}
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

                    {/* Highlight Button */}
                    {enableHighlight && (
                      <button
                        onClick={() => handleHighlight()}
                        disabled={highlightSuccess}
                        className={`group px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 ${
                          highlightSuccess
                            ? "bg-[#D4AF37]/20 text-[#D4AF37] cursor-default"
                            : "bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200"
                        }`}
                        title={
                          highlightSuccess
                            ? "Saved to highlights"
                            : "Save to highlights"
                        }
                      >
                        {highlightSuccess ? (
                          <>
                            <svg
                              className="w-3.5 h-3.5"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M17.75 7L14 3.25l-10 10V17h3.75l10-10zm2.96-2.96c.39-.39.39-1.02 0-1.41L18.37.29c-.39-.39-1.02-.39-1.41 0L15 2.25 18.75 6l1.96-1.96z" />
                            </svg>
                            <svg
                              className="w-2.5 h-2.5 absolute ml-0.5 mt-0.5"
                              fill="none"
                              stroke="white"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </>
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
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Root Translation View */}
              <div className="space-y-3">
                {/* Back button */}
                <button
                  onClick={handleBackToSynopsis}
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
                  <span>Back to synopsis</span>
                </button>

                {isLoadingRoot ? (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse" />
                    <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:150ms]" />
                    <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:300ms]" />
                    <span className="text-xs text-neutral-400 ml-1 font-medium">
                      Translating from original {rootLanguage || "Hebrew/Greek"}
                      ...
                    </span>
                  </div>
                ) : rootInsights.length > 0 ? (
                  <div className="space-y-3">
                    {/* Direct Translation - Now at the top */}
                    <div className="pb-3 border-b border-white/5">
                      <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                        Direct Translation
                      </h4>
                      <p className="text-[13px] text-neutral-200 leading-relaxed italic">
                        {plainMeaning}
                      </p>
                    </div>

                    {/* Root Word Carousel */}
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                        Root Words
                      </h4>

                      {/* Current card content */}
                      {rootInsights[currentRootCardIndex] && (
                        <div>
                          {/* Card content */}
                          <div className="space-y-2 py-2">
                            {/* Word header with Strong's number */}
                            <div className="text-[13px]">
                              <span className="font-semibold text-[#D4AF37]">
                                {rootInsights[currentRootCardIndex].word}
                              </span>
                              {rootInsights[currentRootCardIndex].original && (
                                <>
                                  <span className="text-neutral-400 mx-1">
                                    —
                                  </span>
                                  <span className="text-neutral-400 italic">
                                    {
                                      rootInsights[currentRootCardIndex]
                                        .original
                                    }
                                  </span>
                                </>
                              )}
                              {rootInsights[currentRootCardIndex]
                                .strongsNumber && (
                                <span className="text-neutral-500 text-[11px] ml-2">
                                  (Strong's{" "}
                                  {
                                    rootInsights[currentRootCardIndex]
                                      .strongsNumber
                                  }
                                  )
                                </span>
                              )}
                            </div>

                            {/* Definition and insight */}
                            <div className="space-y-2 text-[12px] leading-relaxed">
                              {rootInsights[currentRootCardIndex]
                                .definition && (
                                <p className="text-neutral-300 italic">
                                  {
                                    rootInsights[currentRootCardIndex]
                                      .definition
                                  }
                                </p>
                              )}
                              {rootInsights[currentRootCardIndex].insight && (
                                <p className="text-neutral-200">
                                  {rootInsights[currentRootCardIndex].insight}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Navigation: Arrows + Dots */}
                      <div className="flex items-center justify-center gap-3 pt-2">
                        {/* Left arrow */}
                        <button
                          onClick={() =>
                            setCurrentRootCardIndex(currentRootCardIndex - 1)
                          }
                          disabled={currentRootCardIndex === 0}
                          className={`p-1 transition-colors ${
                            currentRootCardIndex === 0
                              ? "text-neutral-700 cursor-not-allowed"
                              : "text-neutral-400 hover:text-neutral-200"
                          }`}
                          aria-label="Previous root word"
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

                        {/* Dot progression indicator */}
                        <div className="flex gap-1.5">
                          {rootInsights.map((_, index) => (
                            <button
                              key={index}
                              onClick={() => setCurrentRootCardIndex(index)}
                              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                index === currentRootCardIndex
                                  ? "bg-[#D4AF37]"
                                  : "bg-neutral-600 hover:bg-neutral-500"
                              }`}
                              aria-label={`Go to root word ${index + 1}`}
                            />
                          ))}
                        </div>

                        {/* Right arrow */}
                        <button
                          onClick={() =>
                            setCurrentRootCardIndex(currentRootCardIndex + 1)
                          }
                          disabled={
                            currentRootCardIndex === rootInsights.length - 1
                          }
                          className={`p-1 transition-colors ${
                            currentRootCardIndex === rootInsights.length - 1
                              ? "text-neutral-700 cursor-not-allowed"
                              : "text-neutral-400 hover:text-neutral-200"
                          }`}
                          aria-label="Next root word"
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
                  </div>
                ) : (
                  <p className="text-[13px] leading-relaxed text-neutral-200 font-normal">
                    {rootTranslation}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Arrow pointer - pointing up to highlighted text */}
      <div
        className="absolute left-1/2 transform -translate-x-1/2"
        style={{ top: "0", transform: "translate(-50%, -100%)" }}
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

      {/* Verse tooltip for Scripture references in synopsis */}
      {verseTooltipData && (
        <VerseTooltip
          reference={verseTooltipData.reference}
          position={verseTooltipData.position}
          onClose={() => setVerseTooltipData(null)}
          onTrace={onGoDeeper}
        />
      )}
    </div>
  );
}
