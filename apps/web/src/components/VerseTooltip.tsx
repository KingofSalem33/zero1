import React, { useState, useEffect, useRef } from "react";
import { dispatchVerseNavigation } from "../utils/verseNavigation";
import { useRootTranslation } from "../hooks/useRootTranslation";
import { TooltipShell } from "./tooltip/TooltipShell";
import { LoadingDots } from "./tooltip/LoadingDots";
import { RootTranslationPanel } from "./tooltip/RootTranslationPanel";
import { fetchVerseText } from "../utils/verseCache";

interface VerseTooltipProps {
  reference: string;
  position: { top: number; left: number };
  onClose: () => void;
  onTrace?: (reference: string) => void;
  onGoDeeper?: (reference: string) => void;
  accentColor?: string;
  maxWidthClassName?: string;
}

const VerseTooltip = React.forwardRef<HTMLDivElement, VerseTooltipProps>(
  (
    {
      reference,
      position,
      onClose,
      onTrace,
      onGoDeeper,
      accentColor,
      maxWidthClassName,
    },
    ref,
  ) => {
    const [verseText, setVerseText] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"synopsis" | "root">("synopsis");
    const tooltipRef = useRef<HTMLDivElement>(null);

    const accent = accentColor || "#D4AF37";
    const tooltipMaxWidth = maxWidthClassName || "max-w-sm";

    const toRgba = (hex: string, alpha: number) => {
      const normalized = hex.replace("#", "");
      if (normalized.length !== 6) return `rgba(212,175,55,${alpha})`;
      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    const accentMuted = toRgba(accent, 0.2);

    const root = useRootTranslation();

    // Fetch verse text
    useEffect(() => {
      const controller = new AbortController();
      let cancelled = false;
      const fetchVerse = async () => {
        try {
          const text = await fetchVerseText(reference, controller.signal);
          if (cancelled) return;
          setVerseText(text || "Could not load verse text");
        } catch (error: unknown) {
          if (error instanceof Error && error.name === "AbortError") return;
          if (!cancelled) setVerseText("Could not load verse text");
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      };
      fetchVerse();
      return () => {
        cancelled = true;
        controller.abort();
      };
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
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [onClose]);

    const handleRootTranslation = async () => {
      if (!verseText) return;
      setViewMode("root");
      const refMatch = reference.match(/^(.+?)\s+(\d+):(\d+)$/);
      await root.generate(verseText, {
        book: refMatch?.[1] || "",
        chapter: refMatch?.[2] ? parseInt(refMatch[2]) : 0,
        verse: refMatch?.[3] ? parseInt(refMatch[3]) : 0,
      });
    };

    const handleBackToVerse = () => {
      root.reset();
      setViewMode("synopsis");
    };

    // Ensure tooltip doesn't go off-screen
    const tooltipWidth = 384;
    const padding = 16;
    const minLeft = tooltipWidth / 2 + padding;
    const containerWidth =
      tooltipRef.current?.offsetParent?.clientWidth || window.innerWidth;
    const maxLeft = containerWidth - tooltipWidth / 2 - padding;
    const adjustedLeft = Math.min(Math.max(position.left, minLeft), maxLeft);

    return (
      <div
        ref={(node) => {
          // Merge forwarded ref + local ref
          (
            tooltipRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = node;
          if (typeof ref === "function") ref(node);
          else if (ref)
            (ref as React.MutableRefObject<HTMLDivElement | null>).current =
              node;
        }}
        className="absolute z-[60] transform -translate-x-1/2 transition-all duration-150 ease-out"
        style={{
          top: `${position.top}px`,
          left: `${adjustedLeft}px`,
        }}
      >
        <TooltipShell onClose={onClose} maxWidthClassName={tooltipMaxWidth}>
          {viewMode === "synopsis" ? (
            <>
              {/* Reference header */}
              <div
                className="font-bold text-xs mb-2 uppercase tracking-wide"
                style={{ color: accent }}
              >
                {reference}
              </div>

              {/* Verse text */}
              {isLoading ? (
                <LoadingDots label="Loading" color={accent} />
              ) : (
                <>
                  <p className="text-[15px] leading-relaxed text-white font-serif italic">
                    {verseText}
                  </p>

                  {/* Action buttons */}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => {
                        dispatchVerseNavigation(reference);
                        onClose();
                      }}
                      className="group px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5"
                      title="Open in Bible reader"
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
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      </svg>
                      <span>View</span>
                    </button>
                    {onTrace && (
                      <button
                        onClick={() => {
                          onTrace(reference);
                          onClose();
                        }}
                        className="group px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 hover:brightness-110"
                        style={{
                          backgroundColor: accentMuted,
                          color: accent,
                        }}
                        title="Open connection map"
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
                    )}
                    {onGoDeeper && (
                      <button
                        onClick={() => {
                          onGoDeeper(reference);
                          onClose();
                        }}
                        className="group px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white"
                        title="Ask AI about this passage"
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
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                          />
                        </svg>
                        <span>Go Deeper</span>
                      </button>
                    )}

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
                  </div>
                </>
              )}
            </>
          ) : (
            <RootTranslationPanel
              isLoading={root.isLoading}
              language={root.language}
              words={root.words}
              lostContext={root.lostContext}
              fallbackText={root.fallbackText}
              selectedWordIndex={root.selectedWordIndex}
              onSelectWord={root.setSelectedWordIndex}
              onBack={handleBackToVerse}
              backLabel="Back to verse"
            />
          )}
        </TooltipShell>
      </div>
    );
  },
);

VerseTooltip.displayName = "VerseTooltip";

export default VerseTooltip;
