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
                  <line
                    x1="30"
                    y1="20"
                    x2="100"
                    y2="20"
                    className="discovery-line"
                  />
                  <line
                    x1="100"
                    y1="20"
                    x2="170"
                    y2="20"
                    className="discovery-line"
                    style={{ animationDelay: "0.3s" }}
                  />
                  <line
                    x1="30"
                    y1="20"
                    x2="60"
                    y2="60"
                    className="discovery-line"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <line
                    x1="60"
                    y1="60"
                    x2="100"
                    y2="20"
                    className="discovery-line"
                    style={{ animationDelay: "0.4s" }}
                  />
                  <line
                    x1="100"
                    y1="20"
                    x2="140"
                    y2="60"
                    className="discovery-line"
                    style={{ animationDelay: "0.6s" }}
                  />
                  <line
                    x1="140"
                    y1="60"
                    x2="170"
                    y2="20"
                    className="discovery-line"
                    style={{ animationDelay: "0.5s" }}
                  />
                  <line
                    x1="60"
                    y1="60"
                    x2="100"
                    y2="100"
                    className="discovery-line"
                    style={{ animationDelay: "0.3s" }}
                  />
                  <line
                    x1="100"
                    y1="100"
                    x2="140"
                    y2="60"
                    className="discovery-line"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <line
                    x1="60"
                    y1="100"
                    x2="100"
                    y2="100"
                    className="discovery-line"
                    style={{ animationDelay: "0.35s" }}
                  />
                  <line
                    x1="100"
                    y1="100"
                    x2="140"
                    y2="100"
                    className="discovery-line"
                    style={{ animationDelay: "0.45s" }}
                  />
                  <line
                    x1="30"
                    y1="20"
                    x2="60"
                    y2="100"
                    className="discovery-line"
                    style={{ animationDelay: "0.7s" }}
                  />
                  <line
                    x1="170"
                    y1="20"
                    x2="140"
                    y2="100"
                    className="discovery-line"
                    style={{ animationDelay: "0.8s" }}
                  />
                </g>

                <g fill="currentColor">
                  {[
                    { x: 30, y: 20, d: "0s" },
                    { x: 100, y: 20, d: "0.1s" },
                    { x: 170, y: 20, d: "0.2s" },
                    { x: 60, y: 60, d: "0.3s" },
                    { x: 140, y: 60, d: "0.4s" },
                    { x: 100, y: 100, d: "0.5s" },
                    { x: 60, y: 100, d: "0.6s" },
                    { x: 140, y: 100, d: "0.7s" },
                  ].map((node) => (
                    <circle
                      key={`${node.x}-${node.y}`}
                      cx={node.x}
                      cy={node.y}
                      r="3"
                      className="discovery-node"
                      style={{ animationDelay: node.d }}
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
        .discovery-line {
          stroke-dasharray: 2 12;
          stroke-linecap: round;
          animation: crawl 2.8s linear infinite;
          opacity: 0.75;
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
