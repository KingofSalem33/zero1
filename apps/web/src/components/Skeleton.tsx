import React from "react";

/**
 * Base skeleton building blocks with pulse animation.
 * Compose these to match the shape of your loading content.
 */

interface SkeletonProps {
  className?: string;
}

/** Rectangular skeleton block with shimmer effect */
export const SkeletonBox: React.FC<
  SkeletonProps & {
    width?: string;
    height?: string;
  }
> = ({ className = "", width, height }) => (
  <div className={`skeleton ${className}`} style={{ width, height }} />
);

/** Text line skeleton - mimics a line of text */
export const SkeletonLine: React.FC<
  SkeletonProps & {
    width?: string;
  }
> = ({ className = "", width = "100%" }) => (
  <div className={`h-4 skeleton ${className}`} style={{ width }} />
);

/** Circle skeleton - for avatars, icons */
export const SkeletonCircle: React.FC<
  SkeletonProps & {
    size?: string;
  }
> = ({ className = "", size = "2.5rem" }) => (
  <div
    className={`skeleton rounded-full ${className}`}
    style={{ width: size, height: size }}
  />
);

/**
 * Bible verse skeleton - matches the verse layout in BibleReader
 * Shows verse number + text lines
 */
export const BibleVerseSkeleton: React.FC<{
  verseNumber: number;
  lineCount?: number;
  isFirstOfParagraph?: boolean;
}> = ({ verseNumber, lineCount = 2, isFirstOfParagraph = false }) => (
  <span className={`inline ${isFirstOfParagraph ? "ml-8" : ""}`}>
    {/* Verse number */}
    <sup className="text-brand-primary-400/30 font-semibold text-[11px] mr-1.5">
      {verseNumber}
    </sup>
    {/* Text placeholder - inline spans to mimic text flow */}
    {Array.from({ length: lineCount }).map((_, i) => (
      <span
        key={i}
        className="inline-block h-[1.1em] bg-neutral-800/60 rounded animate-pulse mr-1"
        style={{
          width: `${Math.random() * 40 + 60}%`,
          animationDelay: `${(verseNumber * 50 + i * 100) % 1000}ms`,
        }}
      />
    ))}{" "}
  </span>
);

/**
 * Full Bible chapter skeleton - shows header + multiple verse skeletons
 */
export const BibleChapterSkeleton: React.FC<{
  bookName?: string;
  chapterNumber?: number;
  verseCount?: number;
}> = ({ bookName = "", chapterNumber = 0, verseCount = 20 }) => (
  <div className="space-y-8">
    {/* Chapter Header */}
    <div className="text-center pb-10 border-b border-brand-primary-500/20">
      {bookName ? (
        <h1 className="text-5xl font-sans font-medium text-[#E8E8E8]/30 tracking-wide mb-3 drop-shadow-sm">
          {bookName}
        </h1>
      ) : (
        <div className="h-12 w-48 mx-auto bg-neutral-800 rounded animate-pulse mb-3" />
      )}
      {chapterNumber ? (
        <div className="text-7xl font-sans font-light text-brand-primary-400/30 mt-4">
          {chapterNumber}
        </div>
      ) : (
        <div className="h-16 w-20 mx-auto bg-neutral-800 rounded animate-pulse mt-4" />
      )}
    </div>

    {/* Verses container */}
    <div className="bg-gradient-to-b from-neutral-900/40 to-neutral-950/60 rounded-2xl p-12 border border-neutral-800/30 shadow-2xl">
      <div className="text-justify leading-[2.4]">
        {Array.from({ length: verseCount }).map((_, i) => {
          const verseNum = i + 1;
          const isNewParagraph =
            verseNum === 1 || (verseNum % 4 === 1 && verseNum > 1);
          return (
            <React.Fragment key={i}>
              {isNewParagraph && verseNum > 1 && (
                <>
                  <br />
                  <br />
                </>
              )}
              <BibleVerseSkeleton
                verseNumber={verseNum}
                lineCount={Math.floor(Math.random() * 2) + 1}
                isFirstOfParagraph={isNewParagraph}
              />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  </div>
);

/**
 * Library connection card skeleton - matches the card layout in LibraryView
 */
export const LibraryCardSkeleton: React.FC = () => (
  <div className="bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-lg shadow-xl overflow-hidden p-3">
    {/* Connection type badge */}
    <div className="flex items-center gap-2 mb-2">
      <div className="w-2 h-2 rounded-full skeleton" />
      <div className="h-3 w-20 skeleton" />
      <div className="h-3 w-8 skeleton" />
    </div>

    {/* Verse badges */}
    <div className="flex flex-wrap gap-2 mb-3">
      <div className="h-6 w-24 skeleton rounded-full" />
      <div className="h-6 w-28 skeleton rounded-full" />
    </div>

    {/* Synopsis text lines */}
    <div className="space-y-2 mb-3">
      <div className="h-3 w-full skeleton" />
      <div className="h-3 w-full skeleton" />
      <div className="h-3 w-3/4 skeleton" />
    </div>

    {/* Go Deeper button placeholder */}
    <div className="h-7 w-24 skeleton rounded-md" />
  </div>
);

/**
 * Library grid skeleton - shows multiple card skeletons in a grid
 */
export const LibraryGridSkeleton: React.FC<{ count?: number }> = ({
  count = 6,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{ animationDelay: `${i * 100}ms` }}>
        <LibraryCardSkeleton />
      </div>
    ))}
  </div>
);

/**
 * Chat message skeleton - for loading chat messages
 */
export const ChatMessageSkeleton: React.FC<{ isUser?: boolean }> = ({
  isUser = false,
}) => (
  <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
    {/* Avatar */}
    <SkeletonCircle size="2rem" className="flex-shrink-0" />

    {/* Message content */}
    <div className={`flex-1 max-w-[80%] ${isUser ? "items-end" : ""}`}>
      <div
        className={`p-4 rounded-2xl ${
          isUser ? "bg-brand-primary-500/20 ml-auto" : "bg-neutral-800/50"
        }`}
        style={{ maxWidth: isUser ? "70%" : "100%" }}
      >
        <div className="space-y-2">
          <div className="h-3 w-full skeleton" />
          <div className="h-3 w-5/6 skeleton" />
          {!isUser && (
            <>
              <div className="h-3 w-full skeleton" />
              <div className="h-3 w-2/3 skeleton" />
            </>
          )}
        </div>
      </div>
    </div>
  </div>
);

/**
 * Highlight card skeleton - for library highlights tab
 */
export const HighlightCardSkeleton: React.FC = () => (
  <div className="bg-neutral-900/50 border border-neutral-800/50 rounded-xl p-5">
    {/* Header with reference and date */}
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="h-4 w-28 skeleton mb-1" />
        <div className="h-3 w-16 skeleton" />
      </div>
    </div>

    {/* Highlighted text block */}
    <div className="relative mb-3 p-3 rounded-lg border-l-4 border-neutral-600 bg-neutral-800/30">
      <div className="space-y-2">
        <div className="h-3 w-full skeleton" />
        <div className="h-3 w-full skeleton" />
        <div className="h-3 w-4/5 skeleton" />
      </div>
    </div>

    {/* Footer */}
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full skeleton" />
      <div className="h-3 w-24 skeleton" />
    </div>
  </div>
);

/**
 * Map list item skeleton - for library maps tab
 */
export const MapListItemSkeleton: React.FC = () => (
  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4">
    <div className="flex items-center justify-between mb-2">
      <div className="h-3 w-16 skeleton" />
    </div>
    <div className="h-4 w-32 skeleton mb-1" />
    <div className="h-3 w-40 skeleton mt-1" />
    <div className="mt-3">
      <div className="h-7 w-24 skeleton rounded bg-blue-500/10" />
    </div>
  </div>
);
