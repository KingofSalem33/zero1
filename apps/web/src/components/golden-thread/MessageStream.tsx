import React from "react";
import ReactMarkdown from "react-markdown";

/* global MouseEvent, HTMLElement, Node */

// --- 1. THE CORE TRUTH (Blockquote) ---
// Renders as a distinct, serif, italicized statement with a gold border.
const CoreTruth = ({ children }: { children: React.ReactNode }) => (
  <blockquote className="border-l-4 border-[#D4AF37] pl-6 py-3 my-8 font-serif text-xl italic text-slate-800 leading-relaxed">
    {children}
  </blockquote>
);

// --- 2. SECTION HEADERS (H1) ---
// Renders as small, uppercase, tracking-wide dividers.
// Used for: "# The Primary Text", "# The Biblical Witness", "# The Convergence"
const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h1 className="mt-12 mb-6 text-xs font-bold uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-2">
    {children}
  </h1>
);

// --- 3. CITATION PARSER (Paragraph) ---
// Scans text for [Book Ch:v] patterns and turns them into interactive Gold links.
// This connects the Text Stream to the Narrative Map.
const InteractiveText = ({
  children,
  onVerseClick,
}: {
  children: React.ReactNode;
  onVerseClick?: (reference: string, event: React.MouseEvent) => void;
}) => {
  if (typeof children === "string") {
    // Regex matches [John 3:16] or [1 Peter 5:7]
    const parts = children.split(/(\[(?:[123]\s)?[A-Za-z]+\s\d+:\d+\])/g);

    return (
      <p className="mb-6 leading-7 text-slate-700 font-sans text-base">
        {parts.map((part, i) => {
          if (part.match(/^\[.*\]$/)) {
            // Extract reference without brackets
            const reference = part.slice(1, -1);

            return (
              <button
                key={i}
                className="text-[#B5942F] font-bold hover:text-[#D4AF37] hover:underline decoration-[#D4AF37] underline-offset-4 transition-colors mx-1 cursor-pointer"
                onClick={(e) => {
                  onVerseClick?.(reference, e);
                }}
              >
                {part}
              </button>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    );
  }
  return <p className="mb-6 leading-7 text-slate-700 font-sans">{children}</p>;
};

// --- 4. THE INVITATION (Final Paragraph) ---
// Detects "Shall we..." pattern and styles it as an invitation
const MaybeInvitation = ({
  children,
  onVerseClick,
}: {
  children: React.ReactNode;
  onVerseClick?: (reference: string, event: React.MouseEvent) => void;
}) => {
  if (typeof children === "string" && children.includes("Shall we")) {
    // This is an invitation - style it specially
    // Still need to parse citations within it
    const parts = children.split(/(\[(?:[123]\s)?[A-Za-z]+\s\d+:\d+\])/g);

    return (
      <p className="mt-8 pt-6 border-t border-slate-100 text-slate-600 italic font-sans text-base leading-7">
        {parts.map((part, i) => {
          if (part.match(/^\[.*\]$/)) {
            const reference = part.slice(1, -1);
            return (
              <button
                key={i}
                className="text-[#B5942F] font-bold hover:text-[#D4AF37] hover:underline decoration-[#D4AF37] underline-offset-4 transition-colors mx-1 cursor-pointer"
                onClick={(e) => {
                  onVerseClick?.(reference, e);
                }}
              >
                {part}
              </button>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    );
  }

  // Not an invitation - render as normal interactive text
  return (
    <InteractiveText onVerseClick={onVerseClick}>{children}</InteractiveText>
  );
};

// --- 5. VERSE TOOLTIP ---
// Shows verse text in a tooltip when clicking a citation
const VerseTooltip = ({
  reference,
  position,
  onClose,
}: {
  reference: string;
  position: { top: number; left: number };
  onClose: () => void;
}) => {
  const [verseText, setVerseText] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(true);
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Fetch verse text from API
    const fetchVerse = async () => {
      try {
        const response = await fetch(
          `http://localhost:3001/api/verse/${encodeURIComponent(reference)}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch verse");
        }

        const data = await response.json();
        setVerseText(data.text);
        setIsLoading(false);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error fetching verse:", error);
        setVerseText("Could not load verse text");
        setIsLoading(false);
      }
    };

    fetchVerse();
  }, [reference]);

  // Close on click outside
  React.useEffect(() => {
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

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[70] transform -translate-x-1/2 transition-all duration-150 ease-out"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
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
            <p className="text-[13px] leading-relaxed text-neutral-200 font-serif italic">
              {verseText}
            </p>
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
};

// --- MAIN EXPORT ---
export function MessageStream({
  content,
  onVerseClick: _onVerseClick,
}: {
  content: string;
  onVerseClick?: (reference: string) => void;
}) {
  const [tooltipData, setTooltipData] = React.useState<{
    reference: string;
    position: { top: number; left: number };
  } | null>(null);

  const handleVerseClick = (reference: string, event: React.MouseEvent) => {
    event.preventDefault();
    // eslint-disable-next-line no-console
    console.log("[MessageStream] Verse clicked:", reference);

    // Get click position for tooltip
    const rect = (event.target as HTMLElement).getBoundingClientRect();

    // Simple positioning: always below the clicked text
    // Use viewport coordinates only (no scrollY/scrollX for fixed positioning)
    const spacing = 12;
    const top = rect.bottom + spacing;
    const left = rect.left + rect.width / 2;

    // eslint-disable-next-line no-console
    console.log("[MessageStream] Setting tooltip data:", {
      reference,
      position: { top, left },
    });

    setTooltipData({
      reference,
      position: {
        top,
        left,
      },
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24">
      <ReactMarkdown
        components={{
          blockquote: CoreTruth,
          h1: SectionHeader,
          p: ({ children }) => (
            <MaybeInvitation onVerseClick={handleVerseClick}>
              {children}
            </MaybeInvitation>
          ),
          strong: ({ children }) => (
            <span className="font-semibold text-slate-900">{children}</span>
          ),
          em: ({ children }) => (
            <span className="font-serif text-lg text-slate-900 italic">
              {children}
            </span>
          ),
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Verse tooltip */}
      {tooltipData && (
        <VerseTooltip
          reference={tooltipData.reference}
          position={tooltipData.position}
          onClose={() => setTooltipData(null)}
        />
      )}
    </div>
  );
}
