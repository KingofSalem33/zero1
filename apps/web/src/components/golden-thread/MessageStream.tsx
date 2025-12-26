import React from "react";
import ReactMarkdown from "react-markdown";

// --- 1. MAIN TITLE (H2) ---
// The exegesis title - large, authoritative, serif
const MainTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-10 mb-8 font-serif text-4xl font-bold text-white leading-tight tracking-tight">
    {children}
  </h2>
);

// --- 2. SECTION HEADERS (H3) ---
// Roman numeral sections - clear hierarchy, refined spacing
const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mt-12 mb-6 font-sans text-xl font-semibold text-white tracking-tight">
    {children}
  </h3>
);

// --- 3. THE INVITATION (Blockquote) ---
// Renders as a distinct, elegant statement with gold accent
const Invitation = ({ children }: { children: React.ReactNode }) => (
  <blockquote className="border-l-4 border-[#D4AF37] pl-8 py-6 my-12 font-serif text-xl italic text-white/95 leading-relaxed bg-[#D4AF37]/5 rounded-r-lg">
    {children}
  </blockquote>
);

// --- 4. CITATION PARSER (Paragraph) ---
// Scans text for [Book Ch:v] patterns and turns them into interactive Gold links.
// Professional typography with optimal readability
const InteractiveText = ({
  children,
  onVerseClick,
}: {
  children: React.ReactNode;
  onVerseClick?: (reference: string, event: React.MouseEvent) => void;
}) => {
  if (typeof children === "string") {
    const cleaned = children.replace(/\bThesis:\s*/g, "");

    // Regex catches ALL Scripture references with or without brackets:
    // - [John 3:16] (with brackets)
    // - John 3:16 (without brackets)
    // - 1 Timothy 3:16 (multi-word books)
    // - Galatians 2:11-14 (verse ranges)
    // - Song of Solomon 2:1 (long book names)
    const parts = cleaned.split(
      /((?:\[)?(?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?(?:\])?)/g,
    );

    return (
      <p className="mb-6 leading-[1.9] text-white font-sans text-[18px] tracking-[-0.01em]">
        {parts.map((part, i) => {
          // Check if this part is a Scripture reference
          const scriptureMatch = part.match(
            /^(?:\[)?((?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?)(?:\])?$/,
          );

          if (scriptureMatch) {
            // Extract reference (remove brackets if present)
            const reference = scriptureMatch[1];

            return (
              <button
                key={i}
                className="text-[#D4AF37] font-bold hover:text-[#F0D77F] hover:underline decoration-[#D4AF37] decoration-2 underline-offset-4 transition-all duration-200 mx-1 cursor-pointer inline-flex items-center gap-0.5"
                onClick={(e) => {
                  onVerseClick?.(reference, e);
                }}
                title="Click to view verse"
              >
                {reference}
              </button>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    );
  }
  return (
    <p className="mb-6 leading-[1.9] text-white font-sans text-[18px] tracking-[-0.01em]">
      {children}
    </p>
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
      } catch {
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
            <p className="text-[15px] leading-relaxed text-white font-serif italic">
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

    // Get click position for tooltip

    const rect = (event.target as HTMLElement).getBoundingClientRect();

    // Simple positioning: always below the clicked text

    // Use viewport coordinates only (no scrollY/scrollX for fixed positioning)

    const spacing = 12;

    const top = rect.bottom + spacing;

    const left = rect.left + rect.width / 2;

    setTooltipData({
      reference,

      position: {
        top,

        left,
      },
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-6 pb-24">
      <ReactMarkdown
        components={{
          // Main title (##)

          h2: MainTitle,

          // Section headers (###)

          h3: SectionHeader,

          // Blockquotes (invitations with >)

          blockquote: Invitation,

          // Paragraphs with citation parsing

          p: ({ children }) => (
            <InteractiveText onVerseClick={handleVerseClick}>
              {children}
            </InteractiveText>
          ),

          // Strong emphasis - refined for readability

          strong: ({ children }) => (
            <span className="font-bold text-white">{children}</span>
          ),

          // Italic emphasis - elegant serif styling

          em: ({ children }) => (
            <span className="font-serif text-[17px] text-white italic">
              {children}
            </span>
          ),

          // Unordered lists - clean, well-spaced

          ul: ({ children }) => (
            <ul className="mb-8 ml-8 space-y-3 list-disc marker:text-[#D4AF37]">
              {children}
            </ul>
          ),

          // Ordered lists - clean, well-spaced

          ol: ({ children }) => (
            <ol className="mb-8 ml-8 space-y-3 list-decimal marker:text-[#D4AF37] marker:font-semibold">
              {children}
            </ol>
          ),

          // List items - optimal line height

          li: ({ children }) => (
            <li className="leading-[1.9] text-white text-[18px] pl-3">
              {children}
            </li>
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
