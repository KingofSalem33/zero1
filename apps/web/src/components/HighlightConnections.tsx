import React, { useMemo, useState } from "react";
import {
  formatVerseRange,
  type BibleHighlight,
} from "../contexts/BibleHighlightsContext";

interface HighlightConnectionsProps {
  highlights: BibleHighlight[];
  onNavigateToVerse?: (reference: string) => void;
}

interface ConnectionGroup {
  label: string;
  description: string;
  highlights: BibleHighlight[];
}

export function HighlightConnections({
  highlights,
  onNavigateToVerse,
}: HighlightConnectionsProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const connections = useMemo(() => {
    if (highlights.length < 2) return [];

    const groups: ConnectionGroup[] = [];

    // 1. Same-chapter clusters (multiple highlights in one chapter)
    const chapterMap = new Map<string, BibleHighlight[]>();
    for (const h of highlights) {
      const key = `${h.book}|${h.chapter}`;
      const arr = chapterMap.get(key) || [];
      arr.push(h);
      chapterMap.set(key, arr);
    }
    for (const [key, items] of chapterMap) {
      if (items.length >= 2) {
        const [book, chapter] = key.split("|");
        groups.push({
          label: `${book} ${chapter}`,
          description: `${items.length} highlights in this chapter`,
          highlights: items.sort(
            (a, b) => (a.verses[0] || 0) - (b.verses[0] || 0),
          ),
        });
      }
    }

    // 2. Color theme groups (same color across different books)
    const colorMap = new Map<string, BibleHighlight[]>();
    for (const h of highlights) {
      const arr = colorMap.get(h.color) || [];
      arr.push(h);
      colorMap.set(h.color, arr);
    }
    for (const [color, items] of colorMap) {
      const uniqueBooks = new Set(items.map((h) => h.book));
      if (uniqueBooks.size >= 2) {
        groups.push({
          label: `${getColorName(color)} theme`,
          description: `${items.length} highlights across ${uniqueBooks.size} books`,
          highlights: items,
        });
      }
    }

    // 3. Same-book clusters (highlights spread across a book)
    const bookMap = new Map<string, BibleHighlight[]>();
    for (const h of highlights) {
      const arr = bookMap.get(h.book) || [];
      arr.push(h);
      bookMap.set(h.book, arr);
    }
    for (const [book, items] of bookMap) {
      const uniqueChapters = new Set(items.map((h) => h.chapter));
      if (uniqueChapters.size >= 3) {
        groups.push({
          label: `${book} study`,
          description: `${items.length} highlights across ${uniqueChapters.size} chapters`,
          highlights: items.sort((a, b) => a.chapter - b.chapter),
        });
      }
    }

    return groups;
  }, [highlights]);

  if (connections.length === 0) return null;

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4">
      <h3 className="text-neutral-300 text-sm font-medium mb-3">Connections</h3>
      <div className="space-y-2">
        {connections.map((group) => {
          const isExpanded = expandedGroup === group.label;
          return (
            <div key={group.label}>
              <button
                onClick={() =>
                  setExpandedGroup(isExpanded ? null : group.label)
                }
                aria-expanded={isExpanded}
                aria-label={`${group.label}: ${group.description}`}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
              >
                <div>
                  <span className="text-neutral-200 text-xs font-medium">
                    {group.label}
                  </span>
                  <span className="text-neutral-500 text-[11px] ml-2">
                    {group.description}
                  </span>
                </div>
                <svg
                  className={`w-3.5 h-3.5 text-neutral-500 transition-transform duration-150 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {isExpanded && (
                <div className="mt-1 ml-3 border-l border-white/5 pl-3 space-y-1">
                  {group.highlights.map((h) => {
                    const ref = `${h.book} ${h.chapter}:${formatVerseRange(h.verses)}`;
                    return (
                      <button
                        key={h.id}
                        onClick={() => onNavigateToVerse?.(ref)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-white/[0.05] transition-colors flex items-center gap-2"
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: h.color }}
                        />
                        <span className="text-neutral-300 text-[11px]">
                          {ref}
                        </span>
                        <span className="text-neutral-600 text-[10px] truncate flex-1">
                          {h.text.slice(0, 60)}
                          {h.text.length > 60 ? "..." : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const COLOR_NAMES: Record<string, string> = {
  "#FEF3C7": "Yellow",
  "#D1FAE5": "Green",
  "#DBEAFE": "Blue",
  "#FCE7F3": "Pink",
  "#EDE9FE": "Purple",
};

function getColorName(hex: string): string {
  return COLOR_NAMES[hex] || "Custom";
}
