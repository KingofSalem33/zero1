import { useEffect, useMemo, useState } from "react";
import type { GoDeeperPayload } from "../types/chat";
import type { VisualContextBundle } from "../types/goldenThread";
import { useBibleHighlightsContext } from "../contexts/BibleHighlightsContext";
import { SemanticConnectionModal } from "./golden-thread/SemanticConnectionModal";
import {
  LibraryGridSkeleton,
  HighlightCardSkeleton,
  MapListItemSkeleton,
} from "./Skeleton";
import { useLibraryScrollMemory } from "../hooks/useScrollMemory";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

type BundleMeta = {
  anchorRef?: string;
  verseCount: number;
  edgeCount: number;
};

interface LibraryConnection {
  id: string;
  userId: string;
  bundleId: string;
  fromVerse: { id: number; reference: string; text: string };
  toVerse: { id: number; reference: string; text: string };
  connectionType: string;
  similarity: number;
  synopsis: string;
  explanation?: string;
  connectedVerseIds?: number[];
  connectedVerses?: Array<{ id: number; reference: string; text: string }>;
  goDeeperPrompt: string;
  mapSession: unknown;
  note?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  bundle?: VisualContextBundle;
  bundleMeta?: BundleMeta;
}

interface LibraryMap {
  id: string;
  userId: string;
  bundleId: string;
  title?: string;
  note?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  bundle?: VisualContextBundle;
  bundleMeta?: BundleMeta;
}

interface LibraryViewProps {
  userId?: string;
  onGoDeeper?: (payload: GoDeeperPayload) => void;
  onOpenMap?: (bundle: VisualContextBundle) => void;
  onNavigateToVerse?: (reference?: string) => void;
  onExploreBible?: () => void;
}

type LibraryTab = "connections" | "maps" | "highlights";
type SemanticConnectionType = Parameters<
  typeof SemanticConnectionModal
>[0]["connectionType"];
type SemanticMapSession = GoDeeperPayload["mapSession"];

const CONNECTION_COLORS: Record<string, string> = {
  GOLD: "#D97706",
  PURPLE: "#7C3AED",
  CYAN: "#0891B2",
  GENEALOGY: "#10B981",
  TYPOLOGY: "#EA580C",
  FULFILLMENT: "#14B8A6",
  CONTRAST: "#DC2626",
  PROGRESSION: "#16A34A",
  PATTERN: "#3B82F6",
  DEFAULT: "#9CA3AF",
};

const CONNECTION_LABELS: Record<string, string> = {
  GOLD: "Same Words",
  PURPLE: "Same Teaching",
  CYAN: "Prophecy Fulfilled",
  GENEALOGY: "Lineage",
  TYPOLOGY: "Similar Story",
  FULFILLMENT: "Likely Fulfillment",
  CONTRAST: "Opposite Ideas",
  PROGRESSION: "Progression",
  PATTERN: "Pattern",
};

const getClusterVerseIds = (mapSession: unknown) => {
  if (!mapSession || typeof mapSession !== "object") return undefined;
  const cluster = (mapSession as { cluster?: { verseIds?: unknown } }).cluster;
  if (!cluster || !Array.isArray(cluster.verseIds)) return undefined;
  const ids = cluster.verseIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  return ids.length > 0 ? ids : undefined;
};

const buildVerseListFromBundle = (
  bundle: VisualContextBundle | undefined,
  ids: number[] | undefined,
) => {
  if (!bundle || !Array.isArray(ids) || ids.length === 0) return [];
  const nodeById = new Map(bundle.nodes.map((node) => [node.id, node]));
  return ids
    .map((id) => nodeById.get(id))
    .filter(
      (node): node is VisualContextBundle["nodes"][number] =>
        node !== undefined,
    )
    .map((node) => ({
      id: node.id,
      reference: `${node.book_name} ${node.chapter}:${node.verse}`,
      text: node.text,
    }));
};

const getConnectionVerseList = (connection: LibraryConnection) => {
  if (
    Array.isArray(connection.connectedVerses) &&
    connection.connectedVerses.length > 0
  ) {
    return connection.connectedVerses;
  }
  const ids =
    connection.connectedVerseIds ?? getClusterVerseIds(connection.mapSession);
  const fromBundle = buildVerseListFromBundle(connection.bundle, ids);
  if (fromBundle.length > 0) return fromBundle;
  return [connection.fromVerse, connection.toVerse];
};

// Beautiful illustrated empty state component
function EmptyState({
  type,
  onAction,
}: {
  type: "connections" | "maps" | "highlights";
  onAction?: () => void;
}) {
  const content = {
    connections: {
      title: "Your saved connections will appear here",
      description:
        "Tap any verse connection on the map to save it. Build your personal library of biblical insights.",
      actionLabel: "Explore Bible",
      illustration: (
        <svg
          viewBox="0 0 200 160"
          fill="none"
          className="w-48 h-40"
          aria-hidden="true"
        >
          {/* Gradient definitions */}
          <defs>
            <linearGradient
              id="conn-gradient-1"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#D97706" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient
              id="conn-gradient-2"
              x1="100%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#0891B2" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.4" />
            </linearGradient>
            <filter id="conn-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Connection lines with animation */}
          <path
            d="M50 80 Q100 40 150 80"
            stroke="url(#conn-gradient-1)"
            strokeWidth="2"
            strokeDasharray="8 4"
            fill="none"
            opacity="0.7"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="24"
              to="0"
              dur="2s"
              repeatCount="indefinite"
            />
          </path>
          <path
            d="M50 80 Q100 120 150 80"
            stroke="url(#conn-gradient-2)"
            strokeWidth="2"
            strokeDasharray="8 4"
            fill="none"
            opacity="0.7"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="24"
              dur="2s"
              repeatCount="indefinite"
            />
          </path>

          {/* Left verse node */}
          <g filter="url(#conn-glow)">
            <circle
              cx="50"
              cy="80"
              r="20"
              fill="#1a1a1a"
              stroke="#D97706"
              strokeWidth="2"
            />
            <text
              x="50"
              y="76"
              textAnchor="middle"
              fill="#D97706"
              fontSize="8"
              fontWeight="bold"
            >
              Gen
            </text>
            <text x="50" y="88" textAnchor="middle" fill="#a3a3a3" fontSize="7">
              1:1
            </text>
          </g>

          {/* Right verse node */}
          <g filter="url(#conn-glow)">
            <circle
              cx="150"
              cy="80"
              r="20"
              fill="#1a1a1a"
              stroke="#7C3AED"
              strokeWidth="2"
            />
            <text
              x="150"
              y="76"
              textAnchor="middle"
              fill="#7C3AED"
              fontSize="8"
              fontWeight="bold"
            >
              John
            </text>
            <text
              x="150"
              y="88"
              textAnchor="middle"
              fill="#a3a3a3"
              fontSize="7"
            >
              1:1
            </text>
          </g>

          {/* Center bookmark/save indicator */}
          <g opacity="0.5">
            <path
              d="M95 50 L100 50 L100 62 L97.5 58 L95 62 Z"
              fill="#fafafa"
              opacity="0.8"
            >
              <animate
                attributeName="opacity"
                values="0.4;0.9;0.4"
                dur="2s"
                repeatCount="indefinite"
              />
            </path>
          </g>

          {/* Subtle decorative elements */}
          <circle cx="85" cy="110" r="2" fill="#D97706" opacity="0.3" />
          <circle cx="115" cy="110" r="2" fill="#7C3AED" opacity="0.3" />
          <circle cx="100" cy="120" r="1.5" fill="#0891B2" opacity="0.2" />
        </svg>
      ),
    },
    maps: {
      title: "Your saved maps will appear here",
      description:
        "Save a map snapshot while exploring to bookmark your journey. Return anytime to continue where you left off.",
      actionLabel: "Explore Bible",
      illustration: (
        <svg
          viewBox="0 0 200 160"
          fill="none"
          className="w-48 h-40"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="map-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.4" />
            </linearGradient>
            <filter id="map-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Constellation lines */}
          <g stroke="#3B82F6" strokeWidth="1" opacity="0.4">
            <line x1="60" y1="50" x2="100" y2="70" />
            <line x1="100" y1="70" x2="140" y2="45" />
            <line x1="100" y1="70" x2="120" y2="100" />
            <line x1="120" y1="100" x2="80" y2="110" />
            <line x1="80" y1="110" x2="60" y2="50" />
            <line x1="80" y1="110" x2="100" y2="70" />
          </g>

          {/* Verse nodes as constellation stars */}
          <g filter="url(#map-glow)">
            <circle
              cx="60"
              cy="50"
              r="8"
              fill="#1a1a1a"
              stroke="#3B82F6"
              strokeWidth="1.5"
            >
              <animate
                attributeName="r"
                values="7;9;7"
                dur="3s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx="100"
              cy="70"
              r="12"
              fill="#1a1a1a"
              stroke="#8B5CF6"
              strokeWidth="2"
            >
              <animate
                attributeName="r"
                values="11;13;11"
                dur="2.5s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx="140"
              cy="45"
              r="6"
              fill="#1a1a1a"
              stroke="#3B82F6"
              strokeWidth="1.5"
            >
              <animate
                attributeName="r"
                values="5;7;5"
                dur="3.5s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx="120"
              cy="100"
              r="7"
              fill="#1a1a1a"
              stroke="#06B6D4"
              strokeWidth="1.5"
            />
            <circle
              cx="80"
              cy="110"
              r="9"
              fill="#1a1a1a"
              stroke="#10B981"
              strokeWidth="1.5"
            />
          </g>

          {/* Map frame/save indicator */}
          <rect
            x="40"
            y="30"
            width="120"
            height="100"
            rx="8"
            fill="none"
            stroke="#525252"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.5"
          />

          {/* Save icon */}
          <g transform="translate(92, 130)" opacity="0.6">
            <rect
              x="0"
              y="0"
              width="16"
              height="12"
              rx="2"
              fill="none"
              stroke="#a3a3a3"
              strokeWidth="1"
            />
            <path
              d="M4 4 L8 8 L12 4"
              stroke="#a3a3a3"
              strokeWidth="1"
              fill="none"
            />
          </g>
        </svg>
      ),
    },
    highlights: {
      title: "Your highlights will appear here",
      description:
        "Select any verse while reading and choose a color to highlight it. Your marked passages are saved here.",
      actionLabel: "Read Bible",
      illustration: (
        <svg
          viewBox="0 0 200 160"
          fill="none"
          className="w-48 h-40"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="highlight-yellow"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient
              id="highlight-green"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient
              id="highlight-pink"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#F472B6" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#EC4899" stopOpacity="0.3" />
            </linearGradient>
            <filter
              id="highlight-glow"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Paper/page background */}
          <rect
            x="50"
            y="30"
            width="100"
            height="100"
            rx="4"
            fill="#1f1f1f"
            stroke="#3f3f3f"
            strokeWidth="1"
          />

          {/* Text lines with highlights */}
          <g>
            {/* Line 1 - with yellow highlight */}
            <rect
              x="60"
              y="45"
              width="70"
              height="8"
              rx="1"
              fill="url(#highlight-yellow)"
              filter="url(#highlight-glow)"
            >
              <animate
                attributeName="opacity"
                values="0.7;1;0.7"
                dur="2s"
                repeatCount="indefinite"
              />
            </rect>
            <rect
              x="60"
              y="47"
              width="70"
              height="4"
              rx="0.5"
              fill="#525252"
              opacity="0.3"
            />

            {/* Line 2 - plain */}
            <rect x="60" y="58" width="80" height="4" rx="0.5" fill="#404040" />

            {/* Line 3 - with green highlight */}
            <rect
              x="60"
              y="68"
              width="55"
              height="8"
              rx="1"
              fill="url(#highlight-green)"
              filter="url(#highlight-glow)"
            >
              <animate
                attributeName="opacity"
                values="0.6;0.9;0.6"
                dur="2.5s"
                repeatCount="indefinite"
              />
            </rect>
            <rect
              x="60"
              y="70"
              width="55"
              height="4"
              rx="0.5"
              fill="#525252"
              opacity="0.3"
            />

            {/* Line 4 - plain */}
            <rect x="60" y="81" width="75" height="4" rx="0.5" fill="#404040" />

            {/* Line 5 - with pink highlight */}
            <rect
              x="60"
              y="91"
              width="60"
              height="8"
              rx="1"
              fill="url(#highlight-pink)"
              filter="url(#highlight-glow)"
            >
              <animate
                attributeName="opacity"
                values="0.5;0.85;0.5"
                dur="3s"
                repeatCount="indefinite"
              />
            </rect>
            <rect
              x="60"
              y="93"
              width="60"
              height="4"
              rx="0.5"
              fill="#525252"
              opacity="0.3"
            />

            {/* Line 6 - plain */}
            <rect
              x="60"
              y="104"
              width="65"
              height="4"
              rx="0.5"
              fill="#404040"
            />

            {/* Line 7 - plain shorter */}
            <rect
              x="60"
              y="113"
              width="40"
              height="4"
              rx="0.5"
              fill="#404040"
            />
          </g>

          {/* Highlighter pen */}
          <g transform="translate(130, 85) rotate(45)" opacity="0.7">
            <rect x="0" y="0" width="6" height="35" rx="1" fill="#FBBF24" />
            <rect x="0" y="30" width="6" height="8" rx="1" fill="#78716C" />
            <rect
              x="1"
              y="0"
              width="4"
              height="4"
              rx="0.5"
              fill="#FDE68A"
              opacity="0.6"
            />
          </g>
        </svg>
      ),
    },
  };

  const { title, description, actionLabel, illustration } = content[type];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-6">
      {/* Illustration */}
      <div className="relative">
        {illustration}
        {/* Subtle radial glow behind illustration */}
        <div
          className="absolute inset-0 -z-10 opacity-30 blur-3xl"
          style={{
            background:
              type === "connections"
                ? "radial-gradient(circle, #D97706 0%, transparent 70%)"
                : type === "maps"
                  ? "radial-gradient(circle, #3B82F6 0%, transparent 70%)"
                  : "radial-gradient(circle, #FBBF24 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Text content */}
      <div className="text-center max-w-sm space-y-2">
        <h3 className="text-lg font-semibold text-neutral-200">{title}</h3>
        <p className="text-sm text-neutral-400 leading-relaxed">
          {description}
        </p>
      </div>

      {/* Action button */}
      {onAction && (
        <button
          onClick={onAction}
          className="group mt-2 px-6 py-3 bg-gradient-to-r from-brand-primary-500/20 to-brand-primary-600/20 hover:from-brand-primary-500/30 hover:to-brand-primary-600/30 border border-brand-primary-500/30 hover:border-brand-primary-400/50 text-brand-primary-200 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 shadow-lg shadow-brand-primary-500/10 hover:shadow-brand-primary-500/20"
        >
          <span>{actionLabel}</span>
          <svg
            className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
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
      )}
    </div>
  );
}

export function LibraryView({
  userId = "anonymous",
  onGoDeeper,
  onOpenMap,
  onNavigateToVerse,
  onExploreBible,
}: LibraryViewProps) {
  const { highlights, removeHighlight } = useBibleHighlightsContext();
  const [activeTab, setActiveTab] = useState<LibraryTab>("connections");
  const [connections, setConnections] = useState<LibraryConnection[]>([]);
  const [maps, setMaps] = useState<LibraryMap[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeConnection, setActiveConnection] =
    useState<LibraryConnection | null>(null);

  // Scroll position memory - remembers scroll position per tab
  const { scrollRef: libraryScrollRef } = useLibraryScrollMemory(activeTab);

  useEffect(() => {
    void loadLibrary();
  }, [userId]);

  const loadLibrary = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [connectionsResponse, mapsResponse] = await Promise.all([
        fetch(
          `${API_URL}/api/library/connections?userId=${encodeURIComponent(
            userId,
          )}`,
        ),
        fetch(
          `${API_URL}/api/library/maps?userId=${encodeURIComponent(userId)}`,
        ),
      ]);

      if (!connectionsResponse.ok || !mapsResponse.ok) {
        throw new Error("Failed to load library");
      }

      const connectionsData = await connectionsResponse.json();
      const mapsData = await mapsResponse.json();
      setConnections(connectionsData.connections || []);
      setMaps(mapsData.maps || []);
    } catch (err) {
      console.error("Error loading library:", err);
      setError("Failed to load library");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const truncateText = (text: string, maxLength: number = 150) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const deleteConnection = async (id: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/library/connections/${id}?userId=${encodeURIComponent(
          userId,
        )}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Failed to delete connection");
      }

      setConnections((prev) => prev.filter((entry) => entry.id !== id));
    } catch (err) {
      console.error("Error deleting connection:", err);
      setError("Failed to delete connection");
    }
  };

  const deleteMap = async (id: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/library/maps/${id}?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Failed to delete map");
      }

      setMaps((prev) => prev.filter((entry) => entry.id !== id));
    } catch (err) {
      console.error("Error deleting map:", err);
      setError("Failed to delete map");
    }
  };

  const handleGoDeeper = (connection: LibraryConnection) => {
    if (!onGoDeeper) return;
    if (!connection.bundle) return;

    const displayText = `Go deeper on ${connection.fromVerse.reference} and ${connection.toVerse.reference}.`;

    onGoDeeper({
      displayText,
      prompt: connection.goDeeperPrompt,
      mode: "go_deeper_short",
      visualBundle: connection.bundle,
      mapSession: connection.mapSession as SemanticMapSession,
    });
  };

  const handleOpenConnection = (connection: LibraryConnection) => {
    setActiveConnection(connection);
  };

  const modalPosition = useMemo(() => {
    const width = typeof window !== "undefined" ? window.innerWidth : 900;
    const height = typeof window !== "undefined" ? window.innerHeight : 700;
    return {
      x: Math.max(40, width / 2 - 210),
      y: Math.max(40, height / 2 - 220),
    };
  }, []);

  const handleUpdateConnectionMeta = async (
    id: string,
    note: string,
    tags: string[],
  ) => {
    const response = await fetch(
      `${API_URL}/api/library/connections/${id}?userId=${encodeURIComponent(
        userId,
      )}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, tags }),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to update notes");
    }

    const data = await response.json();
    setConnections((prev) =>
      prev.map((entry) => (entry.id === id ? data.connection : entry)),
    );
    setActiveConnection((prev) =>
      prev && prev.id === id ? data.connection : prev,
    );
  };

  const sortedHighlights = [...highlights].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const sortedConnections = [...connections].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const sortedMaps = [...maps].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const activeConnectedVersesPreview = useMemo(() => {
    if (!activeConnection) return undefined;
    const verseList = getConnectionVerseList(activeConnection);
    return verseList.length > 0 ? verseList : undefined;
  }, [activeConnection]);

  const activeConnectedVerseIds = useMemo(() => {
    if (!activeConnection || !activeConnectedVersesPreview) return undefined;
    if (
      Array.isArray(activeConnection.connectedVerseIds) &&
      activeConnection.connectedVerseIds.length > 0
    ) {
      return activeConnection.connectedVerseIds;
    }
    const idsFromSession = getClusterVerseIds(activeConnection.mapSession);
    if (idsFromSession && idsFromSession.length > 0) {
      return idsFromSession;
    }
    return activeConnectedVersesPreview.map((verse) => verse.id);
  }, [activeConnection, activeConnectedVersesPreview]);

  const emptyStateCount = {
    connections: connections.length,
    maps: maps.length,
    highlights: highlights.length,
  };

  return (
    <div
      ref={libraryScrollRef}
      className="h-screen overflow-y-auto bg-black p-6 md:p-8"
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 flex items-center gap-2">
            <svg
              className="w-8 h-8 text-brand-primary-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
            Library
          </h1>
          <p className="text-neutral-400 text-lg">
            Your saved connections, maps, and highlights in one place.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {(["connections", "maps", "highlights"] as LibraryTab[]).map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab
                    ? "bg-neutral-800/60 backdrop-blur-md border border-amber-300/20 text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "bg-neutral-800/40 backdrop-blur-sm border border-amber-200/[0.08] text-neutral-400 hover:bg-neutral-800/50 hover:border-amber-200/[0.12] hover:text-neutral-300"
                }`}
              >
                {tab === "connections"
                  ? `Connections (${connections.length})`
                  : tab === "maps"
                    ? `Maps (${maps.length})`
                    : `Highlights (${highlights.length})`}
              </button>
            ),
          )}
        </div>

        {isLoading ? (
          activeTab === "connections" ? (
            <LibraryGridSkeleton count={6} />
          ) : activeTab === "maps" ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <MapListItemSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <HighlightCardSkeleton key={i} />
              ))}
            </div>
          )
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <svg
              className="w-12 h-12 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={loadLibrary}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : emptyStateCount[activeTab] === 0 ? (
          <EmptyState
            type={activeTab}
            onAction={onExploreBible || onNavigateToVerse}
          />
        ) : activeTab === "connections" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedConnections.map((connection) => {
              const color =
                CONNECTION_COLORS[connection.connectionType] ||
                CONNECTION_COLORS.DEFAULT;
              const label =
                CONNECTION_LABELS[connection.connectionType] ||
                connection.connectionType;
              const verseList = getConnectionVerseList(connection);
              const maxVisible = 2;
              const visibleVerses = verseList.slice(0, maxVisible);
              const hiddenVerseCount = Math.max(
                0,
                verseList.length - visibleVerses.length,
              );
              return (
                <div
                  key={connection.id}
                  onClick={() => handleOpenConnection(connection)}
                  className="group relative bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-lg shadow-xl overflow-hidden transition-all duration-200 hover:shadow-2xl cursor-pointer"
                >
                  <button
                    onClick={() => deleteConnection(connection.id)}
                    className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-red-300 hover:bg-white/10 transition-all duration-150 z-10 opacity-0 group-hover:opacity-100"
                    aria-label="Delete connection"
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClickCapture={(event) => event.stopPropagation()}
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>

                  <div className="max-h-[80vh] overflow-y-auto p-4 pr-8">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <h3
                        className="font-semibold text-xs uppercase tracking-wide"
                        style={{ color }}
                      >
                        {label}
                      </h3>
                      <span className="text-[10px] text-neutral-400">
                        {Math.round(connection.similarity * 100)}%
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {visibleVerses.map((verse) => (
                        <button
                          key={`${connection.id}-${verse.reference}`}
                          type="button"
                          onClick={() => handleOpenConnection(connection)}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors hover:brightness-110"
                          style={{
                            backgroundColor: `${color}20`,
                            color,
                          }}
                          aria-label={`View ${verse.reference}`}
                        >
                          {verse.reference}
                        </button>
                      ))}
                      {hiddenVerseCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenConnection(connection)}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/5 text-neutral-400 hover:text-neutral-200 transition-colors"
                          aria-label="View all connected verses"
                        >
                          +{hiddenVerseCount} more
                        </button>
                      )}
                    </div>

                    <div className="mb-4">
                      <div className="text-[13px] text-white/80 leading-relaxed line-clamp-4">
                        {truncateText(connection.synopsis, 200)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleGoDeeper(connection)}
                        disabled={!connection.bundle}
                        className="group px-4 py-2 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: `${color}20`,
                          color,
                        }}
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClickCapture={(event) => event.stopPropagation()}
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
              );
            })}
          </div>
        ) : activeTab === "maps" ? (
          <div className="space-y-4">
            {sortedMaps.map((entry) => (
              <div
                key={entry.id}
                className="group relative bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 rounded-lg p-4 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-neutral-500">
                    {formatDate(entry.createdAt)}
                  </span>
                  <button
                    onClick={() => deleteMap(entry.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all"
                    aria-label="Delete map"
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
                <div className="text-sm text-white font-medium">
                  {entry.title || entry.bundleMeta?.anchorRef || "Saved Map"}
                </div>
                <div className="text-xs text-neutral-400 mt-1">
                  {entry.bundleMeta?.verseCount ?? 0} verses •{" "}
                  {entry.bundleMeta?.edgeCount ?? 0} connections
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => entry.bundle && onOpenMap?.(entry.bundle)}
                    disabled={!entry.bundle}
                    className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Open Map
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedHighlights.map((highlight) => (
              <div
                key={highlight.id}
                onClick={() => onNavigateToVerse?.()}
                className="group bg-neutral-900/50 hover:bg-neutral-900/80 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-brand-primary-500/5 hover:scale-[1.02]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-brand-primary-300 font-semibold text-sm mb-0.5">
                      {highlight.book} {highlight.chapter}:{highlight.verse}
                    </h3>
                    <p className="text-neutral-500 text-xs">
                      {formatDate(highlight.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      removeHighlight(highlight.id);
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
                <div
                  className="relative mb-4 p-4 rounded-lg border-l-4 bg-neutral-800/30"
                  style={{
                    borderLeftColor: highlight.color,
                    backgroundColor: `${highlight.color}15`,
                  }}
                >
                  <p className="text-neutral-200 text-sm leading-relaxed line-clamp-4">
                    {highlight.text}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full border border-neutral-700"
                    style={{ backgroundColor: highlight.color }}
                  />
                  <span className="text-neutral-600 text-xs">
                    Click to view in Bible
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeConnection && (
        <SemanticConnectionModal
          fromVerse={activeConnection.fromVerse}
          toVerse={activeConnection.toVerse}
          connectionType={
            activeConnection.connectionType as SemanticConnectionType
          }
          similarity={activeConnection.similarity}
          position={modalPosition}
          onClose={() => setActiveConnection(null)}
          onGoDeeper={(payload) => onGoDeeper?.(payload)}
          explanation={activeConnection.explanation}
          connectedVerseIds={activeConnectedVerseIds}
          connectedVersesPreview={activeConnectedVersesPreview}
          connectionTopics={undefined}
          visualBundle={activeConnection.bundle}
          userId={userId}
          presetSynopsis={activeConnection.synopsis}
          libraryEntry={{
            id: activeConnection.id,
            note: activeConnection.note,
            tags: activeConnection.tags,
          }}
          onUpdateLibraryEntry={handleUpdateConnectionMeta}
          maxVisibleVerses={2}
          goDeeperOverride={
            activeConnection.bundle
              ? {
                  displayText: `Go deeper on ${activeConnection.fromVerse.reference} and ${activeConnection.toVerse.reference}.`,
                  prompt: activeConnection.goDeeperPrompt,
                  mode: "go_deeper_short",
                  visualBundle: activeConnection.bundle,
                  mapSession: activeConnection.mapSession as SemanticMapSession,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

export default LibraryView;
