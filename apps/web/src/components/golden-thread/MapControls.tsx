import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

// --- Save Map Button ---

interface SaveMapButtonProps {
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

export const SaveMapButton: React.FC<SaveMapButtonProps> = ({
  onSave,
  saving,
  saved,
  error,
}) => (
  <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-2">
    <button
      onClick={onSave}
      disabled={saving || saved}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 backdrop-blur-sm ${
        saved
          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
          : "bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#D4AF37] border border-[#D4AF37]/20 hover:border-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
      }`}
    >
      {saved ? (
        <>
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
          Saved
        </>
      ) : saving ? (
        "Saving..."
      ) : (
        "Save Map"
      )}
    </button>
    {error && <span className="text-[10px] text-red-400">{error}</span>}
  </div>
);

// --- Zoom Controls ---

interface ZoomControlsProps {
  flowInstance: React.RefObject<ReactFlowInstance | null>;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({ flowInstance }) => {
  const btnClass =
    "w-9 h-9 rounded-lg bg-neutral-900/80 backdrop-blur-sm border border-white/10 hover:border-white/20 text-neutral-400 hover:text-white transition-all duration-150 flex items-center justify-center";

  return (
    <div className="absolute bottom-16 right-4 z-40 flex flex-col gap-1">
      <button
        type="button"
        onClick={() => flowInstance.current?.zoomIn({ duration: 200 })}
        className={btnClass}
        aria-label="Zoom in"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6v12M6 12h12"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => flowInstance.current?.zoomOut({ duration: 200 })}
        className={btnClass}
        aria-label="Zoom out"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 12h12"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() =>
          flowInstance.current?.fitView({ padding: 0.2, duration: 300 })
        }
        className={btnClass}
        aria-label="Fit to view"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
          />
        </svg>
      </button>
    </div>
  );
};

// --- Discover Button ---

interface DiscoverButtonProps {
  onDiscover: () => void;
  disabled: boolean;
  title: string;
  label: string;
}

export const DiscoverButton: React.FC<DiscoverButtonProps> = ({
  onDiscover,
  disabled,
  title,
  label,
}) => (
  <div className="absolute bottom-4 left-4 z-40">
    <button
      type="button"
      onClick={onDiscover}
      disabled={disabled}
      title={title}
      className="px-4 py-2 rounded-full text-[12px] font-semibold tracking-wide transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#D4AF37] border border-[#D4AF37]/20 hover:border-[#D4AF37]/40 backdrop-blur-xl shadow-lg flex items-center gap-2"
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      {label}
    </button>
  </div>
);

// --- Legend Panel ---

interface LegendPanelProps {
  showLegend: boolean;
  setShowLegend: (show: boolean) => void;
  showHelpHints: boolean;
  setShowHelpHints: (fn: (prev: boolean) => boolean) => void;
}

export const LegendPanel: React.FC<LegendPanelProps> = ({
  showLegend,
  setShowLegend,
  showHelpHints,
  setShowHelpHints,
}) => (
  <div className="absolute bottom-4 right-4 z-40">
    {showLegend ? (
      <div className="bg-neutral-900/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl px-3 py-3 w-[200px] transition-all duration-200">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">
            Legend
          </div>
          <button
            type="button"
            onClick={() => setShowLegend(false)}
            className="w-4 h-4 rounded-full text-white/40 hover:text-white/80 transition-colors flex items-center justify-center"
            aria-label="Close legend"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="space-y-1.5 text-[11px] text-white/70">
          <div className="flex items-center gap-2">
            <span className="inline-block w-5 h-[2px] rounded-full bg-white/70" />
            <span>Scripture link</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-5 h-[2px] rounded-full"
              style={{ backgroundColor: "#C5B358" }}
            />
            <span>Root verse</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-5 h-[2px] rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, rgba(248,250,252,0.3), rgba(248,250,252,0.9), rgba(248,250,252,0.3))",
              }}
            />
            <span>AI-discovered</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowHelpHints((prev) => !prev)}
          className="mt-2 text-[10px] text-white/30 hover:text-white/60 transition-colors"
        >
          {showHelpHints ? "Hide tips" : "Show tips"}
        </button>
        {showHelpHints && (
          <div className="mt-1.5 pt-1.5 border-t border-white/5 space-y-1 text-[10px] text-white/50 leading-snug">
            <div>Click a verse to explore</div>
            <div>Hover to spotlight nearby</div>
            <div>Scroll to zoom, drag to pan</div>
          </div>
        )}
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setShowLegend(true)}
        className="w-10 h-10 rounded-lg bg-neutral-900/60 backdrop-blur-xl border border-white/10 text-white/40 hover:text-white/80 hover:border-white/20 transition-all duration-200 flex items-center justify-center shadow-lg"
        aria-label="Show legend"
        title="Show legend"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
    )}
  </div>
);
