import React, { useState, useEffect, useRef } from "react";

interface SemanticConnectionModalProps {
  fromVerse: {
    id: number;
    reference: string;
    text: string;
  };
  toVerse: {
    id: number;
    reference: string;
    text: string;
  };
  connectionType:
    | "GOLD"
    | "PURPLE"
    | "CYAN"
    | "TYPOLOGY"
    | "FULFILLMENT"
    | "CONTRAST"
    | "PROGRESSION"
    | "PATTERN";
  similarity: number;
  position: { x: number; y: number };
  onClose: () => void;
  onTrace: (prompt: string) => void;
  onGoDeeper: (prompt: string) => void;
  explanation?: string;
  isLLMDiscovered?: boolean;
  connectedVerseIds?: number[];
}

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

const CONNECTION_LABELS = {
  GOLD: "Lexical Connection",
  PURPLE: "Theological Connection",
  CYAN: "Prophetic Connection",
  TYPOLOGY: "Typological Pattern",
  FULFILLMENT: "Prophetic Fulfillment",
  CONTRAST: "Theological Contrast",
  PROGRESSION: "Doctrinal Progression",
  PATTERN: "Structural Pattern",
};

const CONNECTION_COLORS = {
  GOLD: "#F59E0B",
  PURPLE: "#8B5CF6",
  CYAN: "#06B6D4",
  TYPOLOGY: "#F97316",
  FULFILLMENT: "#14B8A6",
  CONTRAST: "#EF4444",
  PROGRESSION: "#22C55E",
  PATTERN: "#3B82F6",
};

export function SemanticConnectionModal({
  fromVerse,
  toVerse,
  connectionType,
  similarity,
  position,
  onClose,
  onTrace,
  onGoDeeper,
  explanation: _explanation, // Unused - we always fetch fresh synopsis
  isLLMDiscovered,
  connectedVerseIds,
}: SemanticConnectionModalProps) {
  const [synopsis, setSynopsis] = useState<string>("");
  const [verses, setVerses] = useState<
    Array<{ reference: string; text: string }>
  >([]);
  const [loading, setLoading] = useState(true); // Always load synopsis for comprehensive analysis
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position to keep modal within viewport (horizontally)
  useEffect(() => {
    if (!modalRef.current) return;

    const modalRect = modalRef.current.getBoundingClientRect();
    const modalWidth = modalRect.width || 400; // fallback to max-w-md (28rem = ~448px)

    let newX = position.x;
    let newY = position.y;

    // Keep within horizontal bounds
    if (newX + modalWidth > window.innerWidth) {
      newX = window.innerWidth - modalWidth - 20; // 20px padding
    }
    if (newX < 20) {
      newX = 20;
    }

    // For vertical: just ensure it starts from a reasonable position
    // If too far down, move it up a bit, but don't constrain it
    // Users can scroll the page to see the rest
    if (newY < 20) {
      newY = 20;
    }

    setAdjustedPosition({ x: newX, y: newY });
  }, [position]);

  // Fetch comprehensive synopsis considering all connected verses
  useEffect(() => {
    const fetchSynopsis = async () => {
      setLoading(true);
      setError(null);

      try {
        // Use all connected verse IDs if available, otherwise just the two endpoints
        const verseIds =
          connectedVerseIds && connectedVerseIds.length > 2
            ? connectedVerseIds
            : [fromVerse.id, toVerse.id];

        console.log(
          `[SemanticConnectionModal] Fetching synopsis for ${verseIds.length} connected verses`,
        );

        const response = await fetch(
          `${API_URL}/api/semantic-connection/synopsis`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              verseIds, // Pass all connected verse IDs
              connectionType,
              similarity,
              isLLMDiscovered,
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch synopsis");
        }

        const data = await response.json();
        console.log("[SemanticConnectionModal] Loaded synopsis:", data);
        setSynopsis(data.synopsis || "");
        setVerses(data.verses || []);
      } catch (err) {
        console.error(
          "[SemanticConnectionModal] Error fetching synopsis:",
          err,
        );
        setError("Could not load connection analysis");
      } finally {
        setLoading(false);
      }
    };

    fetchSynopsis();
  }, [
    fromVerse.id,
    toVerse.id,
    connectionType,
    similarity,
    isLLMDiscovered,
    connectedVerseIds,
  ]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideModal = modalRef.current?.contains(target);

      if (!clickedInsideModal) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (event: Event) => {
      if ("key" in event && event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleTrace = () => {
    const tracePrompt = `Trace the ${CONNECTION_LABELS[connectionType].toLowerCase()} between ${fromVerse.reference} and ${toVerse.reference}. Explore the semantic themes and theological significance of this connection.`;
    onTrace(tracePrompt);
    onClose();
  };

  const handleGoDeeper = () => {
    // Format the prompt according to the user's specification
    const goDeeperPrompt = `TASK: Expound upon the significance of this connection.

=== THE DATA ===
[SOURCE ANCHOR]
${fromVerse.reference}: "${fromVerse.text}"

[TARGET CONNECTION]
${toVerse.reference}: "${toVerse.text}"

[METADATA]
- Type: ${CONNECTION_LABELS[connectionType]}
- Previous Synopsis: "${synopsis}"

=== INSTRUCTION ===
Using the KJV text above and the synopsis as a starting point, explain the *theological significance* of this link to the Christian faith.
Do not just repeat the synopsis. Go deeper. Explain *why* this matters.`;

    onGoDeeper(goDeeperPrompt);
    onClose();
  };

  const connectionColor = CONNECTION_COLORS[connectionType];
  const connectionLabel = CONNECTION_LABELS[connectionType];

  return (
    <div
      ref={modalRef}
      className="absolute z-[80] transform -translate-x-1/2 transition-all duration-150 ease-out"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
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
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: connectionColor }}
            />
            <h3
              className="font-semibold text-xs uppercase tracking-wide"
              style={{ color: connectionColor }}
            >
              {connectionLabel}
            </h3>
            <span className="text-[10px] text-neutral-400">
              {Math.round(similarity * 100)}%
            </span>
          </div>

          {/* Compact Verse Reference Chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            {verses.length > 0 ? (
              verses.map((verse, idx) => (
                <div
                  key={idx}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: `${connectionColor}20`,
                    color: connectionColor,
                  }}
                  title={verse.text}
                >
                  {verse.reference}
                </div>
              ))
            ) : (
              // Fallback while loading
              <>
                <div
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: `${connectionColor}20`,
                    color: connectionColor,
                  }}
                >
                  {fromVerse.reference}
                </div>
                <div
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: `${connectionColor}20`,
                    color: connectionColor,
                  }}
                >
                  {toVerse.reference}
                </div>
              </>
            )}
          </div>

          {/* Synopsis */}
          <div className="mb-3">
            {loading && (
              <div className="flex items-center gap-2 py-1.5">
                <div
                  className="w-1 h-1 rounded-full animate-pulse"
                  style={{ backgroundColor: connectionColor }}
                />
                <div
                  className="w-1 h-1 rounded-full animate-pulse [animation-delay:150ms]"
                  style={{ backgroundColor: connectionColor }}
                />
                <div
                  className="w-1 h-1 rounded-full animate-pulse [animation-delay:300ms]"
                  style={{ backgroundColor: connectionColor }}
                />
                <span className="text-xs text-neutral-400 ml-1 font-medium">
                  Analyzing connection
                </span>
              </div>
            )}
            {error && <div className="text-red-400 text-xs">{error}</div>}
            {!loading && !error && (
              <div className="text-[13px] text-white/80 leading-relaxed">
                {synopsis}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTrace}
              disabled={loading}
              className="group px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: `${connectionColor}20`,
                color: connectionColor,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${connectionColor}30`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = `${connectionColor}20`;
              }}
            >
              <span>Trace</span>
              <svg
                className="w-3 h-3 transition-transform group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </button>
            <button
              onClick={handleGoDeeper}
              disabled={loading || !synopsis}
              className="group px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: `${connectionColor}20`,
                color: connectionColor,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${connectionColor}30`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = `${connectionColor}20`;
              }}
            >
              <span>Go Deeper</span>
              <svg
                className="w-3 h-3 transition-transform group-hover:translate-y-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
