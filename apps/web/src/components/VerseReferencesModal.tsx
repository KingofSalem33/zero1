import React, { useState, useEffect, useRef } from "react";

interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

interface VerseReferencesModalProps {
  book: string;
  chapter: number;
  verse: number;
  position: { top: number; left: number };
  onClose: () => void;
  onRequestVerseTooltip?: (
    reference: string,
    position: { top: number; left: number },
  ) => void;
  verseTooltipRef?: React.RefObject<HTMLDivElement>;
}

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

export function VerseReferencesModal({
  book,
  chapter,
  verse,
  position,
  onClose,
  onRequestVerseTooltip,
  verseTooltipRef,
}: VerseReferencesModalProps) {
  const [crossReferences, setCrossReferences] = useState<VerseRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const reference = `${book} ${chapter}:${verse}`;

  // Fetch cross-references on mount
  useEffect(() => {
    const fetchCrossReferences = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_URL}/api/verse/${encodeURIComponent(reference)}/cross-references`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch cross-references");
        }

        const data = await response.json();
        console.log(
          "[VerseReferencesModal] Loaded cross-references:",
          data.crossReferences,
        );
        setCrossReferences(data.crossReferences || []);
      } catch (err) {
        console.error(
          "[VerseReferencesModal] Error fetching cross-references:",
          err,
        );
        setError("Could not load references");
      } finally {
        setLoading(false);
      }
    };

    fetchCrossReferences();
  }, [reference]);

  // Close on click outside (but not when clicking on the verse tooltip)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideModal = tooltipRef.current?.contains(target);
      const clickedInsideVerseTooltip =
        verseTooltipRef?.current?.contains(target);

      // Only close if clicking outside both the modal and the verse tooltip
      if (!clickedInsideModal && !clickedInsideVerseTooltip) {
        onClose();
      }
    };

    // Small delay to prevent immediate closure on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, verseTooltipRef]);

  const handleReferenceClick = (ref: VerseRef, event: React.MouseEvent) => {
    event.stopPropagation();
    const refString = `${ref.book} ${ref.chapter}:${ref.verse}`;
    console.log("[VerseReferencesModal] Clicked reference:", refString);

    const rect = (event.target as HTMLElement).getBoundingClientRect();

    // Find the main scrolling container (not the modal's internal scroll area)
    // The main container has classes: relative, flex-1, overflow-y-auto
    const scrollContainer = (event.target as HTMLElement).closest(
      ".relative.flex-1.overflow-y-auto",
    ) as HTMLElement;

    if (scrollContainer && onRequestVerseTooltip) {
      const containerRect = scrollContainer.getBoundingClientRect();

      // Position below the clicked reference, relative to scrolling container
      // We need to add scrollTop because position: absolute is relative to the container's full content area (0,0 at the very top),
      // not just the visible viewport
      const spacing = 12;
      const top =
        rect.bottom - containerRect.top + scrollContainer.scrollTop + spacing;

      // Center horizontally on the reference, relative to container
      const left =
        rect.left -
        containerRect.left +
        scrollContainer.scrollLeft +
        rect.width / 2;

      console.log("[VerseReferencesModal] Position calculation:", {
        "rect.bottom": rect.bottom,
        "containerRect.top": containerRect.top,
        "scrollContainer.scrollTop": scrollContainer.scrollTop,
        spacing,
        "calculated top": top,
        "calculated left": left,
      });

      onRequestVerseTooltip(refString, { top, left });
    }
  };

  return (
    <div
      ref={tooltipRef}
      className="absolute z-[70] transform -translate-x-1/2"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Compact popover card */}
      <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-lg shadow-xl overflow-hidden max-w-sm">
        {/* Header - Compact */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div>
            <div className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wide">
              Cross-References
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              {reference}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all duration-150"
            aria-label="Close"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content - Compact */}
        <div className="p-3 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse" />
              <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:150ms]" />
              <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:300ms]" />
              <span className="text-xs text-neutral-400 ml-1 font-medium">
                Loading
              </span>
            </div>
          ) : error ? (
            <div className="text-xs text-red-400 py-2">{error}</div>
          ) : crossReferences.length === 0 ? (
            <div className="text-xs text-neutral-400 py-2">
              No cross-references found
            </div>
          ) : (
            <div className="space-y-0.5">
              {crossReferences.map((ref, index) => {
                const refString = `${ref.book} ${ref.chapter}:${ref.verse}`;

                return (
                  <div
                    key={index}
                    onClick={(e) => handleReferenceClick(ref, e)}
                    className="px-1 py-0.5 cursor-pointer group"
                  >
                    <span className="text-xs font-normal text-[#D4AF37]/70 group-hover:text-[#D4AF37] transition-colors">
                      {refString}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Arrow pointer - points up to verse number */}
      <div
        className="absolute"
        style={{
          top: "-8px",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        {/* Arrow shadow */}
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1">
          <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-black/20 blur-sm" />
        </div>

        {/* Main arrow */}
        <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-white/[0.08]" />

        {/* Arrow border */}
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2">
          <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-b-[9px] border-b-white/10" />
        </div>
      </div>
    </div>
  );
}
