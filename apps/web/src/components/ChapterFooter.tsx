import React, { useState, useEffect } from "react";

interface Card {
  lens:
    | "PROPHECY"
    | "TYPOLOGY"
    | "THREAD"
    | "PATTERN"
    | "ROOTS"
    | "WORLD"
    | "EXPLORE"
    | "GOLDEN";
  title: string;
  prompt: string;
}

interface ChapterFooterData {
  orientation: string;
  cards: Card[];
  _version?: string;
}

interface ChapterFooterProps {
  book: string;
  chapter: number;
  onCardTap: (prompt: string) => void;
}

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

// Subtle, scholarly color distinctions - whispers not shouts
const LENS_COLORS = {
  PROPHECY: "text-purple-300/70 border-purple-500/20 bg-purple-500/5",
  TYPOLOGY: "text-rose-300/70 border-rose-500/20 bg-rose-500/5",
  THREAD: "text-amber-300/70 border-amber-500/20 bg-amber-500/5",
  PATTERN: "text-cyan-300/70 border-cyan-500/20 bg-cyan-500/5",
  ROOTS: "text-emerald-300/70 border-emerald-500/20 bg-emerald-500/5",
  WORLD: "text-slate-300/70 border-slate-500/20 bg-slate-500/5",
  EXPLORE: "text-blue-300/70 border-blue-500/20 bg-blue-500/5",
  GOLDEN: "text-yellow-300/70 border-yellow-500/20 bg-yellow-500/5",
};

export function ChapterFooter({
  book,
  chapter,
  onCardTap,
}: ChapterFooterProps) {
  const [footer, setFooter] = useState<ChapterFooterData | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [startIndex, setStartIndex] = useState(0); // For carousel window

  const CARDS_VISIBLE = 3;

  useEffect(() => {
    async function fetchFooter() {
      setCurrentCardIndex(0); // Reset to first card when chapter changes
      setStartIndex(0); // Reset carousel window

      // Check cache first
      const cacheKey = `footer-${book}-${chapter}`;
      const cached = localStorage.getItem(cacheKey);
      const REQUIRED_VERSION = "2.1"; // Must match API version

      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          // Invalidate old cache versions
          if (cachedData._version === REQUIRED_VERSION) {
            console.log(
              `[Footer] Using cached v${REQUIRED_VERSION} for ${book} ${chapter}`,
            );
            setFooter(cachedData);
            return;
          } else {
            console.log(
              `[Footer] Cache outdated (v${cachedData._version || "1.0"} → v${REQUIRED_VERSION}), fetching fresh...`,
            );
            localStorage.removeItem(cacheKey);
          }
        } catch {
          // Invalid cache, continue to fetch
          localStorage.removeItem(cacheKey);
        }
      }

      // Fetch from API and cache
      try {
        const response = await fetch(
          `${API_URL}/api/bible/chapter-footer?book=${encodeURIComponent(book)}&chapter=${chapter}`,
        );
        if (!response.ok) {
          return;
        }
        const data = await response.json();

        console.log(`[Footer] Fetched ${book} ${chapter}:`, {
          orientation: data.orientation?.substring(0, 50) + "...",
          cardCount: data.cards?.length,
          cardTypes: data.cards?.map((c: Card) => c.lens),
          version: data._version,
        });

        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setFooter(data);
      } catch {
        // Silently fail - footer is optional enhancement
      }
    }

    fetchFooter();
  }, [book, chapter]);

  // Don't show loading state - just render when ready
  if (!footer || footer.cards.length === 0) {
    return null; // Silently wait for data or hide if failed
  }

  return (
    <div className="pt-12 pb-8">
      {/* Divider Line - Chapter closure */}
      <div className="max-w-3xl mx-auto mb-3">
        <div className="h-px bg-gradient-to-r from-transparent via-neutral-800/50 to-transparent" />
      </div>

      {/* Orientation - Compression + Core Insight */}
      <div className="max-w-3xl mx-auto mb-5 px-12 animate-[fadeIn_0.6s_ease-in]">
        <p className="text-center text-neutral-400 text-sm leading-loose font-light tracking-wide">
          <span className="italic">{footer.orientation.split(". ")[0]}.</span>
          {footer.orientation.split(". ")[1] && (
            <>
              {" "}
              <span className="text-neutral-300 font-medium not-italic">
                {footer.orientation.split(". ")[1]}
              </span>
            </>
          )}
        </p>
      </div>

      {/* Lenses - Ways to explore */}
      <div className="max-w-3xl mx-auto px-12 animate-[fadeIn_0.6s_ease-in_0.15s_both]">
        {/* Label */}
        <div className="text-center mb-3">
          <p className="text-[10px] uppercase tracking-widest text-neutral-600 font-light">
            Ways to explore this chapter
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {/* Previous Arrow */}
          <button
            onClick={() => {
              const newStart = Math.max(0, startIndex - 1);
              setStartIndex(newStart);
            }}
            disabled={startIndex === 0}
            className={`flex-shrink-0 p-1 transition-opacity ${
              startIndex === 0
                ? "opacity-0 pointer-events-none"
                : "opacity-40 hover:opacity-100"
            }`}
          >
            <svg
              className="w-3 h-3 text-neutral-500"
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

          {/* Visible Cards Window */}
          <div className="flex items-center gap-1.5 flex-1 justify-center">
            {footer.cards
              .slice(startIndex, startIndex + CARDS_VISIBLE)
              .map((card, relativeIndex) => {
                const absoluteIndex = startIndex + relativeIndex;
                const isActive = absoluteIndex === currentCardIndex;
                const lensColor = LENS_COLORS[card.lens];

                return (
                  <button
                    key={absoluteIndex}
                    onClick={() => {
                      setCurrentCardIndex(absoluteIndex);
                      onCardTap(card.prompt);
                    }}
                    onMouseEnter={() => setCurrentCardIndex(absoluteIndex)}
                    className={`
                      group relative flex-shrink-0 flex items-center gap-2 px-3 py-2 border transition-all duration-300 ${lensColor}
                      ${
                        isActive
                          ? "bg-opacity-100"
                          : "bg-opacity-50 hover:bg-opacity-100"
                      }
                    `}
                  >
                    {/* Lens icon */}
                    <svg
                      className="w-3 h-3 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>

                    {/* Lens name */}
                    <span
                      className={`text-[10px] uppercase tracking-wider font-normal flex-shrink-0`}
                    >
                      {card.lens}
                    </span>

                    {/* Title - Smooth reveal */}
                    <span
                      className={`text-xs font-normal whitespace-nowrap overflow-hidden transition-all duration-500 ease-out ${
                        isActive
                          ? "text-neutral-300 opacity-100 max-w-[200px] ml-1"
                          : "text-neutral-500 opacity-0 max-w-0 group-hover:opacity-90 group-hover:max-w-[200px] group-hover:ml-1 group-hover:text-neutral-400"
                      }`}
                    >
                      {card.title}
                    </span>

                    {/* Explore Arrow - Calm appearance */}
                    <svg
                      className={`w-2.5 h-2.5 flex-shrink-0 transition-all duration-500 ease-out ${
                        isActive
                          ? "text-neutral-500 opacity-60 ml-0.5"
                          : "text-neutral-600 opacity-0 -ml-2 group-hover:opacity-40 group-hover:ml-0.5"
                      }`}
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

                    {/* Active Indicator - Very subtle */}
                    {isActive && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-neutral-600/40 to-transparent" />
                    )}
                  </button>
                );
              })}
          </div>

          {/* Next Arrow */}
          <button
            onClick={() => {
              const newStart = Math.min(
                footer.cards.length - CARDS_VISIBLE,
                startIndex + 1,
              );
              setStartIndex(newStart);
            }}
            disabled={startIndex >= footer.cards.length - CARDS_VISIBLE}
            className={`flex-shrink-0 p-1 transition-opacity ${
              startIndex >= footer.cards.length - CARDS_VISIBLE
                ? "opacity-0 pointer-events-none"
                : "opacity-40 hover:opacity-100"
            }`}
          >
            <svg
              className="w-3 h-3 text-neutral-500"
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

        {/* Keyboard Hint - Appears on hover */}
        <div className="text-center mt-2 opacity-0 hover:opacity-100 transition-opacity">
          <p className="text-[9px] text-neutral-600">
            Hover to preview • Click to explore
          </p>
        </div>
      </div>
    </div>
  );
}
