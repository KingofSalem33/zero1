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
  enableSemanticGlow?: boolean;
  semanticConnectionType?: string; // Connection type for this node (GOLD/PURPLE/CYAN/GREY)
  isDimmed?: boolean;
  branchHighlight?: { color: string; glowColor: string };
  discoveryPulseKey?: number;
  connectionCount?: number;
}

const normalizeToken = (value: string) =>
  value.toLowerCase().replace(/\s+/g, "");

const makeVerseKey = (book: string, chapter: number, verse: number) =>
  `${normalizeToken(book)}:${chapter}:${verse}`;

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace("#", "");
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((value) => `${value}${value}`)
          .join("")
      : sanitized;
  const numeric = parseInt(normalized, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const VerseNode: React.FC<{ data: VerseNodeData }> = ({ data }) => {
  const {
    verse,
    isHighlighted,
    isAnchor,
    onShowParallels,
    depth,
    semanticConnectionType, // Semantic connection for this node
    enableSemanticGlow,
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

  const baseClasses =
    "group relative cursor-pointer select-none rounded-[14px] border " +
    "backdrop-blur-md transition-[transform,box-shadow,border-color,background-color,opacity] duration-200 ease-out " +
    "hover:-translate-y-0.5 hover:z-10 active:translate-y-0";

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
  const showHubBadge = !isDimmed && normalizedConnections >= 3;
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
      glow: "0 0 5px #B8F1FF",
      border: "#D7F3FF",
    },
  };

  const glowStyle =
    enableSemanticGlow && semanticConnectionType
      ? semanticGlowStyles[semanticConnectionType]
      : null;
  const ringHex =
    branchHighlight?.color ||
    glowStyle?.border ||
    (isAnchor ? "#F4B62B" : "#CBD5E1");
  const ringTint = hexToRgba(
    ringHex,
    isDimmed
      ? 0.08
      : isHighlighted || branchHighlight
        ? 0.12
        : isAnchor
          ? 0.18
          : 0.14,
  );
  const ringBorder = hexToRgba(
    ringHex,
    isDimmed ? 0.08 : isHighlighted || branchHighlight ? 0.1 : 0.14,
  );
  const branchGlow = branchHighlight?.glowColor || branchHighlight?.color;
  let width: number, height: number, padding: string;
  const bookLabel = verse.book_name || verse.book_abbrev.toUpperCase();
  const primaryLabel =
    verse.displayLabel ?? `${bookLabel} ${verse.chapter}:${verse.verse}`;
  const secondaryLabel = verse.displaySubLabel;

  if (isAnchor) {
    width = 180;
    height = 90;
    padding = "px-4 py-3";
  } else if (nodeDepth === 1) {
    width = 120;
    height = 50;
    padding = "px-2.5 py-1.5";
  } else if (nodeDepth === 2) {
    width = 100;
    height = 42;
    padding = "px-2 py-1";
  } else {
    width = 85;
    height = 35;
    padding = "px-1.5 py-1";
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
        className={`${baseClasses} ${padding}`}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          minWidth: `${width}px`,
          minHeight: `${height}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          boxSizing: "border-box",
          color: "rgba(255,255,255,0.9)",
          background:
            "radial-gradient(120% 140% at 20% 10%, rgba(255,255,255,0.14), transparent 58%), linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
          borderColor: isDimmed
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.14)",
          borderWidth: "1px",
          boxShadow: isDimmed
            ? "none"
            : [
                "0 14px 30px rgba(0,0,0,0.42)",
                "inset 0 1px 0 rgba(255,255,255,0.10)",
                isAnchor ? "0 18px 40px rgba(0,0,0,0.55)" : "",
                isHighlighted ? "0 8px 18px rgba(59,130,246,0.08)" : "",
                branchGlow ? `0 0 10px ${branchGlow}` : "",
              ]
                .filter(Boolean)
                .join(", "),
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          // Entrance animation
          opacity: hasEntered ? (isDimmed ? 0.25 : 1) : 0,
          transform: hasEntered
            ? `translateY(0) scale(${hubScale})`
            : `translateY(-8px) scale(${hubScale * 0.97})`,
          transition:
            "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), transform 400ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 600ms ease, border-color 600ms ease",
        }}
      >
        <span
          className="pointer-events-none absolute left-3 right-3 top-1 h-px rounded-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${
              isAnchor
                ? "#F4B62B"
                : glowStyle?.border
                  ? glowStyle.border
                  : "rgba(255,255,255,0.2)"
            }, transparent)`,
            opacity: isDimmed ? 0.2 : 0.9,
          }}
        />
        <span
          className="pointer-events-none absolute inset-[-2px] rounded-[16px]"
          style={{
            border: `1px solid ${ringBorder}`,
            boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 0 8px ${ringTint}`,
            opacity: isDimmed ? 0.5 : 1,
          }}
        />
        {pulseActive && (
          <span
            className="pointer-events-none absolute inset-0 rounded"
            style={{
              animation: "discovery-pulse 900ms ease-out",
            }}
          />
        )}
        {showHubBadge && (
          <span className="absolute -top-2 -left-2 min-w-[18px] h-[18px] px-1 rounded-full bg-neutral-950/85 text-cyan-100 text-[9px] font-semibold flex items-center justify-center border border-cyan-200/30 shadow-sm">
            {normalizedConnections}
          </span>
        )}
        <div
          className={
            isAnchor
              ? "text-[13px] font-serif font-semibold tracking-[0.01em] whitespace-nowrap"
              : nodeDepth <= 1
                ? "text-[11px] font-serif font-medium whitespace-nowrap flex items-center gap-1.5"
                : nodeDepth === 2
                  ? "text-[10px] font-serif font-medium whitespace-nowrap flex items-center gap-1"
                  : "text-[9px] font-serif font-medium whitespace-nowrap flex items-center gap-1"
          }
          style={{ textShadow: "0 2px 10px rgba(0,0,0,0.45)" }}
        >
          {primaryLabel}
        </div>
        {secondaryLabel && (
          <div
            className={
              isAnchor
                ? "text-[10px] text-white/60 whitespace-nowrap"
                : nodeDepth <= 1
                  ? "text-[9px] text-white/55 whitespace-nowrap"
                  : nodeDepth === 2
                    ? "text-[8px] text-white/50 whitespace-nowrap"
                    : "text-[7px] text-white/45 whitespace-nowrap"
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
                ? "text-[10px] mt-1 max-w-[170px] truncate leading-tight text-white/70"
                : nodeDepth <= 1
                  ? "text-[9px] mt-0.5 max-w-[110px] truncate leading-tight text-white/65"
                  : nodeDepth === 2
                    ? "text-[8px] mt-0.5 max-w-[95px] truncate leading-tight text-white/60"
                    : "text-[7px] mt-0.5 max-w-[80px] truncate leading-tight text-white/55"
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
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full border border-white/15 text-[9px] font-semibold text-white/85 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
            style={{
              background:
                "radial-gradient(120% 140% at 20% 10%, rgba(255,255,255,0.14), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))",
              backdropFilter: "blur(12px) saturate(140%)",
              WebkitBackdropFilter: "blur(12px) saturate(140%)",
              boxShadow: "0 10px 18px rgba(0,0,0,0.32)",
            }}
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
