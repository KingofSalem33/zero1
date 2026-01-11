import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import VerseTooltip from "../VerseTooltip";
import type { GoDeeperPayload } from "../../types/chat";

type ConnectionType =
  | "GOLD"
  | "PURPLE"
  | "CYAN"
  | "GENEALOGY"
  | "TYPOLOGY"
  | "FULFILLMENT"
  | "CONTRAST"
  | "PROGRESSION"
  | "PATTERN";

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
  connectionType: ConnectionType;
  similarity: number;
  position: { x: number; y: number };
  onClose: () => void;
  onTrace: (prompt: string) => void;
  onGoDeeper: (prompt: GoDeeperPayload) => void;
  explanation?: string;
  isLLMDiscovered?: boolean;
  connectedVerseIds?: number[];
  connectedVersesPreview?: Array<{
    id: number;
    reference: string;
    text: string;
  }>;
  connectionTopics?: Array<{
    styleType: ConnectionType;
    label: string;
    color: string;
    count: number;
    verseIds?: number[];
  }>;
  onSelectTopic?: (styleType: ConnectionType) => void;
}

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

const CONNECTION_LABELS = {
  GOLD: "Same Words",
  PURPLE: "Same Teaching",
  CYAN: "Prophecy Fulfilled",
  GENEALOGY: "Lineage",
  TYPOLOGY: "Similar Story",
  FULFILLMENT: "Prophecy Fulfilled",
  CONTRAST: "Opposite Ideas",
  PROGRESSION: "Progression",
  PATTERN: "Pattern",
};

const CONNECTION_COLORS = {
  GOLD: "#D97706",
  PURPLE: "#7C3AED",
  CYAN: "#0891B2",
  GENEALOGY: "#10B981",
  TYPOLOGY: "#EA580C",
  FULFILLMENT: "#14B8A6",
  CONTRAST: "#DC2626",
  PROGRESSION: "#16A34A",
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
  connectedVersesPreview,
  connectionTopics,
  onSelectTopic,
}: SemanticConnectionModalProps) {
  const [synopsis, setSynopsis] = useState<string>("");
  const [verses, setVerses] = useState<
    Array<{ id: number; reference: string; text: string }>
  >([]);
  const [loading, setLoading] = useState(true); // Always load synopsis for comprehensive analysis
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const verseTooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [selectedVerseTooltip, setSelectedVerseTooltip] = useState<{
    reference: string;
    position: { top: number; left: number };
  } | null>(null);
  const hasCluster =
    Array.isArray(connectedVerseIds) && connectedVerseIds.length > 2;
  const previewVerses = useMemo(() => {
    if (
      Array.isArray(connectedVersesPreview) &&
      connectedVersesPreview.length > 0
    ) {
      return connectedVersesPreview;
    }
    if (hasCluster) {
      return [];
    }
    return [
      {
        id: fromVerse.id,
        reference: fromVerse.reference,
        text: fromVerse.text,
      },
      {
        id: toVerse.id,
        reference: toVerse.reference,
        text: toVerse.text,
      },
    ];
  }, [connectedVersesPreview, fromVerse, toVerse, hasCluster]);

  useEffect(() => {
    setVerses(previewVerses);
  }, [previewVerses]);

  useEffect(() => {
    setSelectedVerseTooltip(null);
  }, [verses]);

  const handleClose = useCallback(() => {
    setSelectedVerseTooltip(null);
    onClose();
  }, [onClose]);

  const clampToViewport = useCallback(() => {
    if (!modalRef.current) return;

    const modalRect = modalRef.current.getBoundingClientRect();
    const modalWidth = modalRect.width || 420;
    const modalHeight = modalRect.height || 360;
    const padding = 20;

    const maxX = Math.max(padding, window.innerWidth - modalWidth - padding);
    const maxY = Math.max(padding, window.innerHeight - modalHeight - padding);

    const newX = Math.min(Math.max(position.x, padding), maxX);
    const newY = Math.min(Math.max(position.y, padding), maxY);

    setAdjustedPosition({ x: newX, y: newY });
  }, [position]);

  // Adjust position to keep modal within viewport (fixed positioning).
  useEffect(() => {
    clampToViewport();
  }, [clampToViewport]);

  useEffect(() => {
    const handleResize = () => clampToViewport();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampToViewport]);

  useEffect(() => {
    clampToViewport();
  }, [clampToViewport, synopsis, verses.length, loading]);

  // Fetch comprehensive synopsis considering all connected verses
  useEffect(() => {
    const fetchSynopsis = async () => {
      setLoading(true);
      setError(null);
      setSynopsis("");
      setVerses(previewVerses);

      try {
        // Use all connected verse IDs if available, otherwise just the two endpoints
        const verseIds =
          connectedVerseIds && connectedVerseIds.length > 2
            ? connectedVerseIds
            : [fromVerse.id, toVerse.id];
        const normalizedVerseIds = verseIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0);

        if (
          normalizedVerseIds.length < 2 ||
          normalizedVerseIds.length !== verseIds.length
        ) {
          throw new Error("Invalid verse IDs supplied");
        }

        console.log(
          `[SemanticConnectionModal] Fetching synopsis for ${normalizedVerseIds.length} connected verses`,
        );

        const activeSet = new Set(normalizedVerseIds);
        const topicContext = Array.isArray(connectionTopics)
          ? connectionTopics
              .filter((topic) => topic.styleType !== connectionType)
              .map((topic) => {
                const rawIds = Array.isArray(topic.verseIds)
                  ? topic.verseIds
                  : [];
                const topicIds = rawIds
                  .map((id) => Number(id))
                  .filter((id) => Number.isFinite(id) && id > 0);
                const topicSet = new Set<number>([fromVerse.id, ...topicIds]);
                let intersection = 0;
                topicSet.forEach((id) => {
                  if (activeSet.has(id)) intersection += 1;
                });
                const union = new Set<number>([
                  ...Array.from(activeSet),
                  ...Array.from(topicSet),
                ]).size;
                const overlap = union > 0 ? intersection / union : 0;
                return {
                  styleType: topic.styleType,
                  label: topic.label,
                  overlap,
                };
              })
          : [];

        const response = await fetch(
          `${API_URL}/api/semantic-connection/synopsis`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              verseIds: normalizedVerseIds, // Pass all connected verse IDs
              connectionType,
              similarity,
              isLLMDiscovered,
              topicContext,
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch synopsis");
        }

        const data = await response.json();
        console.log("[SemanticConnectionModal] Loaded synopsis:", data);
        const returnedVerses = Array.isArray(data?.verses) ? data.verses : [];
        const orderedVerses = normalizedVerseIds
          .map((id) => returnedVerses.find((verse) => verse.id === id))
          .filter(
            (verse): verse is { id: number; reference: string; text: string } =>
              verse !== undefined,
          );

        if (orderedVerses.length !== normalizedVerseIds.length) {
          throw new Error("Incomplete verse list returned from API");
        }

        setSynopsis(data.synopsis || "");
        setVerses(orderedVerses);
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
    // Use JSON.stringify to create stable dependency for array
    JSON.stringify(connectedVerseIds || []),
    previewVerses,
    JSON.stringify(connectionTopics || []),
  ]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideModal = modalRef.current?.contains(target);
      const clickedInsideTooltip = verseTooltipRef.current?.contains(target);

      if (!clickedInsideModal && !clickedInsideTooltip) {
        handleClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClose]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (event: Event) => {
      if ("key" in event && event.key === "Escape") handleClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleClose]);

  const handleTrace = () => {
    const tracePrompt = `Trace the ${CONNECTION_LABELS[connectionType].toLowerCase()} between ${fromVerse.reference} and ${toVerse.reference}. Explore the semantic themes and theological significance of this connection.`;
    onTrace(tracePrompt);
    handleClose();
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

    const displayText = `Discuss the ${CONNECTION_LABELS[
      connectionType
    ].toLowerCase()} connection between ${fromVerse.reference} and ${toVerse.reference}.`;

    onGoDeeper({ displayText, prompt: goDeeperPrompt });
    handleClose();
  };

  const handleVerseChipClick = (
    verse: { reference: string },
    event: React.MouseEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    const chipRect = event.currentTarget.getBoundingClientRect();
    const modalRect = modalRef.current?.getBoundingClientRect();

    if (!modalRect) return;

    const spacing = 10;
    const top = chipRect.bottom - modalRect.top + spacing;
    const left = chipRect.left - modalRect.left + chipRect.width / 2;

    setSelectedVerseTooltip((current) => {
      if (current?.reference === verse.reference) {
        return null;
      }
      return {
        reference: verse.reference,
        position: { top, left },
      };
    });
  };

  const connectionColor = CONNECTION_COLORS[connectionType];
  const connectionLabel = CONNECTION_LABELS[connectionType];

  const modalContent = (
    <div
      ref={modalRef}
      className="fixed z-[80] transition-all duration-150 ease-out"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-lg shadow-xl overflow-hidden max-w-sm max-h-[80vh]">
        {/* Close button */}
        <button
          onClick={handleClose}
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
        <div className="max-h-[80vh] overflow-y-auto p-3 pr-8">
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
                <button
                  key={idx}
                  type="button"
                  onClick={(event) => handleVerseChipClick(verse, event)}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors hover:brightness-110"
                  style={{
                    backgroundColor: `${connectionColor}20`,
                    color: connectionColor,
                  }}
                  aria-label={`View ${verse.reference}`}
                >
                  {verse.reference}
                </button>
              ))
            ) : hasCluster ? (
              <div className="text-xs text-neutral-400">
                Loading {connectedVerseIds?.length ?? 0} verses...
              </div>
            ) : (
              // Fallback while loading
              <>
                <button
                  type="button"
                  onClick={(event) => handleVerseChipClick(fromVerse, event)}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: `${connectionColor}20`,
                    color: connectionColor,
                  }}
                >
                  {fromVerse.reference}
                </button>
                <button
                  type="button"
                  onClick={(event) => handleVerseChipClick(toVerse, event)}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: `${connectionColor}20`,
                    color: connectionColor,
                  }}
                >
                  {toVerse.reference}
                </button>
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

          {connectionTopics && connectionTopics.length > 1 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                Topics
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {connectionTopics.map((topic) => {
                  const isActive = topic.styleType === connectionType;
                  return (
                    <button
                      key={topic.styleType}
                      type="button"
                      disabled={isActive}
                      onClick={() => onSelectTopic?.(topic.styleType)}
                      className="px-2 py-1 rounded-full text-[10px] font-semibold transition-colors disabled:cursor-default"
                      style={{
                        backgroundColor: isActive
                          ? `${topic.color}30`
                          : "rgba(255,255,255,0.06)",
                        color: isActive ? topic.color : "#E5E7EB",
                        border: `1px solid ${
                          isActive ? topic.color : "rgba(255,255,255,0.12)"
                        }`,
                      }}
                    >
                      {topic.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedVerseTooltip && (
        <VerseTooltip
          ref={verseTooltipRef}
          reference={selectedVerseTooltip.reference}
          position={selectedVerseTooltip.position}
          onClose={() => setSelectedVerseTooltip(null)}
          accentColor={connectionColor}
          maxWidthClassName="max-w-[92vw] w-[420px]"
        />
      )}
    </div>
  );

  if (typeof document === "undefined") {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}
