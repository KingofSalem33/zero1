import React from "react";
import { Handle, Position } from "@xyflow/react";
import type { ThreadNode } from "../../types/goldenThread";

interface VerseNodeData {
  verse: ThreadNode;
  isHighlighted: boolean;
  isAnchor: boolean;
  collapsedChildCount: number;
  onExpand: () => void;
  onShowParallels?: (verseId: number) => void;
  onHoverChange?: (hovered: boolean) => void;
  depth?: number;
  enableSemanticGlow?: boolean;
  semanticConnectionType?: string;
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

const ANCHOR_GOLD = "#C5B358";

export const VerseNode: React.FC<{ data: VerseNodeData }> = ({ data }) => {
  const {
    verse,
    isHighlighted,
    isAnchor,
    onShowParallels,
    depth,
    semanticConnectionType,
    enableSemanticGlow,
    isDimmed,
    branchHighlight,
    discoveryPulseKey,
    connectionCount,
  } = data;
  const [hasEntered, setHasEntered] = React.useState(false);
  const [pulseActive, setPulseActive] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);
  const [clickPulseKey, setClickPulseKey] = React.useState<number | null>(null);

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

  const handlePointerDown = () => {
    setIsPressed(true);
    setClickPulseKey(Date.now());
  };

  const handlePointerUp = () => {
    setIsPressed(false);
  };

  const baseClasses =
    "group relative cursor-pointer select-none rounded-[12px] border " +
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
    // Build alternate keys for book name variations (e.g., "Gen" vs "Genesis")
    const primaryKeys = new Set<string>();
    primaryKeys.add(primaryKey);
    if (verse.book_name) {
      primaryKeys.add(
        makeVerseKey(verse.book_name, verse.chapter, verse.verse),
      );
    }
    if (verse.book_abbrev) {
      primaryKeys.add(
        makeVerseKey(verse.book_abbrev, verse.chapter, verse.verse),
      );
    }
    const seen = new Set<string>();
    let count = 0;

    parallels.forEach((parallel) => {
      // Skip exact ID match
      if (parallel.id === verse.id) return;
      // Skip same chapter:verse in same book (check all name variations)
      if (
        parallel.chapter === verse.chapter &&
        parallel.verse === verse.verse
      ) {
        const parallelBookToken = normalizeToken(
          parallel.book_name || parallel.book_abbrev || "",
        );
        const primaryBookToken = normalizeToken(primaryBook);
        if (parallelBookToken === primaryBookToken) return;
        // Also check abbreviation match
        if (
          verse.book_abbrev &&
          parallelBookToken === normalizeToken(verse.book_abbrev)
        ) {
          return;
        }
      }
      const parallelBook = parallel.book_name || parallel.book_abbrev || "";
      const key = makeVerseKey(parallelBook, parallel.chapter, parallel.verse);
      if (primaryKeys.has(key) || seen.has(key)) return;
      seen.add(key);
      count += 1;
    });

    return count;
  }, [verse]);

  // Semantic border tints show the connection family via subtle node border color
  const semanticGlowStyles: Record<string, { glow: string; border: string }> = {
    CROSS_REFERENCE: {
      glow: "0 0 5px rgba(34, 197, 94, 0.35)",
      border: "#86EFAC",
    },
    LEXICON: {
      glow: "0 0 5px rgba(245, 158, 11, 0.35)",
      border: "#FCD34D",
    },
    ECHO: {
      glow: "0 0 5px rgba(99, 102, 241, 0.35)",
      border: "#A5B4FC",
    },
    FULFILLMENT: {
      glow: "0 0 5px rgba(6, 182, 212, 0.35)",
      border: "#67E8F9",
    },
    PATTERN: {
      glow: "0 0 5px rgba(167, 139, 250, 0.35)",
      border: "#C4B5FD",
    },
    GREY: {
      glow: "0 0 5px #94A3B8",
      border: "#CBD5E1",
    },
  };

  const glowStyle =
    enableSemanticGlow && semanticConnectionType
      ? semanticGlowStyles[semanticConnectionType]
      : null;
  const ringHex = isAnchor ? ANCHOR_GOLD : glowStyle?.border || "#CBD5E1";
  const ringTint = hexToRgba(
    ringHex,
    isDimmed
      ? 0.1
      : isHighlighted || branchHighlight
        ? 0.18
        : isAnchor
          ? 0.22
          : 0.19,
  );
  const ringBorder = hexToRgba(
    ringHex,
    isDimmed ? 0.1 : isHighlighted || branchHighlight ? 0.16 : 0.18,
  );
  const branchGlow = branchHighlight?.glowColor || branchHighlight?.color;
  const branchGlowTint = branchGlow ? hexToRgba(branchGlow, 0.35) : null;
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
    height = 44;
    padding = "px-2 py-1";
  } else {
    width = 95;
    height = 44;
    padding = "px-2 py-1";
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
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div
        className={`${baseClasses} ${padding}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") data.onHoverChange?.(true);
        }}
        onPointerLeave={(e) => {
          handlePointerUp();
          if (e.pointerType !== "touch") data.onHoverChange?.(false);
        }}
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
                branchGlowTint ? `0 0 6px ${branchGlowTint}` : "",
              ]
                .filter(Boolean)
                .join(", "),
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          // Entrance animation
          opacity: hasEntered ? (isDimmed ? 0.15 : 1) : 0,
          transform: hasEntered
            ? `translateY(0) scale(${hubScale * (isPressed ? 0.992 : 1)})`
            : `translateY(-8px) scale(${hubScale * 0.97})`,
          transition:
            "opacity 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 120ms ease-out, box-shadow 260ms ease, border-color 260ms ease",
        }}
      >
        <span
          className="pointer-events-none absolute left-3 right-3 top-1 h-px rounded-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${
              isAnchor ? ANCHOR_GOLD : "rgba(255,255,255,0.2)"
            }, transparent)`,
            opacity: isDimmed ? 0.2 : 0.9,
          }}
        />
        <span
          className="pointer-events-none absolute inset-[-2px] rounded-[14px]"
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
        {clickPulseKey !== null && (
          <span
            key={clickPulseKey}
            className="pointer-events-none absolute inset-0 rounded-[12px]"
            style={{
              animation: "click-pulse 360ms ease-out",
            }}
          />
        )}
        {showHubBadge && (
          <span className="absolute -top-2.5 -left-2.5 min-w-[22px] h-[22px] px-1 rounded-full bg-neutral-950/85 text-white/85 text-[9px] font-semibold flex items-center justify-center border border-white/15 shadow-sm">
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
                  : "text-[10px] font-serif font-medium whitespace-nowrap flex items-center gap-1"
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
                  : "text-[9px] text-white/50 whitespace-nowrap"
            }
          >
            {secondaryLabel}
          </div>
        )}
        {/* Verse text snippets removed — cleaner nodes, less cognitive load */}
        {/* Collapse/expand badges removed - map now starts fully expanded */}
        {/* User only sees parallel passage badges (purple, top-right) */}
        {uniqueParallelCount > 0 && onShowParallels && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowParallels(verse.id);
            }}
            className="absolute -top-4 -right-4 flex items-center justify-center"
            style={{ width: "44px", height: "44px" }}
            title={`${uniqueParallelCount} parallel ${uniqueParallelCount === 1 ? "account" : "accounts"}`}
          >
            <span
              className="h-5 w-5 rounded-full border border-white/15 text-[9px] font-semibold text-white/85 shadow-sm flex items-center justify-center transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
              style={{
                background:
                  "radial-gradient(120% 140% at 20% 10%, rgba(255,255,255,0.14), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))",
                backdropFilter: "blur(12px) saturate(140%)",
                WebkitBackdropFilter: "blur(12px) saturate(140%)",
                boxShadow: "0 10px 18px rgba(0,0,0,0.32)",
              }}
              aria-hidden="true"
            >
              +{uniqueParallelCount}
            </span>
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </>
  );
};
