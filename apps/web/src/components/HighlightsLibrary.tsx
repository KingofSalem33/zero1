import React, { useMemo, useState, useCallback } from "react";
import {
  useBibleHighlightsContext,
  formatVerseRange,
  HIGHLIGHT_COLORS,
} from "../contexts/BibleHighlightsContext";
import type { BibleHighlight } from "../contexts/BibleHighlightsContext";
import { HighlightCard } from "./HighlightCard";
import { HighlightHeatmap } from "./HighlightHeatmap";
import { HighlightConnections } from "./HighlightConnections";
import { BIBLE_BOOKS } from "../utils/bibleReference";

// --- Sort / filter types ---
type SortField = "date" | "book" | "color";
type SortDir = "asc" | "desc";

const BOOK_ORDER = new Map(BIBLE_BOOKS.map((b, i) => [b, i]));
const COLOR_LABEL_MAP = new Map(HIGHLIGHT_COLORS.map((c) => [c.value, c.name]));

function bookIndex(book: string): number {
  return BOOK_ORDER.get(book) ?? 999;
}

function colorLabel(hex: string): string {
  return COLOR_LABEL_MAP.get(hex) || hex;
}

// --- Component ---

interface HighlightsLibraryProps {
  onNavigateToVerse?: (reference?: string) => void;
}

const HighlightsLibrary: React.FC<HighlightsLibraryProps> = ({
  onNavigateToVerse,
}) => {
  const { highlights, removeHighlight, updateHighlight, syncState } =
    useBibleHighlightsContext();

  // Search & filter state
  const [search, setSearch] = useState("");
  const [filterBook, setFilterBook] = useState<string>("all");
  const [filterColor, setFilterColor] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Unique books in highlights for filter dropdown
  const bookOptions = useMemo(() => {
    const books = [...new Set(highlights.map((h) => h.book))];
    return books.sort((a, b) => bookIndex(a) - bookIndex(b));
  }, [highlights]);

  // Unique colors in highlights for filter
  const colorOptions = useMemo(
    () => [...new Set(highlights.map((h) => h.color))],
    [highlights],
  );

  // Filter + search + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    const result = highlights.filter((h) => {
      if (filterBook !== "all" && h.book !== filterBook) return false;
      if (filterColor !== "all" && h.color !== filterColor) return false;
      if (q) {
        const ref =
          `${h.book} ${h.chapter}:${formatVerseRange(h.verses)}`.toLowerCase();
        const matchesText = h.text.toLowerCase().includes(q);
        const matchesNote = h.note?.toLowerCase().includes(q);
        const matchesRef = ref.includes(q);
        if (!matchesText && !matchesNote && !matchesRef) return false;
      }
      return true;
    });

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "book") {
        cmp = bookIndex(a.book) - bookIndex(b.book);
        if (cmp === 0) cmp = a.chapter - b.chapter;
        if (cmp === 0) cmp = (a.verses[0] || 0) - (b.verses[0] || 0);
      } else if (sortField === "color") {
        cmp = a.color.localeCompare(b.color);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [highlights, search, filterBook, filterColor, sortField, sortDir]);

  const handleCardClick = useCallback(
    (h: BibleHighlight) => {
      if (h.source === "chat" || !onNavigateToVerse) return;
      const ref = `${h.book} ${h.chapter}:${formatVerseRange(h.verses)}`;
      onNavigateToVerse(ref);
    },
    [onNavigateToVerse],
  );

  const handleUpdateNote = useCallback(
    (id: string, note: string) => {
      updateHighlight(id, { note: note || undefined });
    },
    [updateHighlight],
  );

  const handleUpdateColor = useCallback(
    (id: string, color: string) => {
      updateHighlight(id, { color });
    },
    [updateHighlight],
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  };

  const hasFilters = search || filterBook !== "all" || filterColor !== "all";

  const handleExport = useCallback(
    (format: "json" | "text") => {
      const data = filtered.length > 0 ? filtered : highlights;
      let content: string;
      let filename: string;
      let mime: string;

      if (format === "json") {
        content = JSON.stringify(data, null, 2);
        filename = "biblelot-highlights.json";
        mime = "application/json";
      } else {
        content = data
          .map((h) => {
            const ref =
              h.source === "chat"
                ? "Saved from Chat"
                : `${h.book} ${h.chapter}:${formatVerseRange(h.verses)}`;
            let line = `${ref}\n"${h.text}"`;
            if (h.note) line += `\nNote: ${h.note}`;
            return line;
          })
          .join("\n\n---\n\n");
        filename = "biblelot-highlights.txt";
        mime = "text/plain";
      }

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [filtered, highlights],
  );

  return (
    <div className="min-h-screen bg-black p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <svg
                className="w-8 h-8 text-brand-primary-400"
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
              Your Highlights
            </h1>
            <p className="text-neutral-400 text-lg">
              {highlights.length === 0
                ? "No highlights yet. Start highlighting verses in the Bible to save them here."
                : `${highlights.length} highlight${highlights.length !== 1 ? "s" : ""} saved`}
            </p>
            {/* Sync status indicator */}
            {syncState.status !== "idle" && (
              <div className="flex items-center gap-1.5 mt-1.5">
                {syncState.status === "syncing" && (
                  <>
                    <svg
                      className="w-3 h-3 text-[#D4AF37] animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span className="text-xs text-neutral-500">Syncing...</span>
                  </>
                )}
                {syncState.status === "synced" && (
                  <>
                    <svg
                      className="w-3 h-3 text-emerald-500"
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
                    <span className="text-xs text-neutral-500">
                      Synced to cloud
                    </span>
                  </>
                )}
                {syncState.status === "error" && (
                  <>
                    <svg
                      className="w-3 h-3 text-red-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01M12 3l9.66 16.59A1 1 0 0120.66 21H3.34a1 1 0 01-.86-1.41L12 3z"
                      />
                    </svg>
                    <span className="text-xs text-red-400">Sync failed</span>
                  </>
                )}
                {syncState.status === "offline" && (
                  <>
                    <svg
                      className="w-3 h-3 text-neutral-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728"
                      />
                      <line
                        x1="4"
                        y1="4"
                        x2="20"
                        y2="20"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-xs text-neutral-600">Local only</span>
                  </>
                )}
              </div>
            )}
          </div>
          {highlights.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => handleExport("text")}
                className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/10 border border-white/10 rounded-md text-xs text-neutral-400 hover:text-neutral-200 transition-colors flex items-center gap-1.5"
                title="Export as formatted text"
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Export
              </button>
              <button
                onClick={() => handleExport("json")}
                className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/10 border border-white/10 rounded-md text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                title="Export as JSON (for backup)"
              >
                JSON
              </button>
            </div>
          )}
        </div>

        {/* Search, Filter & Sort Bar */}
        {highlights.length > 0 && (
          <div className="mb-6 space-y-3">
            {/* Search */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search highlights..."
                aria-label="Search highlights by text, notes, or reference"
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.05] border border-white/10 rounded-lg text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-[#D4AF37]/30 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                >
                  <svg
                    className="w-4 h-4"
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
              )}
            </div>

            {/* Filters + Sort row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Book filter */}
              {bookOptions.length > 1 && (
                <select
                  value={filterBook}
                  onChange={(e) => setFilterBook(e.target.value)}
                  aria-label="Filter by book"
                  className="px-3 py-1.5 bg-white/[0.05] border border-white/10 rounded-md text-xs text-neutral-300 focus:outline-none focus:border-[#D4AF37]/30 appearance-none cursor-pointer"
                >
                  <option value="all">All Books</option>
                  {bookOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              )}

              {/* Color filter */}
              {colorOptions.length > 1 && (
                <div
                  className="flex items-center gap-1"
                  role="group"
                  aria-label="Filter by color"
                >
                  <button
                    onClick={() => setFilterColor("all")}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      filterColor === "all"
                        ? "border-white/40"
                        : "border-transparent hover:border-white/20"
                    }`}
                    title="All colors"
                    aria-label="Show all colors"
                    aria-pressed={filterColor === "all"}
                  >
                    <span className="text-[8px] text-neutral-400">All</span>
                  </button>
                  {colorOptions.map((c) => (
                    <button
                      key={c}
                      onClick={() =>
                        setFilterColor(filterColor === c ? "all" : c)
                      }
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        filterColor === c
                          ? "border-white/60 scale-110"
                          : "border-transparent hover:border-white/30"
                      }`}
                      style={{ backgroundColor: c }}
                      title={colorLabel(c)}
                      aria-label={`Filter by ${colorLabel(c)}`}
                      aria-pressed={filterColor === c}
                    />
                  ))}
                </div>
              )}

              {/* Sort buttons */}
              <div
                className="flex items-center gap-1 ml-auto"
                role="group"
                aria-label="Sort highlights"
              >
                <span
                  className="text-neutral-600 text-[10px] uppercase tracking-wider mr-1"
                  aria-hidden="true"
                >
                  Sort
                </span>
                {(["date", "book", "color"] as SortField[]).map((field) => (
                  <button
                    key={field}
                    onClick={() => toggleSort(field)}
                    aria-label={`Sort by ${field}${sortField === field ? `, ${sortDir === "asc" ? "ascending" : "descending"}` : ""}`}
                    aria-pressed={sortField === field}
                    className={`px-2 py-1 text-[11px] rounded transition-colors ${
                      sortField === field
                        ? "bg-white/10 text-neutral-200"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                    {sortField === field && (
                      <span className="ml-0.5">
                        {sortDir === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Active filter summary */}
            {hasFilters && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-500 text-xs">
                  {filtered.length} of {highlights.length} highlights
                </span>
                <button
                  onClick={() => {
                    setSearch("");
                    setFilterBook("all");
                    setFilterColor("all");
                  }}
                  className="text-xs text-[#D4AF37] hover:text-[#F0D77F] transition-colors"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Heatmap & Connections (visible when highlights exist and no search active) */}
        {highlights.length >= 3 && !search && (
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HighlightHeatmap
              highlights={highlights}
              onBookClick={(book) => setFilterBook(book)}
            />
            <HighlightConnections
              highlights={highlights}
              onNavigateToVerse={onNavigateToVerse}
            />
          </div>
        )}

        {/* Highlights Grid */}
        {highlights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            {/* Illustrated empty state — page with highlighted lines */}
            <div className="relative">
              <svg
                viewBox="0 0 200 160"
                fill="none"
                className="w-48 h-40"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient
                    id="hl-yellow"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.4" />
                  </linearGradient>
                  <linearGradient
                    id="hl-green"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#34D399" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.3" />
                  </linearGradient>
                  <linearGradient
                    id="hl-blue"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.3" />
                  </linearGradient>
                  <filter
                    id="hl-glow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Page background */}
                <rect
                  x="50"
                  y="25"
                  width="100"
                  height="110"
                  rx="4"
                  fill="#1f1f1f"
                  stroke="#3f3f3f"
                  strokeWidth="1"
                />

                {/* Text lines with color highlights */}
                <rect
                  x="60"
                  y="40"
                  width="70"
                  height="8"
                  rx="1"
                  fill="url(#hl-yellow)"
                  filter="url(#hl-glow)"
                >
                  <animate
                    attributeName="opacity"
                    values="0.7;1;0.7"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </rect>
                <rect
                  x="60"
                  y="42"
                  width="70"
                  height="4"
                  rx="0.5"
                  fill="#525252"
                  opacity="0.3"
                />

                <rect
                  x="60"
                  y="54"
                  width="80"
                  height="4"
                  rx="0.5"
                  fill="#404040"
                />

                <rect
                  x="60"
                  y="64"
                  width="55"
                  height="8"
                  rx="1"
                  fill="url(#hl-green)"
                  filter="url(#hl-glow)"
                >
                  <animate
                    attributeName="opacity"
                    values="0.6;0.9;0.6"
                    dur="2.5s"
                    repeatCount="indefinite"
                  />
                </rect>
                <rect
                  x="60"
                  y="66"
                  width="55"
                  height="4"
                  rx="0.5"
                  fill="#525252"
                  opacity="0.3"
                />

                <rect
                  x="60"
                  y="78"
                  width="75"
                  height="4"
                  rx="0.5"
                  fill="#404040"
                />

                <rect
                  x="60"
                  y="88"
                  width="65"
                  height="8"
                  rx="1"
                  fill="url(#hl-blue)"
                  filter="url(#hl-glow)"
                >
                  <animate
                    attributeName="opacity"
                    values="0.5;0.85;0.5"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </rect>
                <rect
                  x="60"
                  y="90"
                  width="65"
                  height="4"
                  rx="0.5"
                  fill="#525252"
                  opacity="0.3"
                />

                <rect
                  x="60"
                  y="102"
                  width="60"
                  height="4"
                  rx="0.5"
                  fill="#404040"
                />
                <rect
                  x="60"
                  y="112"
                  width="40"
                  height="4"
                  rx="0.5"
                  fill="#404040"
                />

                {/* Pen icon */}
                <g transform="translate(130, 82) rotate(45)" opacity="0.7">
                  <rect
                    x="0"
                    y="0"
                    width="6"
                    height="35"
                    rx="1"
                    fill="#D4AF37"
                  />
                  <rect
                    x="0"
                    y="30"
                    width="6"
                    height="8"
                    rx="1"
                    fill="#78716C"
                  />
                  <rect
                    x="1"
                    y="0"
                    width="4"
                    height="4"
                    rx="0.5"
                    fill="#FDE68A"
                    opacity="0.6"
                  />
                </g>
              </svg>
              {/* Glow behind */}
              <div
                className="absolute inset-0 -z-10 opacity-30 blur-3xl"
                style={{
                  background:
                    "radial-gradient(circle, #D4AF37 0%, transparent 70%)",
                }}
              />
            </div>

            <div className="text-center max-w-sm space-y-2">
              <h3 className="text-lg font-semibold text-neutral-200">
                No highlights yet
              </h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Select any verse while reading and choose a color to highlight
                it. Your marked passages will appear here for easy reference.
              </p>
            </div>

            {onNavigateToVerse && (
              <button
                onClick={() => onNavigateToVerse()}
                className="group mt-2 px-6 py-3 bg-gradient-to-r from-[#D4AF37]/20 to-[#D4AF37]/10 hover:from-[#D4AF37]/30 hover:to-[#D4AF37]/20 border border-[#D4AF37]/30 hover:border-[#D4AF37]/50 text-[#D4AF37] rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2"
              >
                <span>Start Reading</span>
                <svg
                  className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-neutral-500 text-sm">
              No highlights match your filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((highlight) => (
              <div
                key={highlight.id}
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "auto 200px",
                }}
              >
                <HighlightCard
                  highlight={highlight}
                  onDelete={removeHighlight}
                  onUpdateNote={handleUpdateNote}
                  onUpdateColor={handleUpdateColor}
                  onClick={() => handleCardClick(highlight)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HighlightsLibrary;
