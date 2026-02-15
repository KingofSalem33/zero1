import React, { useState } from "react";
import { useBibleHighlightsContext } from "../contexts/BibleHighlightsContext";
import { HighlightCard } from "./HighlightCard";

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
              <HighlightCard
                key={highlight.id}
                highlight={highlight}
                onDelete={removeHighlight}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HighlightsLibrary;
