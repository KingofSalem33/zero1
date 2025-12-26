/* global AbortController */
import React, { useState, useEffect, useRef } from "react";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

interface VerseTooltipProps {
  reference: string;
  position: { top: number; left: number };
  onClose: () => void;
  onTrace?: (reference: string) => void;
}

const VerseTooltip = React.forwardRef<HTMLDivElement, VerseTooltipProps>(
  ({ reference, position, onClose, onTrace }, ref) => {
    const [verseText, setVerseText] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"synopsis" | "root">("synopsis");
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
    const [rootLanguage, setRootLanguage] = useState<string>("");
    const [currentRootCardIndex, setCurrentRootCardIndex] = useState(0);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isStreamingRef = useRef(false);

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
          setIsLoadingRoot(false);
          isStreamingRef.current = false;
          abortControllerRef.current = null;
          return;
        }

        const data = await response.json();
        const fullTranslation =
          data.translation || "Unable to generate translation.";
        const language = data.language || "";

        setRootLanguage(language);

        // Parse the structured response
        const parseRootTranslation = (text: string) => {
          const rootsMatch = text.match(/ROOTS:\s*([\s\S]*?)\n\nPLAIN:/);
          const plainMatch = text.match(/PLAIN:\s*([\s\S]*?)$/);

          const rootsText = rootsMatch?.[1] || "";
          const plain = plainMatch?.[1]?.trim() || text;

          const wordBlocks = rootsText
            .split(/\n- /)
            .filter((block) => block.trim());

          const insights = wordBlocks
            .map((block) => {
              const headerMatch = block.match(
                /^(.+?)\s*[—-]\s*(.+?)\s*\(Strong's\s+([^)]+)\)/m,
              );
              if (!headerMatch) return null;

              const word = headerMatch[1].trim();
              const original = headerMatch[2].trim();
              const strongsNumber = headerMatch[3].trim();

              const restOfBlock = block.substring(block.indexOf("\n") + 1);
              const lines = restOfBlock.split("\n").filter((l) => l.trim());
              const definition = lines[0]?.trim() || "";
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

        if (!isStreamingRef.current) {
          return;
        }

        setIsLoadingRoot(false);

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
        }
        setIsLoadingRoot(false);
        isStreamingRef.current = false;
        abortControllerRef.current = null;
      }
    };

    const handleRootTranslation = async () => {
      if (verseText) {
        setViewMode("root");
        setRootInsights([]);
        setPlainMeaning("");
        setCurrentRootCardIndex(0);
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
      setRootInsights([]);
      setPlainMeaning("");
      setCurrentRootCardIndex(0);
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
    const minLeft = tooltipWidth / 2 + 16; // Add 16px padding from edge
    const adjustedLeft = Math.max(position.left, minLeft);

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
            {viewMode === "synopsis" ? (
              <>
                {/* Synopsis View */}
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

                    {/* Action buttons */}
                    <div className="mt-3 flex items-center gap-2">
                      {onTrace && (
                        <button
                          onClick={() => {
                            onTrace(reference);
                            onClose();
                          }}
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

                  {isLoadingRoot ? (
                    <div className="flex items-center gap-2 py-1.5">
                      <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse" />
                      <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:150ms]" />
                      <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:300ms]" />
                      <span className="text-xs text-neutral-400 ml-1 font-medium">
                        Translating from original{" "}
                        {rootLanguage || "Hebrew/Greek"}...
                      </span>
                    </div>
                  ) : rootInsights.length > 0 ? (
                    <div className="space-y-3">
                      {/* Direct Translation */}
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

                        {rootInsights[currentRootCardIndex] && (
                          <div>
                            <div className="space-y-2 py-2">
                              {/* Word header with Strong's number */}
                              <div className="text-[13px]">
                                <span className="font-semibold text-[#D4AF37]">
                                  {rootInsights[currentRootCardIndex].word}
                                </span>
                                {rootInsights[currentRootCardIndex]
                                  .original && (
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

                            {/* Navigation dots */}
                            {rootInsights.length > 1 && (
                              <div className="flex items-center justify-center gap-1.5 pt-2">
                                {rootInsights.map((_, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setCurrentRootCardIndex(idx)}
                                    className={`h-1.5 rounded-full transition-all ${
                                      idx === currentRootCardIndex
                                        ? "w-4 bg-[#D4AF37]"
                                        : "w-1.5 bg-neutral-600 hover:bg-neutral-500"
                                    }`}
                                    aria-label={`View word ${idx + 1}`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
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
