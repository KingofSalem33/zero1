import React, { useState, useEffect } from "react";

interface Card {
  lens: "PROPHECY" | "TYPOLOGY" | "THREAD" | "PATTERN" | "ROOTS" | "WORLD";
  title: string;
  prompt: string;
}

interface ChapterFooterData {
  orientation: string;
  cards: Card[];
}

interface ChapterFooterProps {
  book: string;
  chapter: number;
  onCardTap: (prompt: string) => void;
}

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

const LENS_COLORS = {
  PROPHECY: "text-purple-400 border-purple-400/30 bg-purple-400/5",
  TYPOLOGY: "text-rose-400 border-rose-400/30 bg-rose-400/5",
  THREAD: "text-amber-400 border-amber-400/30 bg-amber-400/5",
  PATTERN: "text-cyan-400 border-cyan-400/30 bg-cyan-400/5",
  ROOTS: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
  WORLD: "text-slate-400 border-slate-400/30 bg-slate-400/5",
};

export function ChapterFooter({
  book,
  chapter,
  onCardTap,
}: ChapterFooterProps) {
  const [footer, setFooter] = useState<ChapterFooterData | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  useEffect(() => {
    async function fetchFooter() {
      setCurrentCardIndex(0); // Reset to first card when chapter changes
      try {
        const response = await fetch(
          `${API_URL}/api/bible/chapter-footer?book=${encodeURIComponent(book)}&chapter=${chapter}`,
        );
        if (!response.ok) {
          return;
        }
        const data = await response.json();
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
    <div className="pt-6 pb-8">
      {/* Divider Line - Like a book section break */}
      <div className="max-w-3xl mx-auto mb-3">
        <div className="h-px bg-gradient-to-r from-transparent via-neutral-800/50 to-transparent" />
      </div>

      {/* Orientation - Centered, book-like */}
      <div className="max-w-3xl mx-auto mb-3 px-12">
        <p className="text-center text-neutral-500 text-[11px] leading-relaxed italic font-light">
          {footer.orientation}
        </p>
      </div>

      {/* All Cards Visible - Horizontal Scroll with Active State */}
      <div className="max-w-3xl mx-auto px-12">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {footer.cards.map((card, index) => {
            const isActive = index === currentCardIndex;
            const cardColorClass = LENS_COLORS[card.lens];

            return (
              <button
                key={index}
                onClick={() => {
                  setCurrentCardIndex(index);
                  onCardTap(card.prompt);
                }}
                onMouseEnter={() => setCurrentCardIndex(index)}
                className={`
                  group relative flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all duration-200
                  ${
                    isActive
                      ? "bg-neutral-800/40 border-neutral-700/60 scale-105"
                      : "bg-neutral-900/20 border-neutral-800/30 hover:bg-neutral-800/30 hover:border-neutral-700/50"
                  }
                `}
              >
                {/* Lens Badge */}
                <span
                  className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${cardColorClass} flex-shrink-0`}
                >
                  {card.lens}
                </span>

                {/* Title - Fades in when active or hovered */}
                <span
                  className={`text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? "text-neutral-200 opacity-100 max-w-xs"
                      : "text-neutral-500 opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-xs group-hover:text-neutral-300"
                  }`}
                >
                  {card.title}
                </span>

                {/* Explore Arrow - Shows on active */}
                <svg
                  className={`w-3 h-3 flex-shrink-0 transition-all duration-200 ${
                    isActive
                      ? "text-neutral-400 opacity-100"
                      : "text-neutral-600 opacity-0 w-0 group-hover:opacity-100 group-hover:w-3"
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

                {/* Active Indicator - Subtle underline */}
                {isActive && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-neutral-500 to-transparent" />
                )}
              </button>
            );
          })}
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
