import React from "react";

interface DiscoveryOverlayProps {
  phase: "selecting" | "analyzing" | "connecting" | "complete";
  progress: number;
  message: string;
  highlightTitle?: string;
  highlightSubtitle?: string;
  showHint?: boolean;
  visible?: boolean;
}

const PHASE_LABELS: Record<DiscoveryOverlayProps["phase"], string> = {
  selecting: "Selecting",
  analyzing: "Analyzing",
  connecting: "Mapping",
  complete: "Complete",
};

const PHASE_COLORS: Record<DiscoveryOverlayProps["phase"], string> = {
  selecting: "bg-sky-500",
  analyzing: "bg-indigo-500",
  connecting: "bg-cyan-500",
  complete: "bg-emerald-500",
};

export const DiscoveryOverlay: React.FC<DiscoveryOverlayProps> = ({
  phase,
  progress,
  message,
  highlightTitle,
  highlightSubtitle,
  showHint = true,
  visible = true,
}) => {
  const phaseLabel = PHASE_LABELS[phase];
  const phaseColor = PHASE_COLORS[phase];
  const layers = [3, 5, 5, 3];
  const width = 200;
  const height = 120;
  const layerCount = layers.length;
  const xPositions = layers.map((_, idx) =>
    layerCount === 1 ? width / 2 : 20 + (160 * idx) / (layerCount - 1),
  );
  const nodes = layers.flatMap((count, layerIdx) =>
    Array.from({ length: count }, (_, i) => ({
      id: `l${layerIdx}-n${i}`,
      x: xPositions[layerIdx],
      y: ((i + 1) / (count + 1)) * height,
      delay: (i + layerIdx) * 0.15,
    })),
  );
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  const edges = layers.flatMap((count, layerIdx) => {
    if (layerIdx >= layerCount - 1) return [];
    const nextCount = layers[layerIdx + 1];
    return Array.from({ length: count }, (_, i) =>
      Array.from({ length: nextCount }, (_, j) => ({
        id: `e${layerIdx}-${i}-${j}`,
        from: `l${layerIdx}-n${i}`,
        to: `l${layerIdx + 1}-n${j}`,
        delay: ((i + j + layerIdx) % 6) * 0.18,
      })),
    ).flat();
  });

  return (
    <div
      className={`absolute inset-0 z-50 pointer-events-none transition-opacity duration-500 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-neutral-950/15" />
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div
          className={`w-[360px] max-w-[90vw] rounded-xl border border-white/10 bg-neutral-900/85 shadow-2xl backdrop-blur-xl transition-all duration-500 ease-out ${
            visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]"
          }`}
        >
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                  Discovering Connections
                </div>
                <div className="mt-1 text-sm text-neutral-200">
                  {phaseLabel} verses
                </div>
              </div>
              <div className="text-xs text-neutral-400">
                {Math.round(progress)}%
              </div>
            </div>

            <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full ${phaseColor} transition-all duration-700 ease-out`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="text-xs text-neutral-400">{message}</div>

            <div className="mt-4 flex items-center justify-center">
              <svg
                width="200"
                height="120"
                viewBox="0 0 200 120"
                className="text-cyan-200/80"
              >
                <g stroke="currentColor" strokeWidth="1.2">
                  {edges.map((edge) => {
                    const from = nodeLookup.get(edge.from);
                    const to = nodeLookup.get(edge.to);
                    if (!from || !to) return null;
                    return (
                      <g key={edge.id}>
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          className="discovery-line-base"
                        />
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          className="discovery-line-flow"
                          style={{ animationDelay: `${edge.delay}s` }}
                        />
                      </g>
                    );
                  })}
                </g>

                <g fill="currentColor">
                  {nodes.map((node) => (
                    <circle
                      key={node.id}
                      cx={node.x}
                      cy={node.y}
                      r="3"
                      className="discovery-node"
                      style={{ animationDelay: `${node.delay}s` }}
                    />
                  ))}
                </g>
              </svg>
            </div>

            {showHint && (
              <div className="mt-3 text-[11px] text-neutral-400">
                You can explore while this finishes.
              </div>
            )}

            {(highlightTitle || highlightSubtitle) && (
              <div className="mt-4 border-t border-white/10 pt-3">
                {highlightTitle && (
                  <div className="text-xs font-semibold text-neutral-200">
                    {highlightTitle}
                  </div>
                )}
                {highlightSubtitle && (
                  <div className="mt-1 text-[11px] text-cyan-200/90">
                    {highlightSubtitle}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .discovery-line-base {
          stroke-linecap: round;
          opacity: 0.3;
        }

        .discovery-line-flow {
          stroke-dasharray: 2 10;
          stroke-linecap: round;
          animation: crawl 2.8s linear infinite;
          opacity: 0.9;
        }

        .discovery-node {
          animation: crawlPulse 2.6s ease-in-out infinite;
          opacity: 0.9;
        }

        @keyframes crawl {
          0% {
            stroke-dashoffset: 28;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes crawlPulse {
          0%,
          100% {
            opacity: 0.45;
            r: 2.4;
          }
          50% {
            opacity: 1;
            r: 3.4;
          }
        }
      `}</style>
    </div>
  );
};
