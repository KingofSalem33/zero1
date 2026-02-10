/* global AbortController */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { dispatchVerseNavigation } from "../utils/verseNavigation";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

const LOST_CONTEXT_MAX_WORDS = 34;
const LOST_CONTEXT_MAX_SENTENCES = 2;

const splitIntoSentences = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

const chunkLostContext = (
  text: string,
  maxWords: number,
  maxSentences: number,
) => {
  if (!text.trim()) return [];
  const sentences = splitIntoSentences(text);

  if (sentences.length === 1) {
    const words = sentences[0].split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return [sentences[0]];
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += maxWords) {
      chunks.push(
        words
          .slice(i, i + maxWords)
          .join(" ")
          .trim(),
      );
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).filter(Boolean);
    const nextCount = wordCount + sentenceWords.length;
    const exceeds =
      current.length >= maxSentences ||
      (nextCount > maxWords && current.length);

    if (exceeds) {
      chunks.push(current.join(" ").trim());
      current = [];
      wordCount = 0;
    }

    current.push(sentence);
    wordCount += sentenceWords.length;
  }

  if (current.length) {
    chunks.push(current.join(" ").trim());
  }

  return chunks;
};

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
    const [isLoadingRoot, setIsLoadingRoot] = useState(false);
    const [rootWords, setRootWords] = useState<
      Array<{
        english: string;
        original: string;
        strongs: string | null;
        definition: string;
      }>
    >([]);
    const [rootTranslation, setRootTranslation] = useState("");
    const [lostContext, setLostContext] = useState("");
    const [lostContextPage, setLostContextPage] = useState(0);
    const [selectedRootWordIndex, setSelectedRootWordIndex] = useState<
      number | null
    >(null);
    const [rootLanguage, setRootLanguage] = useState<string>("");
    const tooltipRef = useRef<HTMLDivElement>(null);
    const lostContextTouchStartRef = useRef<number | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isStreamingRef = useRef(false);
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
    const lostContextCurrent =
      lostContextChunks[lostContextPage] || lostContext;
    const canPrevLostContext = lostContextPage > 0;
    const canNextLostContext = lostContextPage < lostContextTotal - 1;

    useEffect(() => {
      setLostContextPage(0);
    }, [lostContext]);

    useEffect(() => {
      // Fetch verse text from API
      const fetchVerse = async () => {
        console.log("[VerseTooltip] Fetching verse:", reference);
        try {
          const response = await fetch(
            `${API_URL}/api/verse/${encodeURIComponent(reference)}`,
          );

          if (!response.ok) {
            console.error(
              "[VerseTooltip] Failed to fetch verse:",
              response.status,
              response.statusText,
            );
            throw new Error("Failed to fetch verse");
          }

          const data = await response.json();
          console.log("[VerseTooltip] Received verse data:", data);
          setVerseText(data.text);
          setIsLoading(false);
        } catch (error) {
          console.error("[VerseTooltip] Error fetching verse:", error);
          setVerseText("Could not load verse text");
          setIsLoading(false);
        }
      };

      fetchVerse();
    }, [reference]);

    // Generate root translation
    const generateRootTranslation = async (text: string) => {
      setIsLoadingRoot(true);
      setRootTranslation("");
      setRootWords([]);
      setLostContext("");
      setLostContextPage(0);
      setSelectedRootWordIndex(null);
      isStreamingRef.current = true;

      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        // Parse reference to extract book, chapter, verse
        const refMatch = reference.match(/^(.+?)\s+(\d+):(\d+)$/);
        const book = refMatch?.[1] || "";
        const chapter = refMatch?.[2] ? parseInt(refMatch[2]) : 0;
        const verse = refMatch?.[3] ? parseInt(refMatch[3]) : 0;

        const requestBody = {
          selectedText: text,
          maxWords: 140,
          book,
          chapter,
          verse,
        };

        console.log("[VerseTooltip] Root translation request:", requestBody);

        const response = await fetch(`${API_URL}/api/root-translation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok) {
          setRootTranslation("Root translation unavailable right now.");
          setIsLoadingRoot(false);
          isStreamingRef.current = false;
          abortControllerRef.current = null;
          return;
        }

        const data = await response.json();
        const language = data.language || "";
        const words = Array.isArray(data.words) ? data.words : [];
        const analysis =
          data.lostContext ||
          data.translation ||
          "Unable to generate translation.";

        setRootLanguage(language);
        setRootTranslation(analysis);

        if (!isStreamingRef.current) {
          return;
        }

        setIsLoadingRoot(false);

        // Check if cancelled
        if (!isStreamingRef.current) {
          return;
        }

        // Show all content immediately - no streaming animation
        setRootWords(words);
        setLostContext(analysis);

        isStreamingRef.current = false;
        abortControllerRef.current = null;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("[VerseTooltip] Root translation cancelled");
        } else {
          console.error(
            "[VerseTooltip] Error generating root translation:",
            error,
          );
          setRootTranslation("Root translation unavailable right now.");
        }
        setIsLoadingRoot(false);
        isStreamingRef.current = false;
        abortControllerRef.current = null;
      }
    };

    const handleRootTranslation = async () => {
      if (verseText) {
        setViewMode("root");
        setRootWords([]);
        setLostContext("");
        await generateRootTranslation(verseText);
      }
    };

    const handleBackToSynopsis = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      isStreamingRef.current = false;
      setViewMode("synopsis");
      setIsLoadingRoot(false);
      setRootWords([]);
      setLostContext("");
      setLostContextPage(0);
      setSelectedRootWordIndex(null);
    };

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

    // Ensure tooltip doesn't go off-screen
    const tooltipWidth = 384; // max-w-sm
    const padding = 16;
    const minLeft = tooltipWidth / 2 + padding;
    // Get the scroll container width (parent element)
    const containerWidth =
      tooltipRef.current?.offsetParent?.clientWidth || window.innerWidth;
    const maxLeft = containerWidth - tooltipWidth / 2 - padding;
    const adjustedLeft = Math.min(Math.max(position.left, minLeft), maxLeft);

    return (
      <div
        ref={ref}
        className="absolute z-[80] transform -translate-x-1/2 transition-all duration-150 ease-out"
        style={{
          top: `${position.top}px`,
          left: `${adjustedLeft}px`,
        }}
      >
        {/* Compact card matching highlight tooltip */}
        <div
          className={`relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden ${tooltipMaxWidth}`}
        >
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
            {viewMode === "synopsis" ? (
              <>
                {/* Synopsis View */}
                {/* Reference header */}
                <div
                  className="font-bold text-xs mb-2 uppercase tracking-wide"
                  style={{ color: accent }}
                >
                  {reference}
                </div>

                {/* Verse text */}
                {isLoading ? (
                  <div className="flex items-center gap-2 py-1.5">
                    <div
                      className="w-1 h-1 rounded-full animate-pulse"
                      style={{ backgroundColor: accent }}
                    />
                    <div
                      className="w-1 h-1 rounded-full animate-pulse [animation-delay:150ms]"
                      style={{ backgroundColor: accent }}
                    />
                    <div
                      className="w-1 h-1 rounded-full animate-pulse [animation-delay:300ms]"
                      style={{ backgroundColor: accent }}
                    />
                    <span className="text-xs text-neutral-400 ml-1 font-medium">
                      Loading
                    </span>
                  </div>
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
              <>
                {/* Root Translation View */}
                <div className="space-y-3">
                  {/* Back button */}
                  <div className="flex items-center justify-between">
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
                      <span>Back to verse</span>
                    </button>
                    <button
                      onClick={() => {
                        dispatchVerseNavigation(reference);
                        onClose();
                      }}
                      className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                      title="Open in Bible reader"
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
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      </svg>
                      <span>View</span>
                    </button>
                  </div>

                  {isLoadingRoot ? (
                    <div className="flex items-center gap-2 py-1.5">
                      <div
                        className="w-1 h-1 rounded-full animate-pulse"
                        style={{ backgroundColor: accent }}
                      />
                      <div
                        className="w-1 h-1 rounded-full animate-pulse [animation-delay:150ms]"
                        style={{ backgroundColor: accent }}
                      />
                      <div
                        className="w-1 h-1 rounded-full animate-pulse [animation-delay:300ms]"
                        style={{ backgroundColor: accent }}
                      />
                      <span className="text-xs text-neutral-400 ml-1 font-medium">
                        Translating from original{" "}
                        {rootLanguage || "Hebrew/Greek"}...
                      </span>
                    </div>
                  ) : rootWords.length > 0 || lostContext ? (
                    <div className="space-y-3">
                      {rootWords.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-[13px] text-neutral-200 leading-relaxed">
                            {rootWords.map((word, index) => {
                              const isSelected =
                                selectedRootWordIndex === index;
                              const isClickable = Boolean(word.strongs);
                              const label = word.english;
                              const originalLabel = word.original
                                ? `(${word.original})`
                                : "";

                              return (
                                <span
                                  key={`${word.english}-${word.strongs || index}`}
                                  className="whitespace-nowrap"
                                >
                                  <span className="text-neutral-200">
                                    {label}
                                  </span>{" "}
                                  {isClickable ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedRootWordIndex(index)
                                      }
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

                          {selectedRootWordIndex !== null &&
                            rootWords[selectedRootWordIndex] && (
                              <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] leading-relaxed text-neutral-200">
                                <div className="flex items-center gap-2 text-[11px] text-neutral-400 uppercase tracking-wide">
                                  <span>Strong's</span>
                                  <span>
                                    {rootWords[selectedRootWordIndex].strongs}
                                  </span>
                                </div>
                                <p className="mt-1 text-neutral-200">
                                  {rootWords[selectedRootWordIndex]
                                    .definition || "Definition unavailable."}
                                </p>
                              </div>
                            )}
                        </div>
                      )}

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
                                setLostContextPage((page) =>
                                  Math.min(page + 1, lostContextTotal - 1),
                                );
                              } else if (delta < 0 && canPrevLostContext) {
                                setLostContextPage((page) =>
                                  Math.max(page - 1, 0),
                                );
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
                                  setLostContextPage((page) =>
                                    Math.max(page - 1, 0),
                                  )
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
                                      setLostContextPage((page) =>
                                        Math.min(
                                          page + 1,
                                          lostContextTotal - 1,
                                        ),
                                      )
                                    }
                                    className="text-[11px] hover:brightness-110 transition-colors"
                                    style={{ color: accent }}
                                  >
                                    Read more
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLostContextPage((page) =>
                                      Math.min(page + 1, lostContextTotal - 1),
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
                    <p className="text-[13px] text-neutral-200 leading-relaxed italic break-words">
                      {rootTranslation || "Root translation unavailable."}
                    </p>
                  )}
                </div>
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
  },
);

VerseTooltip.displayName = "VerseTooltip";

export default VerseTooltip;
