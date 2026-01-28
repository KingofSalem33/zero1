import { useState, useEffect, useRef } from "react";

interface VerseSearchIndicatorProps {
  verses: string[];
  isActive: boolean;
}

export function VerseSearchIndicator({
  verses,
  isActive,
}: VerseSearchIndicatorProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">(
    "entering",
  );
  const [displayedVerse, setDisplayedVerse] = useState<string | null>(null);
  const cycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize when becoming active
  useEffect(() => {
    if (!isActive) {
      setPhase("entering");
      setDisplayedVerse(null);
      setCurrentIndex(0);
      return;
    }

    // If we have verses, start with the first one
    if (verses.length > 0) {
      setDisplayedVerse(verses[0]);
      setCurrentIndex(0);
      setPhase("entering");
      const enterTimeout = setTimeout(() => setPhase("visible"), 30);
      return () => clearTimeout(enterTimeout);
    }
  }, [isActive, verses.length > 0]);

  // Cycle through verses when we have them
  useEffect(() => {
    if (!isActive || verses.length === 0 || phase !== "visible") return;

    cycleRef.current = setTimeout(() => {
      setPhase("exiting");

      transitionRef.current = setTimeout(() => {
        const next = (currentIndex + 1) % verses.length;
        setCurrentIndex(next);
        setDisplayedVerse(verses[next]);
        setPhase("entering");

        setTimeout(() => setPhase("visible"), 30);
      }, 250);
    }, 1000);

    return () => {
      if (cycleRef.current) clearTimeout(cycleRef.current);
      if (transitionRef.current) clearTimeout(transitionRef.current);
    };
  }, [isActive, verses, currentIndex, phase]);

  // Don't render if not active
  if (!isActive) return null;

  const getTransformClasses = () => {
    switch (phase) {
      case "entering":
        return "opacity-0 translate-y-1.5";
      case "visible":
        return "opacity-100 translate-y-0";
      case "exiting":
        return "opacity-0 -translate-y-1.5";
    }
  };

  const hasVerses = verses.length > 0 && displayedVerse;

  return (
    <div className="space-y-3">
      {/* Search indicator with shimmer */}
      <div className="relative inline-flex items-baseline gap-2 overflow-hidden">
        <span className="text-[13px] text-neutral-500">Searching</span>
        {hasVerses && (
          <span
            className={`
              text-[13px] font-medium text-neutral-200
              transition-all duration-250 ease-out
              ${getTransformClasses()}
            `}
          >
            {displayedVerse}
          </span>
        )}
        {/* Unified shimmer across text */}
        <div className="absolute inset-0 pointer-events-none animate-shimmer-flow" />
      </div>

      {/* Skeleton loader with shimmer */}
      <div className="space-y-2.5">
        <div className="relative h-4 bg-neutral-800/80 rounded w-3/4 overflow-hidden">
          <div className="absolute inset-0 animate-shimmer-flow" />
        </div>
        <div className="relative h-4 bg-neutral-800/80 rounded w-full overflow-hidden">
          <div
            className="absolute inset-0 animate-shimmer-flow"
            style={{ animationDelay: "0.1s" }}
          />
        </div>
        <div className="relative h-4 bg-neutral-800/80 rounded w-5/6 overflow-hidden">
          <div
            className="absolute inset-0 animate-shimmer-flow"
            style={{ animationDelay: "0.2s" }}
          />
        </div>
      </div>
    </div>
  );
}
