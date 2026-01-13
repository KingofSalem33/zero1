import React from "react";
import { Handle, Position } from "@xyflow/react";
import type { ThreadNode } from "../../types/goldenThread";

interface VerseNodeData {
  verse: ThreadNode;
  isHighlighted: boolean;
  isAnchor: boolean;
  collapsedChildCount: number;
  onExpand: () => void;
  onShowParallels?: (verseId: number) => void; // Show parallel passages modal
  depth?: number; // Depth from anchor for size scaling
  semanticConnectionType?: string; // 🌟 GOLDEN THREAD: Type of connection for this node (GOLD/PURPLE/CYAN/GREY)
  isDimmed?: boolean;
  branchHighlight?: { color: string; glowColor: string };
  discoveryPulseKey?: number;
  connectionCount?: number;
}

const normalizeToken = (value: string) =>
  value.toLowerCase().replace(/\s+/g, "");

const makeVerseKey = (book: string, chapter: number, verse: number) =>
  `${normalizeToken(book)}:${chapter}:${verse}`;

export const VerseNode: React.FC<{ data: VerseNodeData }> = ({ data }) => {
  const {
    verse,
    isHighlighted,
    isAnchor,
    onShowParallels,
    depth,
    semanticConnectionType, // 🌟 GOLDEN THREAD: Semantic connection for this node
    isDimmed,
    branchHighlight,
    discoveryPulseKey,
    connectionCount,
  } = data;
  const [hasEntered, setHasEntered] = React.useState(false);
  const [pulseActive, setPulseActive] = React.useState(false);

  // Trigger entrance animation on mount
  React.useEffect(() => {
    // Stagger entrance based on depth (if available)
    const depth = verse.depth || 0;
    const delay = Math.min(depth * 80, 800); // Cap at 800ms for deep nodes

    const timer = setTimeout(() => {
      setHasEntered(true);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  React.useEffect(() => {
    if (!discoveryPulseKey) return;
    setPulseActive(true);
    const timer = window.setTimeout(() => {
      setPulseActive(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [discoveryPulseKey]);

  // Enhanced styling for anchor node, compact for others
  const baseClasses =
    "rounded border cursor-pointer relative " +
    "transition-all duration-150 ease-in-out " +
    "hover:scale-105 hover:shadow-lg hover:z-10 " +
    "active:scale-98 active:transition-transform active:duration-75";

  const stateClasses = isAnchor
    ? "bg-yellow-400 border-yellow-600 text-black font-bold"
    : isHighlighted
      ? "bg-yellow-100 border-yellow-500 text-black font-semibold shadow-sm hover:shadow-md"
      : "bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400";

  // Node sizing based on depth from anchor
  // Anchor: 180x90 (full size)
  // Depth 1: 120x50 (medium)
  // Depth 2: 100x42 (smaller)
  // Depth 3+: 85x35 (smallest)
  const nodeDepth = depth || verse.depth || 1;
  const normalizedConnections =
    typeof connectionCount === "number" ? connectionCount : 0;
  const hubBoost = !isAnchor
    ? Math.min(Math.max(normalizedConnections - 2, 0), 10)
    : 0;
  const hubScale = 1 + hubBoost * 0.045;
  const showHubBadge = !isAnchor && !isDimmed && normalizedConnections >= 3;
  const hubRingIntensity = Math.min(hubBoost / 10, 1);
  const hubRingColor = `rgba(56, 189, 248, ${0.08 + hubRingIntensity * 0.18})`;
  const hubGlowColor = `rgba(56, 189, 248, ${0.12 + hubRingIntensity * 0.22})`;
  const uniqueParallelCount = React.useMemo(() => {
    const parallels = verse.parallelPassages || [];
    if (parallels.length === 0) return 0;
    const primaryBook = verse.book_name || verse.book_abbrev;
    const primaryKey = makeVerseKey(primaryBook, verse.chapter, verse.verse);
    const primaryTokens = [verse.book_name, verse.book_abbrev]
      .filter(Boolean)
      .map((value) => normalizeToken(value as string));
    const seen = new Set<string>();
    let count = 0;

    parallels.forEach((parallel) => {
      if (parallel.id === verse.id) return;
      const ref = parallel.reference ? normalizeToken(parallel.reference) : "";
      const verseToken = `${verse.chapter}:${verse.verse}`;
      if (ref && ref.includes(verseToken)) {
        if (primaryTokens.some((token) => ref.includes(token))) {
          return;
        }
      }
      const parallelBook = parallel.book_name || parallel.book_abbrev || "";
      const key = makeVerseKey(parallelBook, parallel.chapter, parallel.verse);
      if (key === primaryKey || seen.has(key)) return;
      seen.add(key);
      count += 1;
    });

    return count;
  }, [verse]);

  // 🌟 GOLDEN THREAD: Semantic border/halo colors for first-degree nodes
  // These show the TYPE of connection from the anchor (revealed via node border, not edge color)
  const semanticGlowStyles: Record<
    string,
    { glow: string; border: string; animation?: string }
  > = {
    GOLD: {
      glow: "0 0 8px #FBBF24, 0 0 14px #F59E0B",
      border: "#D97706",
      animation: "glow-pulse-gold 3s ease-in-out infinite", // ✨ Subtle sparkle for lexical
    },
    PURPLE: {
      glow: "0 0 6px #A78BFA, 0 0 12px #7C3AED",
      border: "#7C3AED",
    },
    CYAN: {
      glow: "0 0 6px #22D3EE, 0 0 12px #0891B2",
      border: "#0891B2",
    },
    GENEALOGY: {
      glow: "0 0 6px #34D399, 0 0 12px #10B981",
      border: "#10B981",
    },
    TYPOLOGY: {
      glow: "0 0 6px #F59E0B, 0 0 12px #EA580C",
      border: "#EA580C",
    },
    FULFILLMENT: {
      glow: "0 0 6px #5EEAD4, 0 0 12px #14B8A6",
      border: "#14B8A6",
    },
    CONTRAST: {
      glow: "0 0 6px #F87171, 0 0 12px #DC2626",
      border: "#DC2626",
    },
    PROGRESSION: {
      glow: "0 0 6px #4ADE80, 0 0 12px #16A34A",
      border: "#16A34A",
    },
    PATTERN: {
      glow: "0 0 6px #93C5FD, 0 0 12px #3B82F6",
      border: "#3B82F6",
    },
    GREY: {
      glow: "0 0 4px #9CA3AF",
      border: "#6B7280",
    },
  };

  const glowStyle = semanticConnectionType
    ? semanticGlowStyles[semanticConnectionType]
    : null;
  let width: number, height: number, padding: string;
  const bookLabel = verse.book_name || verse.book_abbrev.toUpperCase();
  const primaryLabel =
    verse.displayLabel ?? `${bookLabel} ${verse.chapter}:${verse.verse}`;
  const secondaryLabel = verse.displaySubLabel;

  if (isAnchor) {
    width = 180;
    height = 90;
    padding = "px-3 py-2";
  } else if (nodeDepth === 1) {
    width = 120;
    height = 50;
    padding = "px-2 py-1";
  } else if (nodeDepth === 2) {
    width = 100;
    height = 42;
    padding = "px-1.5 py-0.5";
  } else {
    width = 85;
    height = 35;
    padding = "px-1.5 py-0.5";
  }

  // Sprint 1: Scale node size by mass for hub prominence
  // Super-hubs (mass 5-8) get up to 40% larger, normal nodes (mass 1-2) stay at base size
  if (!isAnchor && verse.mass) {
    const massScale = 1 + (verse.mass - 1) * 0.06; // 1.0x at mass=1, 1.42x at mass=8
    width = Math.round(width * massScale);
    height = Math.round(height * massScale);
  }

  return (
    <>
      {/* Glow pulse animation for anchor node */}
      {isAnchor && (
        <style>{`
          @keyframes glow-pulse {
            0%, 100% {
              box-shadow: 0 0 14px #FBBF24, 0 0 26px #F59E0B, 0 2px 10px rgba(0,0,0,0.25);
            }
            50% {
              box-shadow: 0 0 18px #FBBF24, 0 0 32px #F59E0B, 0 3px 14px rgba(0,0,0,0.3);
            }
          }
        `}</style>
      )}
      {/* 🌟 GOLDEN THREAD: Animation for lexical nodes (gold sparkle) */}
      {semanticConnectionType === "GOLD" && (
        <style>{`
          @keyframes glow-pulse-gold {
            0%, 100% {
              box-shadow: 0 0 8px #FBBF24, 0 0 14px #F59E0B;
            }
            50% {
              box-shadow: 0 0 10px #FBBF24, 0 0 18px #F59E0B, 0 0 1px #FFF;
            }
          }
        `}</style>
      )}
      {pulseActive && (
        <style>{`
          @keyframes discovery-pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.55);
              opacity: 0.9;
            }
            70% {
              box-shadow: 0 0 12px 3px rgba(56, 189, 248, 0.25);
              opacity: 0.35;
            }
            100% {
              box-shadow: 0 0 0 0 rgba(56, 189, 248, 0);
              opacity: 0;
            }
          }
        `}</style>
      )}
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div
        className={`${baseClasses} ${stateClasses} ${padding}`}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          minWidth: `${width}px`,
          minHeight: `${height}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          boxSizing: "border-box",
          // Glowing border for anchor node with hover pulse animation
          ...(isAnchor && {
            boxShadow:
              "0 0 20px #FBBF24, 0 0 40px #F59E0B, 0 4px 15px rgba(0,0,0,0.3)",
            borderWidth: "3px",
            animation: "glow-pulse 2s ease-in-out infinite",
          }),
          // 🌟 GOLDEN THREAD: Semantic glow for connected nodes (shows connection type)
          ...(!isAnchor &&
            glowStyle && {
              boxShadow: glowStyle.glow,
              borderColor: glowStyle.border,
              borderWidth: "2.5px",
              animation: glowStyle.animation, // Only GOLD has animation (sparkle effect)
            }),
          ...(branchHighlight && {
            boxShadow: `0 0 10px ${branchHighlight.glowColor}, 0 0 5px ${branchHighlight.color}`,
            borderColor: branchHighlight.color,
            borderWidth: "3px",
            zIndex: 2,
          }),
          ...(isDimmed && {
            boxShadow: "none",
            borderColor: "#D1D5DB",
            borderWidth: "1px",
            animation: "none",
          }),
          // Entrance animation
          opacity: hasEntered ? (isDimmed ? 0.25 : 1) : 0,
          transform: hasEntered
            ? `translateY(0) scale(${hubScale})`
            : `translateY(-10px) scale(${hubScale * 0.95})`,
          transition:
            "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), transform 400ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 600ms ease, border-color 600ms ease",
        }}
      >
        {hubBoost > 0 && !isDimmed && !branchHighlight && (
          <span
            className="pointer-events-none absolute inset-[-6px] rounded-[14px]"
            style={{
              boxShadow: `0 0 0 1px ${hubRingColor}, 0 0 ${6 + hubBoost}px ${2 + hubBoost * 0.5}px ${hubGlowColor}`,
            }}
          />
        )}

        {pulseActive && (
          <span
            className="pointer-events-none absolute inset-0 rounded"
            style={{
              animation: "discovery-pulse 900ms ease-out",
            }}
          />
        )}
        {showHubBadge && (
          <span className="absolute -top-2 -left-2 min-w-[18px] h-[18px] px-1 rounded-full bg-neutral-950/90 text-cyan-100 text-[9px] font-semibold flex items-center justify-center border border-cyan-300/50 shadow-sm">
            {normalizedConnections}
          </span>
        )}
        <div
          className={
            isAnchor
              ? "text-[13px] font-mono font-bold whitespace-nowrap"
              : nodeDepth <= 1
                ? "text-[11px] font-mono font-semibold whitespace-nowrap"
                : nodeDepth === 2
                  ? "text-[10px] font-mono font-medium whitespace-nowrap"
                  : "text-[9px] font-mono font-medium whitespace-nowrap"
          }
        >
          {primaryLabel}
        </div>
        {secondaryLabel && (
          <div
            className={
              isAnchor
                ? "text-[10px] font-mono text-neutral-600 whitespace-nowrap"
                : nodeDepth <= 1
                  ? "text-[9px] font-mono text-neutral-600 whitespace-nowrap"
                  : nodeDepth === 2
                    ? "text-[8px] font-mono text-neutral-600 whitespace-nowrap"
                    : "text-[7px] font-mono text-neutral-600 whitespace-nowrap"
            }
          >
            {secondaryLabel}
          </div>
        )}
        {/* Show verse preview for anchor or highlighted nodes */}
        {(isAnchor || isHighlighted) && (
          <div
            className={
              isAnchor
                ? "text-[10px] mt-1 max-w-[170px] truncate leading-tight"
                : nodeDepth <= 1
                  ? "text-[9px] mt-0.5 max-w-[110px] truncate leading-tight"
                  : nodeDepth === 2
                    ? "text-[8px] mt-0.5 max-w-[95px] truncate leading-tight"
                    : "text-[7px] mt-0.5 max-w-[80px] truncate leading-tight"
            }
          >
            {isAnchor
              ? verse.text.substring(0, 50) +
                (verse.text.length > 50 ? "..." : "")
              : verse.text}
          </div>
        )}
        {/* Collapse/expand badges removed - map now starts fully expanded */}
        {/* User only sees parallel passage badges (purple, top-right) */}
        {uniqueParallelCount > 0 && onShowParallels && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowParallels(verse.id);
            }}
            className="absolute -top-2 -right-2 bg-purple-600 hover:bg-purple-700 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white shadow-md transition-all duration-150 ease-in-out hover:scale-110 hover:shadow-lg active:scale-95 cursor-pointer"
            title={`${uniqueParallelCount} parallel ${uniqueParallelCount === 1 ? "account" : "accounts"}`}
          >
            +{uniqueParallelCount}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </>
  );
};
