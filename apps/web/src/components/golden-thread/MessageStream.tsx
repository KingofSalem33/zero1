import React from "react";
import ReactMarkdown from "react-markdown";

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
  onVerseClick?: (reference: string) => void;
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
                className="text-[#B5942F] font-bold hover:text-[#D4AF37] hover:underline decoration-[#D4AF37] underline-offset-4 transition-colors mx-1"
                onClick={() => {
                  onVerseClick?.(reference);
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
  onVerseClick?: (reference: string) => void;
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
                className="text-[#B5942F] font-bold hover:text-[#D4AF37] hover:underline decoration-[#D4AF37] underline-offset-4 transition-colors mx-1"
                onClick={() => {
                  onVerseClick?.(reference);
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

// --- MAIN EXPORT ---
export function MessageStream({
  content,
  onVerseClick,
}: {
  content: string;
  onVerseClick?: (reference: string) => void;
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 pb-24">
      <ReactMarkdown
        components={{
          blockquote: CoreTruth,
          h1: SectionHeader,
          p: ({ children }) => (
            <MaybeInvitation onVerseClick={onVerseClick}>
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
    </div>
  );
}
