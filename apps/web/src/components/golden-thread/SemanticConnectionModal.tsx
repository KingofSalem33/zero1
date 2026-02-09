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
import {
  buildGoDeeperDisplayText,
  buildGoDeeperPrompt,
} from "../../prompts/semanticConnection";
import { useFocusTrap } from "../../hooks/useFocusTrap";

const __DEV__ = import.meta.env.DEV;

type ConnectionFamily =
  | "CROSS_REFERENCE"
  | "LEXICON"
  | "ECHO"
  | "FULFILLMENT"
  | "PATTERN";

type LegacyConnectionType =
  | "GOLD"
  | "PURPLE"
  | "CYAN"
  | "GENEALOGY"
  | "TYPOLOGY"
  | "CONTRAST"
  | "PROGRESSION";

type ConnectionType = ConnectionFamily | LegacyConnectionType;

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
  connectionTitle?: string;
  similarity: number;
  position: { x: number; y: number };
  onClose: () => void;
  onGoDeeper: (prompt: GoDeeperPayload) => void;
  explanation?: string;
  isLLMDiscovered?: boolean;
  isAnchorConnection?: boolean;
  connectedVerseIds?: number[];
  connectedVersesPreview?: Array<{
    id: number;
    reference: string;
    text: string;
  }>;
  connectionTopics?: Array<{
    styleType: ConnectionFamily;
    label: string;
    displayLabel?: string;
    labelSource?: "canonical" | "llm";
    color: string;
    count: number;
    chips?: string[];
    verseIds?: number[];
  }>;
  onSelectTopic?: (styleType: ConnectionFamily) => void;
  visualBundle?: import("../../types/goldenThread").VisualContextBundle; // Pre-built map data
  userId?: string;
  presetSynopsis?: string;
  libraryEntry?: {
    id: string;
    note?: string;
    tags?: string[];
  };
  onUpdateLibraryEntry?: (
    id: string,
    note: string,
    tags: string[],
  ) => Promise<void> | void;
  goDeeperOverride?: GoDeeperPayload;
  maxVisibleVerses?: number;
}

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

const CONNECTION_LABELS: Record<ConnectionFamily, string> = {
  CROSS_REFERENCE: "Cross-Reference",
  LEXICON: "Lexicon",
  ECHO: "Echo",
  FULFILLMENT: "Fulfillment",
  PATTERN: "Pattern",
};

const MODAL_ACCENT_GOLD = "#C5B358";
const MODAL_ACCENT_WHITE = "#F9F4EC";

const LEGACY_CONNECTION_MAP: Record<LegacyConnectionType, ConnectionFamily> = {
  GOLD: "LEXICON",
  PURPLE: "ECHO",
  CYAN: "FULFILLMENT",
  GENEALOGY: "PATTERN",
  TYPOLOGY: "PATTERN",
  CONTRAST: "PATTERN",
  PROGRESSION: "PATTERN",
};

const normalizeConnectionType = (
  connectionType: ConnectionType,
): ConnectionFamily => {
  if (connectionType in LEGACY_CONNECTION_MAP) {
    return LEGACY_CONNECTION_MAP[connectionType as LegacyConnectionType];
  }
  return connectionType as ConnectionFamily;
};

const buildEdgeKey = (connectionType: string, fromId: number, toId: number) => {
  const a = Math.min(fromId, toId);
  const b = Math.max(fromId, toId);
  return `${connectionType}:${a}-${b}`;
};

export function SemanticConnectionModal({
  fromVerse,
  toVerse,
  connectionType,
  connectionTitle,
  similarity,
  position,
  onClose,
  onGoDeeper,
  explanation,
  isLLMDiscovered,
  isAnchorConnection = false,
  connectedVerseIds,
  connectedVersesPreview,
  connectionTopics,
  onSelectTopic,
  visualBundle,
  userId = "anonymous",
  presetSynopsis,
  libraryEntry,
  onUpdateLibraryEntry,
  goDeeperOverride,
  maxVisibleVerses = 6,
}: SemanticConnectionModalProps) {
  const normalizedConnectionType = useMemo(
    () => normalizeConnectionType(connectionType),
    [connectionType],
  );
  const [synopsis, setSynopsis] = useState<string>("");
  const [title, setTitle] = useState<string>(connectionTitle || "");
  const [verses, setVerses] = useState<
    Array<{ id: number; reference: string; text: string }>
  >([]);
  const [loading, setLoading] = useState(true); // Always load synopsis for comprehensive analysis
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [note, setNote] = useState(libraryEntry?.note || "");
  const [tagsInput, setTagsInput] = useState(
    libraryEntry?.tags?.join(", ") || "",
  );
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);
  const [showAllVerses, setShowAllVerses] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const verseTooltipRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<ReturnType<
    typeof window.AbortController
  > | null>(null);
  const requestIdRef = useRef(0);
  const lastRequestKeyRef = useRef<string | null>(null);
  const synopsisRef = useRef("");
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [selectedVerseTooltip, setSelectedVerseTooltip] = useState<{
    reference: string;
    position: { top: number; left: number };
  } | null>(null);

  // Focus trap for accessibility
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true, {
    onEscape: () => {
      setSelectedVerseTooltip(null);
      onClose();
    },
  });
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

  useEffect(() => {
    setShowAllVerses(false);
  }, [verses.length, maxVisibleVerses]);

  useEffect(() => {
    synopsisRef.current = synopsis;
  }, [synopsis]);

  useEffect(() => {
    setTitle(connectionTitle || "");
  }, [connectionTitle]);

  useEffect(() => {
    if (libraryEntry) {
      setNote(libraryEntry.note || "");
      setTagsInput(libraryEntry.tags?.join(", ") || "");
      setSaved(true);
      setMetaSaved(false);
    } else {
      setSaved(false);
    }
    setShowAllVerses(false);
  }, [libraryEntry]);

  useEffect(() => {
    if (libraryEntry) {
      setMetaSaved(false);
    }
  }, [note, tagsInput, libraryEntry]);

  useEffect(() => {
    if (presetSynopsis && presetSynopsis.trim().length > 0) {
      setSynopsis(presetSynopsis);
      setError(null);
      setLoading(false);
    }
  }, [presetSynopsis]);

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
    let isActive = true;

    const fetchSynopsis = async () => {
      try {
        if (presetSynopsis && presetSynopsis.trim().length > 0) {
          setLoading(false);
          return;
        }
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

        const activeSet = new Set(normalizedVerseIds);
        if (__DEV__)
          console.log(
            `[SemanticConnectionModal] Fetching synopsis for ${normalizedVerseIds.length} connected verses`,
          );

        const topicContext = Array.isArray(connectionTopics)
          ? connectionTopics
              .filter((topic) => topic.styleType !== normalizedConnectionType)
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

        const requestKey = JSON.stringify({
          verseIds: normalizedVerseIds,
          connectionType: normalizedConnectionType,
          similarity,
          isLLMDiscovered: Boolean(isLLMDiscovered),
          topicContext,
        });

        if (lastRequestKeyRef.current === requestKey && synopsisRef.current) {
          setLoading(false);
          setError(null);
          return;
        }

        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        const controller = new window.AbortController();
        abortControllerRef.current = controller;
        const requestId = (requestIdRef.current += 1);

        setLoading(true);
        setError(null);
        if (lastRequestKeyRef.current !== requestKey) {
          setSynopsis("");
          setTitle(connectionTitle || "");
          setVerses(previewVerses);
        }

        const response = await fetch(
          `${API_URL}/api/semantic-connection/synopsis`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              verseIds: normalizedVerseIds, // Pass all connected verse IDs
              verses: previewVerses,
              connectionType: normalizedConnectionType,
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
        if (__DEV__)
          console.log("[SemanticConnectionModal] Loaded synopsis:", data);
        const resolvedTitle = typeof data?.title === "string" ? data.title : "";
        setTitle(resolvedTitle);
        const returnedVerses = Array.isArray(data?.verses) ? data.verses : [];
        const orderedVerses = normalizedVerseIds
          .map((id) => returnedVerses.find((verse) => verse.id === id))
          .filter(
            (verse): verse is { id: number; reference: string; text: string } =>
              verse !== undefined,
          );

        // Log missing verses for debugging, but don't fail - use what we have
        if (orderedVerses.length !== normalizedVerseIds.length) {
          const missingIds = normalizedVerseIds.filter(
            (id) => !returnedVerses.some((v) => v.id === id),
          );
          if (__DEV__)
            console.warn(
              `[SemanticConnectionModal] API returned ${orderedVerses.length}/${normalizedVerseIds.length} verses. Missing IDs:`,
              missingIds,
            );
        }

        if (
          !isActive ||
          controller.signal.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        setSynopsis(data.synopsis || "");
        setVerses(orderedVerses);
        lastRequestKeyRef.current = requestKey;
        setLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error(
          "[SemanticConnectionModal] Error fetching synopsis:",
          err,
        );
        if (isActive) {
          setError("Could not load connection analysis");
          setLoading(false);
        }
      }
    };

    fetchSynopsis();

    return () => {
      isActive = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [
    fromVerse.id,
    toVerse.id,
    normalizedConnectionType,
    similarity,
    isLLMDiscovered,
    // Use JSON.stringify to create stable dependency for array
    JSON.stringify(connectedVerseIds || []),
    previewVerses,
    JSON.stringify(connectionTopics || []),
    presetSynopsis,
  ]);

  // Note: Escape key handling is provided by useFocusTrap hook.

  const connectionLabel = CONNECTION_LABELS[normalizedConnectionType];
  const modalTitle = title || (!loading ? connectionLabel : "");
  const showTitleSkeleton = !modalTitle;
  const topicHints = useMemo(() => {
    if (!Array.isArray(connectionTopics) || connectionTopics.length === 0) {
      return [];
    }
    return connectionTopics
      .filter((topic) => typeof topic.label === "string" && topic.label.trim())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((topic) => `${topic.label} (${topic.count})`);
  }, [connectionTopics]);

  const orderedTopics = useMemo(
    () => (Array.isArray(connectionTopics) ? connectionTopics : []),
    [connectionTopics],
  );
  const activeTopicIndex = useMemo(() => {
    if (orderedTopics.length === 0) return 0;
    const index = orderedTopics.findIndex(
      (topic) => topic.styleType === normalizedConnectionType,
    );
    return index >= 0 ? index : 0;
  }, [orderedTopics, normalizedConnectionType]);
  const totalTopics = orderedTopics.length;

  const buildGoDeeperPayload = useCallback(() => {
    const clusterVerseIds = Array.isArray(connectedVerseIds)
      ? [...connectedVerseIds]
      : [];
    if (!clusterVerseIds.includes(fromVerse.id)) {
      clusterVerseIds.unshift(fromVerse.id);
    }
    if (!clusterVerseIds.includes(toVerse.id)) {
      clusterVerseIds.push(toVerse.id);
    }
    const topicVerses = verses.map((verse) => ({
      reference: verse.reference,
      text: verse.text,
    }));
    const goDeeperPrompt = buildGoDeeperPrompt({
      fromVerse,
      toVerse,
      connectionLabel,
      synopsis,
      topicVerses,
      topicHints,
      connectionExplanation: explanation,
    });
    const displayText = buildGoDeeperDisplayText({
      connectionLabel,
      fromReference: fromVerse.reference,
      toReference: toVerse.reference,
    });

    return {
      displayText,
      prompt: goDeeperPrompt,
      mode: "go_deeper_short" as const,
      visualBundle,
      mapSession: {
        cluster: {
          baseId: fromVerse.id,
          verseIds:
            clusterVerseIds.length > 0
              ? clusterVerseIds
              : [fromVerse.id, toVerse.id],
          connectionType: normalizedConnectionType,
        },
        currentConnection: {
          fromId: fromVerse.id,
          toId: toVerse.id,
          connectionType: normalizedConnectionType,
        },
        visitedEdgeKeys: [
          buildEdgeKey(normalizedConnectionType, fromVerse.id, toVerse.id),
        ],
      },
    };
  }, [
    connectedVerseIds,
    fromVerse,
    toVerse,
    verses,
    connectionLabel,
    synopsis,
    topicHints,
    explanation,
    visualBundle,
    normalizedConnectionType,
  ]);

  const handleGoDeeper = () => {
    onGoDeeper(goDeeperOverride ?? buildGoDeeperPayload());
    handleClose();
  };

  const parseTags = (value: string) =>
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

  const handleSaveConnection = async () => {
    if (saving || saved) return;
    if (!visualBundle) {
      setSaveError("Map data is not available for saving.");
      return;
    }

    try {
      setSaving(true);
      setSaveError(null);

      const bundleResponse = await fetch(`${API_URL}/api/library/bundles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          bundle: visualBundle,
        }),
      });

      if (!bundleResponse.ok) {
        throw new Error("Failed to save map snapshot");
      }

      const bundleData = await bundleResponse.json();
      const bundleId = bundleData.bundleId as string | undefined;
      if (!bundleId) {
        throw new Error("Missing bundle ID");
      }

      const goDeeperPayload = buildGoDeeperPayload();
      const clusterVerseIds =
        goDeeperPayload.mapSession?.cluster?.verseIds ?? [];
      const verseSeed = verses.length > 0 ? verses : previewVerses;
      const verseById = new Map(verseSeed.map((verse) => [verse.id, verse]));
      const orderedVerseSeed =
        clusterVerseIds.length > 0
          ? clusterVerseIds
              .map((id) => verseById.get(id))
              .filter(
                (
                  verse,
                ): verse is { id: number; reference: string; text: string } =>
                  verse !== undefined,
              )
          : Array.from(verseById.values());
      const connectionResponse = await fetch(
        `${API_URL}/api/library/connections`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            bundleId,
            fromVerse,
            toVerse,
            connectionType: normalizedConnectionType,
            similarity,
            synopsis,
            explanation,
            connectedVerseIds:
              clusterVerseIds.length > 0 ? clusterVerseIds : undefined,
            connectedVerses:
              orderedVerseSeed.length > 0 ? orderedVerseSeed : undefined,
            goDeeperPrompt: goDeeperPayload.prompt,
            mapSession: goDeeperPayload.mapSession,
          }),
        },
      );

      if (!connectionResponse.ok) {
        throw new Error("Failed to save connection");
      }

      setSaved(true);
    } catch (err) {
      console.error("[SemanticConnectionModal] Save failed:", err);
      setSaveError("Could not save this connection");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLibraryMeta = async () => {
    if (!libraryEntry || metaSaving) return;
    const nextTags = parseTags(tagsInput);
    try {
      setMetaSaving(true);
      setMetaSaved(false);
      if (onUpdateLibraryEntry) {
        await onUpdateLibraryEntry(libraryEntry.id, note, nextTags);
      } else {
        const response = await fetch(
          `${API_URL}/api/library/connections/${libraryEntry.id}?userId=${encodeURIComponent(
            userId,
          )}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note, tags: nextTags }),
          },
        );
        if (!response.ok) {
          throw new Error("Failed to update notes");
        }
      }
      setMetaSaved(true);
    } catch (err) {
      console.error("[SemanticConnectionModal] Note update failed:", err);
    } finally {
      setMetaSaving(false);
    }
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

  const connectionColor = isAnchorConnection
    ? MODAL_ACCENT_GOLD
    : MODAL_ACCENT_WHITE;
  const visibleVerses = showAllVerses
    ? verses
    : verses.slice(0, Math.max(0, maxVisibleVerses));
  const totalVerseCount = useMemo(() => {
    if (Array.isArray(connectedVerseIds) && connectedVerseIds.length > 0) {
      return connectedVerseIds.length;
    }
    return verses.length;
  }, [connectedVerseIds, verses.length]);
  const hiddenVerseCount = showAllVerses
    ? 0
    : Math.max(0, totalVerseCount - visibleVerses.length);

  // Merge refs for modal (focus trap + local ref for positioning)
  const setModalRefs = useCallback(
    (node: HTMLDivElement | null) => {
      // Set local ref
      (modalRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
      // Set focus trap ref
      (focusTrapRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
    },
    [focusTrapRef],
  );

  const modalContent = (
    <div className="fixed inset-0 z-[80]">
      {/* Backdrop to dim the map while the modal is open */}
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px] cursor-default"
        aria-label="Close modal"
        onMouseDown={handleClose}
      />
      <div
        ref={setModalRefs}
        className="absolute transition-all duration-150 ease-out"
        style={{
          left: `${adjustedPosition.x}px`,
          top: `${adjustedPosition.y}px`,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="semantic-connection-title"
      >
        <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden max-w-sm">
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
                id="semantic-connection-title"
                className="relative font-semibold text-xs uppercase tracking-wide"
                style={{ color: connectionColor }}
              >
                <span className={showTitleSkeleton ? "opacity-0" : ""}>
                  {modalTitle || "Loading"}
                </span>
                {showTitleSkeleton && (
                  <span
                    className="absolute left-0 top-1/2 h-2.5 w-40 -translate-y-1/2 rounded bg-white/10 animate-pulse"
                    aria-hidden="true"
                  />
                )}
              </h3>
              <span className="text-[10px] text-neutral-400">
                {Math.round(similarity * 100)}%
              </span>
            </div>

            {/* Compact Verse Reference Chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {verses.length > 0 ? (
                <>
                  {visibleVerses.map((verse, idx) => (
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
                  ))}
                  {hiddenVerseCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllVerses(true)}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/5 text-neutral-300 hover:text-white transition-colors"
                    >
                      Show all {totalVerseCount}
                    </button>
                  )}
                </>
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
            {verses.length > maxVisibleVerses && showAllVerses && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setShowAllVerses((prev) => !prev)}
                  className="text-[10px] text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  Show fewer verses
                </button>
              </div>
            )}

            {/* Synopsis */}
            <div className="mb-3">
              {loading && (
                <div className="space-y-2">
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
                  <div className="space-y-1.5" aria-hidden="true">
                    <div className="h-3 w-full rounded bg-white/[0.06] animate-pulse" />
                    <div className="h-3 w-[90%] rounded bg-white/[0.06] animate-pulse [animation-delay:75ms]" />
                    <div className="h-3 w-[75%] rounded bg-white/[0.06] animate-pulse [animation-delay:150ms]" />
                  </div>
                </div>
              )}
              {error && <div className="text-red-400 text-xs">{error}</div>}
              {!loading && !error && (
                <>
                  <div className="text-[13px] text-white/80 leading-relaxed">
                    {synopsis}
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
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
              {!libraryEntry && (
                <button
                  onClick={handleSaveConnection}
                  disabled={saving || saved || !visualBundle || loading}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: saved
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.06)",
                    color: saved ? "#E5E7EB" : "#D1D5DB",
                  }}
                >
                  {saved ? "Saved" : saving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
            {saveError && (
              <div className="mt-2 text-xs text-red-400">{saveError}</div>
            )}

            {libraryEntry && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                  Notes & Tags
                </div>
                <div className="mt-2 space-y-2">
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add a note about why this matters..."
                    className="w-full rounded-md bg-white/5 border border-white/10 text-xs text-white/80 placeholder:text-neutral-500 p-2 resize-none focus:outline-none focus:border-white/20"
                    rows={2}
                  />
                  <input
                    value={tagsInput}
                    onChange={(event) => setTagsInput(event.target.value)}
                    placeholder="Tags (comma-separated)"
                    className="w-full rounded-md bg-white/5 border border-white/10 text-xs text-white/80 placeholder:text-neutral-500 px-2 py-1.5 focus:outline-none focus:border-white/20"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleUpdateLibraryMeta}
                      disabled={metaSaving}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 bg-white/5 hover:bg-white/10 text-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {metaSaving
                        ? "Saving..."
                        : metaSaved
                          ? "Saved"
                          : "Save Notes"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {totalTopics > 1 && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="flex flex-wrap gap-1.5">
                  {orderedTopics.map((topic, index) => {
                    const isActive = index === activeTopicIndex;
                    const displayName = topic.displayLabel || topic.label;
                    return (
                      <button
                        key={topic.styleType}
                        type="button"
                        onClick={() => onSelectTopic?.(topic.styleType)}
                        className="px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-150"
                        style={{
                          backgroundColor: isActive
                            ? `${topic.color}25`
                            : "rgba(255,255,255,0.05)",
                          color: isActive
                            ? topic.color
                            : "rgba(255,255,255,0.55)",
                          borderWidth: "1px",
                          borderStyle: "solid",
                          borderColor: isActive
                            ? `${topic.color}40`
                            : "rgba(255,255,255,0.08)",
                        }}
                        aria-label={`${displayName}, ${topic.count} ${topic.count === 1 ? "verse" : "verses"}`}
                        aria-current={isActive ? "true" : undefined}
                      >
                        {displayName} ({topic.count})
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
    </div>
  );

  if (typeof document === "undefined") {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}
