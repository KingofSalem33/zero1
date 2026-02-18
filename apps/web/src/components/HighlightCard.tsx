import React, { useState, useRef, useEffect } from "react";
import {
  formatVerseRange,
  HIGHLIGHT_COLORS,
  type BibleHighlight,
} from "../contexts/BibleHighlightsContext";
import { generateHighlightImage } from "../utils/generateHighlightImage";
import { hapticMedium, hapticTap, hapticDelete } from "../utils/haptics";
import { ShareSheet } from "./ShareSheet";

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
  onUpdateNote?: (id: string, note: string) => void;
  onUpdateColor?: (id: string, color: string) => void;
  onClick?: () => void;
}

export function HighlightCard({
  highlight,
  onDelete,
  onUpdateNote,
  onUpdateColor,
  onClick,
}: HighlightCardProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(highlight.note || "");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareImageBlob, setShareImageBlob] = useState<Blob | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasNote = Boolean(highlight.note);

  // Auto-focus textarea when opened
  useEffect(() => {
    if (noteOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [noteOpen]);

  const handleSaveNote = () => {
    const trimmed = noteText.trim();
    onUpdateNote?.(highlight.id, trimmed);
    hapticTap();
    if (!trimmed) setNoteOpen(false);
  };

  return (
    <article
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Highlight: ${highlight.source === "chat" ? "Chat insight" : `${highlight.book} ${highlight.chapter}:${formatVerseRange(highlight.verses)}`}`}
      className="group relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden p-4 cursor-pointer transition-all duration-200 hover:bg-white/[0.12] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:ring-offset-2 focus:ring-offset-black"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-brand-primary-300 font-semibold text-sm mb-0.5">
            {highlight.source === "chat"
              ? "Saved from Chat"
              : `${highlight.book} ${highlight.chapter}:${formatVerseRange(highlight.verses)}`}
          </h3>
          <p className="text-neutral-500 text-xs">
            {formatDate(highlight.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Note toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setNoteOpen(!noteOpen);
            }}
            className={`p-1.5 rounded-lg transition-all ${
              hasNote
                ? "text-[#D4AF37] opacity-80 hover:opacity-100"
                : "opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-200"
            } hover:bg-neutral-800/50`}
            title={hasNote ? "Edit note" : "Add note"}
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          {/* Share as image */}
          <button
            onClick={async (e) => {
              e.stopPropagation();
              hapticMedium();
              const blob = await generateHighlightImage(highlight);
              setShareImageBlob(blob);
              setShowShareSheet(true);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-neutral-800/50 rounded-lg text-neutral-400 hover:text-neutral-200"
            title="Share as image"
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
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          </button>
          {/* Delete */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              hapticDelete();
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

      {/* Note display (collapsed) */}
      {hasNote && !noteOpen && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setNoteOpen(true);
          }}
          className="mb-3 px-3 py-2 rounded-md bg-white/[0.03] border border-white/5 cursor-text"
        >
          <p className="text-neutral-400 text-xs leading-relaxed line-clamp-2 italic">
            {highlight.note}
          </p>
        </div>
      )}

      {/* Note editor (expanded) */}
      {noteOpen && (
        <div className="mb-3" onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={textareaRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onBlur={handleSaveNote}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNoteText(highlight.note || "");
                setNoteOpen(false);
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSaveNote();
                setNoteOpen(false);
              }
            }}
            placeholder="Add a personal note..."
            aria-label="Personal note for this highlight"
            rows={2}
            className="w-full px-3 py-2 bg-white/[0.05] border border-white/10 rounded-md text-neutral-200 text-xs leading-relaxed placeholder-neutral-600 resize-none focus:outline-none focus:border-[#D4AF37]/30 transition-colors"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-neutral-600 text-[10px]">
              Ctrl+Enter to save, Esc to cancel
            </span>
            <button
              onClick={() => {
                handleSaveNote();
                setNoteOpen(false);
              }}
              className="text-[10px] text-[#D4AF37] hover:text-[#F0D77F] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Footer with color picker */}
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setColorPickerOpen(!colorPickerOpen);
          }}
          className="w-3 h-3 rounded-full border border-neutral-700 hover:scale-125 transition-transform"
          style={{ backgroundColor: highlight.color }}
          title="Change color"
        />
        {colorPickerOpen ? (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  hapticTap();
                  onUpdateColor?.(highlight.id, c.value);
                  setColorPickerOpen(false);
                }}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-150 hover:scale-110 ${
                  highlight.color === c.value
                    ? "border-white/50"
                    : "border-transparent hover:border-white/30"
                }`}
                style={{ backgroundColor: c.value }}
                title={c.name}
                aria-label={`Change to ${c.name}`}
              />
            ))}
          </div>
        ) : (
          <span className="text-neutral-500 text-xs">
            {highlight.source === "chat"
              ? "From chat"
              : "Click to view in Bible"}
          </span>
        )}
      </div>

      <ShareSheet
        isOpen={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        text={
          highlight.source === "chat"
            ? `"${highlight.text}"`
            : `"${highlight.text}"\n— ${highlight.book} ${highlight.chapter}:${formatVerseRange(highlight.verses)}`
        }
        imageBlob={shareImageBlob}
        reference={
          highlight.source === "chat"
            ? undefined
            : `${highlight.book} ${highlight.chapter}:${formatVerseRange(highlight.verses)}`
        }
      />
    </article>
  );
}
