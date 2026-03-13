import { useState, useEffect, useRef, useMemo, useCallback } from "react";

interface VerseSearchIndicatorProps {
  verses: string[];
  isActive: boolean;
  tracedText?: string;
  activeTools?: string[];
  completedTools?: string[];
}

// Constellation layout — radial rings around a central anchor
const NODE_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 50, y: 50 }, // anchor (center)
  { x: 26, y: 32 },
  { x: 74, y: 28 },
  { x: 78, y: 62 },
  { x: 22, y: 68 },
  { x: 50, y: 18 },
  { x: 50, y: 82 },
  { x: 14, y: 50 },
  { x: 86, y: 50 },
  { x: 34, y: 14 },
  { x: 66, y: 86 },
  { x: 85, y: 22 },
];

// Which node each new node connects to (index into NODE_POSITIONS)
const EDGE_TARGETS: number[] = [-1, 0, 0, 0, 0, 1, 3, 4, 2, 5, 6, 8];

type Phase = "searching" | "tracing" | "building";

function derivePhase(
  verses: string[],
  activeTools: string[],
  completedTools: string[],
): Phase {
  const totalTools = activeTools.length + completedTools.length;
  if (verses.length > 3 && totalTools > 0 && completedTools.length > 0) {
    return "building";
  }
  if (verses.length > 0) {
    return "tracing";
  }
  return "searching";
}

// Extract the book name from a verse reference like "Genesis 1:1" → "Genesis"
// Handles numbered books like "1 Corinthians 2:3" → "1 Corinthians"
function extractBookName(ref: string): string {
  const match = ref.match(/^(\d?\s?[A-Za-z]+(?:\s(?:of\s)?[A-Za-z]+)*)\s+\d/);
  return match ? match[1] : ref;
}

// Get unique book names from verse list, preserving discovery order
function getUniqueBooks(verses: string[]): string[] {
  const seen = new Set<string>();
  const books: string[] = [];
  for (const v of verses) {
    const book = extractBookName(v);
    if (!seen.has(book)) {
      seen.add(book);
      books.push(book);
    }
  }
  return books;
}

// Generate contextual micro-copy based on phase and discovered data
function buildContextualMessage(
  phase: Phase,
  verses: string[],
  books: string[],
): string {
  if (phase === "searching") {
    return "Searching Scripture";
  }

  if (phase === "building") {
    if (books.length > 2) {
      return `Weaving ${books.length} books into the map`;
    }
    return "Building the narrative map";
  }

  // "tracing" phase — rotate through contextual messages
  const count = verses.length;
  const latestBook = books[books.length - 1];

  if (books.length >= 3) {
    return `Threads found across ${books.length} books`;
  }
  if (count === 1 && latestBook) {
    return `Tracing through ${latestBook}`;
  }
  if (latestBook) {
    return `Found ${count} connections in ${latestBook}`;
  }
  return "Tracing connections";
}

const EXIT_DURATION = 400;

export function VerseSearchIndicator({
  verses,
  isActive,
  tracedText,
  activeTools = [],
  completedTools = [],
}: VerseSearchIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);
  // "mounted" keeps the component in the DOM during exit animation
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [messageText, setMessageText] = useState("Searching Scripture");
  const [messageTransition, setMessageTransition] = useState(false);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMessageRef = useRef<string>("Searching Scripture");

  const phase = derivePhase(verses, activeTools, completedTools);
  const visibleNodeCount = Math.min(verses.length, NODE_POSITIONS.length);
  const books = useMemo(() => getUniqueBooks(verses), [verses]);

  // Derive the contextual message
  const nextMessage = useMemo(
    () => buildContextualMessage(phase, verses, books),
    [phase, verses, books],
  );

  // Animate message text changes with crossfade
  useEffect(() => {
    if (nextMessage !== prevMessageRef.current) {
      setMessageTransition(true);
      messageTimerRef.current = setTimeout(() => {
        setMessageText(nextMessage);
        prevMessageRef.current = nextMessage;
        setMessageTransition(false);
      }, 200); // fade-out duration before swapping text
    }
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, [nextMessage]);

  // Mount/unmount lifecycle with smooth exit
  useEffect(() => {
    if (isActive) {
      // Clear any pending exit
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setExiting(false);
      setMounted(true);
      // Fade in on next frame
      const t = setTimeout(() => setIsVisible(true), 30);
      return () => clearTimeout(t);
    } else if (mounted) {
      // Start exit animation
      setExiting(true);
      setIsVisible(false);
      exitTimerRef.current = setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, EXIT_DURATION);
    }
  }, [isActive]);

  // Cleanup on unmount
  const cleanupExit = useCallback(() => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
  }, []);
  useEffect(() => cleanupExit, [cleanupExit]);

  // Build edges list for visible nodes
  const edges = useMemo(() => {
    const result: Array<{
      from: { x: number; y: number };
      to: { x: number; y: number };
      index: number;
    }> = [];
    for (let i = 1; i < visibleNodeCount; i++) {
      const targetIdx = EDGE_TARGETS[i] ?? 0;
      if (targetIdx >= 0 && targetIdx < visibleNodeCount) {
        result.push({
          from: NODE_POSITIONS[targetIdx],
          to: NODE_POSITIONS[i],
          index: i,
        });
      }
    }
    return result;
  }, [visibleNodeCount]);

  // Don't render if not mounted
  if (!mounted) return null;

  // Truncate traced text for display
  const displayText =
    tracedText && tracedText.length > 60
      ? tracedText.slice(0, 57) + "..."
      : tracedText;

  return (
    <div
      className="transition-all ease-out"
      style={{
        transitionDuration: exiting ? `${EXIT_DURATION}ms` : "300ms",
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? "translateY(0) scale(1)"
          : exiting
            ? "translateY(-8px) scale(0.97)"
            : "translateY(8px) scale(1)",
      }}
    >
      {/* Glassmorphism container */}
      <div className="bg-neutral-900/60 backdrop-blur-xl border border-white/5 rounded-xl p-5 max-w-md">
        {/* Gold header */}
        <div className="mb-3">
          <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500 font-medium">
            {displayText ? "Seeking" : "Seeking"}
          </span>
          <p className="text-[#D4AF37] text-sm font-semibold leading-snug mt-0.5 truncate">
            {displayText || "Connections across Scripture"}
          </p>
        </div>

        {/* Contextual micro-copy with crossfade */}
        <div className="relative h-5 mb-4 overflow-hidden">
          <span
            className="text-[13px] text-neutral-400 font-medium transition-all duration-200 ease-out absolute flex items-center"
            style={{
              opacity: messageTransition ? 0 : 1,
              transform: messageTransition
                ? "translateY(-6px)"
                : "translateY(0)",
            }}
          >
            {messageText}
            <span className="inline-flex ml-1.5 gap-0.5">
              <span
                className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse"
                style={{ animationDelay: "200ms" }}
              />
              <span
                className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse"
                style={{ animationDelay: "400ms" }}
              />
            </span>
          </span>
        </div>

        {/* Animated constellation SVG — rectangles matching map/overlay style */}
        <div className="relative w-full h-[160px] mb-3">
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Edges — drawn lines connecting nodes */}
            {edges.map((edge) => {
              const dx = edge.to.x - edge.from.x;
              const dy = edge.to.y - edge.from.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              return (
                <line
                  key={`edge-${edge.index}`}
                  x1={edge.from.x}
                  y1={edge.from.y}
                  x2={edge.to.x}
                  y2={edge.to.y}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth={0.6}
                  strokeDasharray={length}
                  style={{
                    animation: `edge-draw 0.6s ease-out ${edge.index * 0.15}s both`,
                    strokeDashoffset: length,
                  }}
                />
              );
            })}

            {/* All nodes start as faint placeholders */}
            {NODE_POSITIONS.map((pos, i) => (
              <rect
                key={`bg-${i}`}
                x={pos.x - 4}
                y={pos.y - 2}
                width={8}
                height={4}
                rx={1.5}
                fill="rgba(255, 255, 255, 0.03)"
              />
            ))}

            {/* Discovered nodes — stroke outlines that explode in */}
            {NODE_POSITIONS.slice(0, visibleNodeCount).map((pos, i) => {
              const isLatest = i === visibleNodeCount - 1 && i > 0;
              return (
                <g key={`node-${i}`}>
                  <rect
                    x={pos.x - 4}
                    y={pos.y - 2}
                    width={8}
                    height={4}
                    rx={1.5}
                    fill="none"
                    stroke="rgba(212, 175, 55, 0.65)"
                    strokeWidth={0.5}
                    style={{
                      animation: `node-appear 0.4s ease-out ${i * 0.15}s both`,
                      transformOrigin: `${pos.x}px ${pos.y}px`,
                    }}
                  />
                  {isLatest && (
                    <rect
                      x={pos.x - 5.5}
                      y={pos.y - 3.5}
                      width={11}
                      height={7}
                      rx={2}
                      fill="none"
                      stroke="rgba(212, 175, 55, 0.35)"
                      strokeWidth={0.5}
                      style={{
                        animation: "node-pulse 1.5s ease-in-out infinite",
                      }}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Bottom row: verse count + gold progress bar */}
        <div className="space-y-2">
          {/* Verse count + latest book */}
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-neutral-500">
              {verses.length > 0 ? (
                <>
                  <span className="text-neutral-300 font-medium tabular-nums">
                    {verses.length}
                  </span>{" "}
                  verse{verses.length === 1 ? "" : "s"} connected
                </>
              ) : (
                "Discovering verses"
              )}
            </span>

            {/* Latest verse reference */}
            {verses.length > 0 && (
              <span className="text-[11px] text-[#D4AF37]/70 font-medium truncate max-w-[140px]">
                {verses[verses.length - 1]}
              </span>
            )}
          </div>

          {/* Gold progress bar (indeterminate) */}
          <div className="relative h-[2px] bg-white/5 rounded-full overflow-hidden">
            <div className="absolute inset-0 animate-gold-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}
