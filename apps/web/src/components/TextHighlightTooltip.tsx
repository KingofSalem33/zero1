import { useState, useEffect, useRef, useCallback } from "react";

/* global MouseEvent, Element, AbortController, HTMLElement, Range */

interface TextHighlightTooltipProps {
  onGoDeeper: (text: string) => void;
  userId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onHighlight?: (text: string, color: string, context?: any) => void;
  enableHighlight?: boolean;
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

export function TextHighlightTooltip({
  onGoDeeper,
  onHighlight,
  enableHighlight = false,
}: TextHighlightTooltipProps) {
  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [description, setDescription] = useState("");
  const [isLoadingDescription, setIsLoadingDescription] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [highlightSuccess, setHighlightSuccess] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const selectionRangeRef = useRef<Range | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

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
        'Highlight insight unavailable right now. Click "Go Deeper" to continue.',
      );
      setIsLoadingDescription(false);
      isStreamingRef.current = false;
      abortControllerRef.current = null;
    }
  }, []);

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

          // Position below selection - use viewport coordinates only (no scrollY for fixed positioning)
          const top = rect.bottom + spacing;

          // Center horizontally on the selection - use viewport coordinates only (no scrollX for fixed positioning)
          let left = rect.left + rect.width / 2;

          // Keep tooltip within viewport horizontally
          const rightEdge = left + tooltipEstimatedWidth / 2;
          const leftEdge = left - tooltipEstimatedWidth / 2;

          if (rightEdge > window.innerWidth - 16) {
            left = window.innerWidth - tooltipEstimatedWidth / 2 - 16;
          } else if (leftEdge < 16) {
            left = tooltipEstimatedWidth / 2 + 16;
          }

          setPosition({
            top,
            left,
          });

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
  }, [closeTooltip, generateAISynopsis]);

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

  if (!position || !selectedText) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className={`fixed z-[70] transform -translate-x-1/2 transition-all duration-150 ease-out ${
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
          {/* Synopsis - compact single area */}
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
              <p className="text-[13px] leading-relaxed text-neutral-200 font-normal">
                {description}
                {description && isStreamingRef.current && (
                  <span className="inline-block w-1 h-3 ml-0.5 bg-[#D4AF37] animate-pulse" />
                )}
              </p>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGoDeeper}
                  className="group px-3 py-1.5 bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] hover:text-[#E5C158] text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5"
                >
                  <span>Go Deeper</span>
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
    </div>
  );
}
