import React, { useState } from "react";
import { useBibleHighlightsContext } from "../contexts/BibleHighlightsContext";

interface HighlightsLibraryProps {
  onNavigateToVerse?: (reference?: string) => void;
}

const HighlightsLibrary: React.FC<HighlightsLibraryProps> = ({
  onNavigateToVerse,
}) => {
  const { highlights, removeHighlight } = useBibleHighlightsContext();
  const [isLoading] = useState(false);

  // Sort highlights by createdAt (most recent first)
  const sortedHighlights = [...highlights].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const handleCardClick = () => {
    if (onNavigateToVerse) {
      // TODO: Navigate to specific verse once BibleReader supports it
      onNavigateToVerse();
    }
  };

  const handleDelete = (e: React.MouseEvent, highlightId: string) => {
    e.stopPropagation();
    removeHighlight(highlightId);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInHours < 24) {
      return "Today";
    } else if (diffInDays < 7) {
      return `${Math.floor(diffInDays)} day${Math.floor(diffInDays) !== 1 ? "s" : ""} ago`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header Skeleton */}
          <div className="mb-8">
            <div className="h-10 w-64 bg-neutral-800/50 rounded-lg animate-pulse mb-2" />
            <div className="h-6 w-96 bg-neutral-800/30 rounded-lg animate-pulse" />
          </div>

          {/* Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-neutral-900/50 border border-neutral-800/50 rounded-xl p-6 animate-pulse"
              >
                <div className="h-4 w-32 bg-neutral-800/50 rounded mb-3" />
                <div className="h-20 bg-neutral-800/30 rounded mb-4" />
                <div className="h-3 w-24 bg-neutral-800/30 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
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
        </div>

        {/* Highlights Grid */}
        {highlights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-24 h-24 rounded-full bg-neutral-800/30 flex items-center justify-center mb-6">
              <svg
                className="w-12 h-12 text-neutral-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-neutral-300 mb-2">
              No highlights yet
            </h3>
            <p className="text-neutral-500 text-center max-w-md">
              Open the Bible and select text to highlight verses. They'll appear
              here for easy reference.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedHighlights.map((highlight) => (
              <div
                key={highlight.id}
                onClick={handleCardClick}
                className="group bg-neutral-900/50 hover:bg-neutral-900/80 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-brand-primary-500/5 hover:scale-[1.02]"
              >
                {/* Header: Book, Chapter, Verse */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-brand-primary-300 font-semibold text-sm mb-0.5">
                      {highlight.book} {highlight.chapter}:{highlight.verse}
                    </h3>
                    <p className="text-neutral-500 text-xs">
                      {formatDate(highlight.createdAt)}
                    </p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(e, highlight.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-neutral-800/50 rounded-lg text-neutral-400 hover:text-red-400"
                    title="Delete highlight"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>

                {/* Highlighted Text */}
                <div
                  className="relative mb-3 p-3 rounded-lg border-l-4 bg-neutral-800/30"
                  style={{
                    borderLeftColor: highlight.color,
                    backgroundColor: `${highlight.color}15`,
                  }}
                >
                  <p className="text-neutral-200 text-sm leading-relaxed line-clamp-4">
                    {highlight.text}
                  </p>
                </div>

                {/* Footer: Color indicator */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full border border-neutral-700"
                    style={{ backgroundColor: highlight.color }}
                  />
                  <span className="text-neutral-500 text-xs">
                    Click to view in Bible
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HighlightsLibrary;
