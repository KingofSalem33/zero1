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
  semanticConnectionType?: string; // 🌟 GOLDEN THREAD: Type of connection from anchor (GOLD/PURPLE/CYAN/GREY)
}

export const VerseNode: React.FC<{ data: VerseNodeData }> = ({ data }) => {
  const {
    verse,
    isHighlighted,
    isAnchor,
    onShowParallels,
    depth,
    semanticConnectionType, // 🌟 GOLDEN THREAD: Semantic connection from anchor
  } = data;
  const [hasEntered, setHasEntered] = React.useState(false);

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

  // 🌟 GOLDEN THREAD: Semantic border/halo colors for first-degree nodes
  // These show the TYPE of connection from the anchor (revealed via node border, not edge color)
  const semanticGlowStyles: Record<
    string,
    { glow: string; border: string; animation?: string }
  > = {
    GOLD: {
      glow: "0 0 12px #FBBF24, 0 0 24px #F59E0B",
      border: "#D97706",
      animation: "glow-pulse-gold 3s ease-in-out infinite", // ✨ Subtle sparkle for lexical
    },
    PURPLE: {
      glow: "0 0 10px #A78BFA, 0 0 20px #7C3AED",
      border: "#7C3AED",
    },
    CYAN: {
      glow: "0 0 10px #22D3EE, 0 0 20px #0891B2",
      border: "#0891B2",
    },
    GREY: {
      glow: "0 0 6px #9CA3AF",
      border: "#6B7280",
    },
  };

  const isFirstDegree = nodeDepth === 1 && semanticConnectionType;
  const glowStyle = isFirstDegree
    ? semanticGlowStyles[semanticConnectionType]
    : null;
  let width: number, height: number, padding: string;

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

  return (
    <>
      {/* Glow pulse animation for anchor node */}
      {isAnchor && (
        <style>{`
          @keyframes glow-pulse {
            0%, 100% {
              box-shadow: 0 0 20px #FBBF24, 0 0 40px #F59E0B, 0 4px 15px rgba(0,0,0,0.3);
            }
            50% {
              box-shadow: 0 0 30px #FBBF24, 0 0 60px #F59E0B, 0 4px 20px rgba(0,0,0,0.4);
            }
          }
        `}</style>
      )}
      {/* 🌟 GOLDEN THREAD: Animation for lexical nodes (gold sparkle) */}
      {semanticConnectionType === "GOLD" && (
        <style>{`
          @keyframes glow-pulse-gold {
            0%, 100% {
              box-shadow: 0 0 12px #FBBF24, 0 0 24px #F59E0B;
            }
            50% {
              box-shadow: 0 0 18px #FBBF24, 0 0 36px #F59E0B, 0 0 2px #FFF;
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
          // 🌟 GOLDEN THREAD: Semantic glow for first-degree nodes (shows connection type)
          ...(!isAnchor &&
            glowStyle && {
              boxShadow: glowStyle.glow,
              borderColor: glowStyle.border,
              borderWidth: "2.5px",
              animation: glowStyle.animation, // Only GOLD has animation (sparkle effect)
            }),
          // Entrance animation
          opacity: hasEntered ? 1 : 0,
          transform: hasEntered
            ? "translateY(0) scale(1)"
            : "translateY(-10px) scale(0.95)",
          transition:
            "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), transform 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
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
          {verse.book_abbrev.toUpperCase()} {verse.chapter}:{verse.verse}
        </div>
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
        {verse.parallelPassages &&
          verse.parallelPassages.length > 0 &&
          onShowParallels && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowParallels(verse.id);
              }}
              className="absolute -top-2 -right-2 bg-purple-600 hover:bg-purple-700 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white shadow-md transition-all duration-150 ease-in-out hover:scale-110 hover:shadow-lg active:scale-95 cursor-pointer"
              title={`${verse.parallelPassages.length} parallel ${verse.parallelPassages.length === 1 ? "account" : "accounts"}`}
            >
              +{verse.parallelPassages.length}
            </button>
          )}
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </>
  );
};
