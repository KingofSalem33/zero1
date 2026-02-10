import React, { useMemo, useState, useEffect, useRef } from "react";

interface DiscoveryOverlayProps {
  phase: "selecting" | "analyzing" | "connecting" | "complete";
  progress: number;
  message: string;
  tracedText?: string;
  highlightTitle?: string;
  highlightSubtitle?: string;
  showHint?: boolean;
  visible?: boolean;
}

// Constellation layout — radial rings around a central anchor
const NODE_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 50, y: 50 }, // anchor
  { x: 24, y: 30 },
  { x: 76, y: 26 },
  { x: 80, y: 64 },
  { x: 20, y: 70 },
  { x: 50, y: 16 },
  { x: 50, y: 84 },
  { x: 12, y: 50 },
  { x: 88, y: 50 },
  { x: 32, y: 12 },
  { x: 68, y: 88 },
  { x: 87, y: 20 },
  { x: 13, y: 80 },
  { x: 40, y: 36 },
  { x: 60, y: 64 },
];

// Each node connects to a parent (index). -1 = anchor (no parent).
const EDGE_TARGETS: number[] = [-1, 0, 0, 0, 0, 1, 3, 4, 2, 5, 6, 8, 7, 0, 0];

type Phase = "selecting" | "analyzing" | "connecting" | "complete";

const PHASE_CONTEXTUAL: Record<Phase, string[]> = {
  selecting: ["Searching Scripture", "Finding relevant verses"],
  analyzing: [
    "Analyzing connections",
    "Understanding the threads",
    "Reading between the lines",
  ],
  connecting: ["Drawing the narrative map", "Weaving the golden thread"],
  complete: ["Map ready"],
};

// Pick a contextual message for the current phase
function getPhaseMessage(phase: Phase, tick: number): string {
  const messages = PHASE_CONTEXTUAL[phase];
  return messages[tick % messages.length];
}

// Derive how many constellation nodes to show based on progress
function progressToNodeCount(progress: number): number {
  // 0% → 1 node (anchor), 100% → all nodes
  const ratio = Math.min(progress / 100, 1);
  return Math.max(1, Math.round(ratio * NODE_POSITIONS.length));
}

export const DiscoveryOverlay: React.FC<DiscoveryOverlayProps> = ({
  phase,
  progress,
  message,
  tracedText,
  highlightTitle,
  highlightSubtitle,
  showHint = true,
  visible = true,
}) => {
  const [messageTick, setMessageTick] = useState(0);
  const [messageTransition, setMessageTransition] = useState(false);
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPhaseRef = useRef<Phase>(phase);

  // Rotate contextual messages every ~3s
  useEffect(() => {
    if (!visible) return;
    tickTimerRef.current = setInterval(() => {
      setMessageTransition(true);
      setTimeout(() => {
        setMessageTick((t) => t + 1);
        setMessageTransition(false);
      }, 200);
    }, 3200);
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, [visible]);

  // Reset tick when phase changes
  useEffect(() => {
    if (phase !== prevPhaseRef.current) {
      setMessageTransition(true);
      setTimeout(() => {
        setMessageTick(0);
        setMessageTransition(false);
      }, 200);
      prevPhaseRef.current = phase;
    }
  }, [phase]);

  const contextualMessage = getPhaseMessage(phase, messageTick);
  const visibleNodeCount = progressToNodeCount(progress);

  // Build edges for visible nodes
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

  // Truncate traced text
  const displayText =
    tracedText && tracedText.length > 60
      ? tracedText.slice(0, 57) + "..."
      : tracedText;

  // Phase progress segments
  const PHASES: Phase[] = ["selecting", "analyzing", "connecting", "complete"];
  const currentPhaseIndex = PHASES.indexOf(phase);

  return (
    <div
      className={`absolute inset-0 z-50 pointer-events-none transition-all duration-500 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-neutral-950/40" />

      {/* Centered card */}
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div
          className={`w-[400px] max-w-[90vw] rounded-xl border border-white/10 bg-neutral-900/80 shadow-2xl backdrop-blur-xl transition-all duration-500 ease-out ${
            visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]"
          }`}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-3">
            {/* Traced text header */}
            {displayText && (
              <div className="mb-3">
                <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500 font-medium">
                  Tracing
                </span>
                <p className="text-[#D4AF37] text-sm font-semibold leading-snug mt-0.5 truncate">
                  {displayText}
                </p>
              </div>
            )}

            {/* Contextual phase message with crossfade */}
            <div className="relative h-5 overflow-hidden">
              <span
                className="text-[13px] text-neutral-400 font-medium transition-all duration-200 ease-out absolute flex items-center"
                style={{
                  opacity: messageTransition ? 0 : 1,
                  transform: messageTransition
                    ? "translateY(-6px)"
                    : "translateY(0)",
                }}
              >
                {contextualMessage}
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
          </div>

          {/* Constellation SVG */}
          <div className="px-5">
            <div className="relative w-full h-[180px]">
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Edges */}
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
                      strokeWidth={0.5}
                      strokeDasharray={length}
                      style={{
                        animation: `edge-draw 0.6s ease-out ${edge.index * 0.12}s both`,
                        strokeDashoffset: length,
                      }}
                    />
                  );
                })}

                {/* Visible nodes */}
                {NODE_POSITIONS.slice(0, visibleNodeCount).map((pos, i) => {
                  const isAnchor = i === 0;
                  const isLatest = i === visibleNodeCount - 1 && i > 0;
                  return (
                    <g key={`node-${i}`}>
                      {isAnchor && (
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={7}
                          fill="rgba(212, 175, 55, 0.12)"
                          style={{
                            animation: "node-pulse 2s ease-in-out infinite",
                          }}
                        />
                      )}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={isAnchor ? 3.5 : 2.2}
                        fill={isAnchor ? "#D4AF37" : "rgba(212, 175, 55, 0.65)"}
                        style={{
                          animation: `node-appear 0.4s ease-out ${i * 0.12}s both`,
                          transformOrigin: `${pos.x}px ${pos.y}px`,
                        }}
                      />
                      {isLatest && (
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={4.5}
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

                {/* Placeholder nodes */}
                {NODE_POSITIONS.slice(visibleNodeCount).map((pos, i) => (
                  <circle
                    key={`ph-${i}`}
                    cx={pos.x}
                    cy={pos.y}
                    r={1}
                    fill="rgba(255, 255, 255, 0.03)"
                  />
                ))}
              </svg>
            </div>
          </div>

          {/* Footer: progress + details */}
          <div className="px-5 pb-5 pt-2 space-y-3">
            {/* Detail message from parent */}
            <div className="text-[12px] text-neutral-500">{message}</div>

            {/* Phase steps */}
            <div className="flex gap-1.5">
              {PHASES.map((p, idx) => {
                const isActive = idx === currentPhaseIndex;
                const isPast = idx < currentPhaseIndex;
                return (
                  <div
                    key={p}
                    className={`flex-1 h-[3px] rounded-full transition-all duration-500 ${
                      isActive
                        ? "bg-[#D4AF37]"
                        : isPast
                          ? "bg-[#D4AF37]/40"
                          : "bg-white/5"
                    }`}
                  >
                    {isActive && (
                      <div className="h-full rounded-full overflow-hidden relative">
                        <div className="absolute inset-0 animate-gold-shimmer" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Progress percentage */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                {Math.round(progress)}% complete
              </span>
              {showHint && phase !== "complete" && (
                <span className="text-[11px] text-neutral-600">
                  Feel free to explore
                </span>
              )}
            </div>

            {/* Discovery highlights */}
            {(highlightTitle || highlightSubtitle) && (
              <div className="border-t border-white/5 pt-3">
                {highlightTitle && (
                  <div className="text-[12px] font-semibold text-neutral-200">
                    {highlightTitle}
                  </div>
                )}
                {highlightSubtitle && (
                  <div className="mt-0.5 text-[11px] text-[#D4AF37]/80">
                    {highlightSubtitle}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
