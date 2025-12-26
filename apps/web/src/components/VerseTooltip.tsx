import React, { useState, useEffect, useRef } from "react";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

interface VerseTooltipProps {
  reference: string;
  position: { top: number; left: number };
  onClose: () => void;
  onTrace?: (reference: string) => void;
}

const VerseTooltip = React.forwardRef<HTMLDivElement, VerseTooltipProps>(
  ({ reference, position, onClose, onTrace }, ref) => {
    const [verseText, setVerseText] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      // Fetch verse text from API
      const fetchVerse = async () => {
        console.log("[VerseTooltip] Fetching verse:", reference);
        try {
          const response = await fetch(
            `${API_URL}/api/verse/${encodeURIComponent(reference)}`,
          );

          if (!response.ok) {
            console.error(
              "[VerseTooltip] Failed to fetch verse:",
              response.status,
              response.statusText,
            );
            throw new Error("Failed to fetch verse");
          }

          const data = await response.json();
          console.log("[VerseTooltip] Received verse data:", data);
          setVerseText(data.text);
          setIsLoading(false);
        } catch (error) {
          console.error("[VerseTooltip] Error fetching verse:", error);
          setVerseText("Could not load verse text");
          setIsLoading(false);
        }
      };

      fetchVerse();
    }, [reference]);

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          tooltipRef.current &&
          !tooltipRef.current.contains(event.target as Node)
        ) {
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
    }, [onClose]);

    // Ensure tooltip doesn't go off-screen
    const tooltipWidth = 384; // max-w-sm
    const minLeft = tooltipWidth / 2 + 16; // Add 16px padding from edge
    const adjustedLeft = Math.max(position.left, minLeft);

    return (
      <div
        ref={ref}
        className="absolute z-[80] transform -translate-x-1/2 transition-all duration-150 ease-out"
        style={{
          top: `${position.top}px`,
          left: `${adjustedLeft}px`,
        }}
      >
        {/* Compact card matching highlight tooltip */}
        <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-lg shadow-xl overflow-hidden max-w-sm">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all duration-150 z-10"
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

          {/* Content */}
          <div className="p-3 pr-8">
            {/* Reference header */}
            <div className="font-bold text-[#D4AF37] text-xs mb-2 uppercase tracking-wide">
              {reference}
            </div>

            {/* Verse text */}
            {isLoading ? (
              <div className="flex items-center gap-2 py-1.5">
                <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse" />
                <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:150ms]" />
                <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:300ms]" />
                <span className="text-xs text-neutral-400 ml-1 font-medium">
                  Loading
                </span>
              </div>
            ) : (
              <>
                <p className="text-[15px] leading-relaxed text-white font-serif italic">
                  {verseText}
                </p>

                {/* Trace button */}
                {onTrace && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => {
                        onTrace(reference);
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#F0D77F] text-black text-sm font-medium rounded transition-colors"
                      title="Explore with AI"
                    >
                      Trace
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Arrow pointer - always points up to clicked text */}
        <div
          className="absolute left-1/2 transform -translate-x-1/2"
          style={{ top: "0", transform: "translate(-50%, -100%)" }}
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
  },
);

VerseTooltip.displayName = "VerseTooltip";

export default VerseTooltip;
