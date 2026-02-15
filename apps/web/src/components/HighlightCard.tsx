import type { BibleHighlight } from "../contexts/BibleHighlightsContext";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface HighlightCardProps {
  highlight: BibleHighlight;
  onDelete: (id: string) => void;
  onClick?: () => void;
}

export function HighlightCard({
  highlight,
  onDelete,
  onClick,
}: HighlightCardProps) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden p-4 cursor-pointer transition-all duration-200 hover:bg-white/[0.12]"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-brand-primary-300 font-semibold text-sm mb-0.5">
            {highlight.book} {highlight.chapter}:{highlight.verse}
          </h3>
          <p className="text-neutral-500 text-xs">
            {formatDate(highlight.createdAt)}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(highlight.id);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-neutral-800/50 rounded-lg text-neutral-400 hover:text-red-400"
          title="Delete highlight"
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
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Highlighted Text */}
      <div
        className="relative mb-3 p-3 rounded-lg border-l-4 bg-neutral-800/30"
        style={{
          borderLeftColor: highlight.color,
          backgroundColor: `${highlight.color}15`,
        }}
      >
        <p className="text-neutral-200 text-sm leading-relaxed line-clamp-4">
          {highlight.text}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full border border-neutral-700"
          style={{ backgroundColor: highlight.color }}
        />
        <span className="text-neutral-500 text-xs">Click to view in Bible</span>
      </div>
    </div>
  );
}
