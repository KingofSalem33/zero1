import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type {
  LibraryConnection as SharedLibraryConnection,
  LibraryMap as SharedLibraryMap,
} from "@zero1/shared";
import type { GoDeeperPayload } from "../types/chat";
import type { VisualContextBundle } from "../types/goldenThread";
import {
  useBibleHighlightsContext,
  formatVerseRange,
} from "../contexts/BibleHighlightsContext";
import { SemanticConnectionModal } from "./golden-thread/SemanticConnectionModal";
import {
  LibraryGridSkeleton,
  HighlightCardSkeleton,
  MapListItemSkeleton,
} from "./Skeleton";
import { useLibraryScrollMemory } from "../hooks/useScrollMemory";
import { useToast } from "./Toast";
import { ErrorState } from "./ErrorState";
import { TabBar } from "./TabBar";
import { HighlightCard } from "./HighlightCard";
import { useBibleBookmarks } from "../contexts/BibleBookmarksContext";
import { useBibleNotes } from "../hooks/useBibleNotes";
import { useAuth } from "../contexts/AuthContext";
import {
  isAuthenticationRequiredError,
  WEB_SIGN_IN_PATH,
} from "../lib/authErrors";
import {
  deleteLibraryConnection,
  deleteLibraryMap,
  fetchLibraryConnections,
  fetchLibraryMaps,
  updateLibraryConnection,
} from "../lib/libraryApi";

type LibraryConnection = SharedLibraryConnection & {
  fromVerse: { id: number; reference: string; text: string };
  toVerse: { id: number; reference: string; text: string };
  connectedVerses?: Array<{ id: number; reference: string; text: string }>;
  bundle?: VisualContextBundle;
};

type LibraryMap = SharedLibraryMap & {
  bundle?: VisualContextBundle;
};

interface LibraryViewProps {
  onGoDeeper?: (payload: GoDeeperPayload) => void;
  onOpenMap?: (bundle: VisualContextBundle) => void;
  onNavigateToVerse?: (reference?: string) => void;
  onExploreBible?: () => void;
}

type LibraryTab = "connections" | "maps" | "highlights" | "bookmarks" | "notes";
type SemanticConnectionType = Parameters<
  typeof SemanticConnectionModal
>[0]["connectionType"];
type SemanticMapSession = GoDeeperPayload["mapSession"];

const CONNECTION_COLORS: Record<string, string> = {
  CROSS_REFERENCE: "#22C55E",
  LEXICON: "#F59E0B",
  ECHO: "#6366F1",
  FULFILLMENT: "#06B6D4",
  PATTERN: "#A78BFA",
  // Legacy fallbacks
  GOLD: "#F59E0B",
  PURPLE: "#6366F1",
  CYAN: "#06B6D4",
  GENEALOGY: "#A78BFA",
  TYPOLOGY: "#A78BFA",
  CONTRAST: "#A78BFA",
  PROGRESSION: "#A78BFA",
  DEFAULT: "#9CA3AF",
};

const CONNECTION_LABELS: Record<string, string> = {
  CROSS_REFERENCE: "Cross-Reference",
  LEXICON: "Lexicon",
  ECHO: "Echo",
  FULFILLMENT: "Fulfillment",
  PATTERN: "Pattern",
  // Legacy fallbacks
  GOLD: "Lexicon",
  PURPLE: "Echo",
  CYAN: "Fulfillment",
  GENEALOGY: "Pattern",
  TYPOLOGY: "Pattern",
  CONTRAST: "Pattern",
  PROGRESSION: "Pattern",
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
  type: LibraryTab;
  onAction?: () => void;
}) {
  const content: Record<
    LibraryTab,
    {
      title: string;
      description: string;
      actionLabel: string;
      illustration: React.ReactNode;
    }
  > = {
    connections: {
      title: "Your saved connections will appear here",
      description:
        "Tap any verse connection on the map to save it. Build your personal library of biblical insights.",
      actionLabel: "Read Bible",
      illustration: (
        <svg
          viewBox="0 0 200 160"
          fill="none"
          className="w-48 h-40"
          aria-hidden="true"
        >
          <defs>
            <filter id="conn-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Bezier edge between the two nodes */}
          <path
            d="M72 80 Q100 50 128 80"
            stroke="#C5B358"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.45"
          />
          <path
            d="M72 80 Q100 110 128 80"
            stroke="#525252"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.3"
          />

          {/* Left verse node — rounded rect */}
          <g filter="url(#conn-glow)">
            <rect
              x="30"
              y="66"
              width="42"
              height="26"
              rx="6"
              fill="#1a1a1a"
              stroke="#C5B358"
              strokeWidth="1.5"
            />
            <rect
              x="37"
              y="75"
              width="28"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.5"
            />
            <rect
              x="40"
              y="82"
              width="20"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.3"
            />
          </g>

          {/* Right verse node — rounded rect */}
          <g filter="url(#conn-glow)">
            <rect
              x="128"
              y="66"
              width="42"
              height="26"
              rx="6"
              fill="#1a1a1a"
              stroke="#3f3f3f"
              strokeWidth="1"
            />
            <rect
              x="135"
              y="75"
              width="28"
              height="3"
              rx="1"
              fill="#404040"
              opacity="0.5"
            />
            <rect
              x="138"
              y="82"
              width="20"
              height="3"
              rx="1"
              fill="#404040"
              opacity="0.3"
            />
          </g>

          {/* Small connection type pill at midpoint */}
          <rect
            x="88"
            y="52"
            width="24"
            height="10"
            rx="5"
            fill="#1a1a1a"
            stroke="#3f3f3f"
            strokeWidth="0.8"
          />
          <rect
            x="93"
            y="56"
            width="14"
            height="2"
            rx="1"
            fill="#C5B358"
            opacity="0.4"
          />

          {/* Subtle accent dots */}
          <circle cx="85" cy="105" r="1.5" fill="#C5B358" opacity="0.2" />
          <circle cx="115" cy="105" r="1.5" fill="#525252" opacity="0.2" />
        </svg>
      ),
    },
    maps: {
      title: "Your saved maps will appear here",
      description:
        "Save a map snapshot while exploring to bookmark your journey. Return anytime to continue where you left off.",
      actionLabel: "Read Bible",
      illustration: (
        <svg
          viewBox="0 0 200 160"
          fill="none"
          className="w-48 h-40"
          aria-hidden="true"
        >
          <defs>
            <filter id="map-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Bezier edges — gold for anchor rays, white for others */}
          <path
            d="M100 75 Q72 58 55 48"
            stroke="#C5B358"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.4"
          />
          <path
            d="M100 75 Q128 55 145 45"
            stroke="#C5B358"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.4"
          />
          <path
            d="M100 85 Q120 98 135 112"
            stroke="#525252"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.35"
          />
          <path
            d="M100 85 Q80 98 65 112"
            stroke="#525252"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.35"
          />
          <path
            d="M55 48 Q58 80 65 112"
            stroke="#404040"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.2"
          />
          <path
            d="M145 45 Q142 78 135 112"
            stroke="#404040"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.2"
          />

          {/* Anchor node — larger, gold border */}
          <g filter="url(#map-glow)">
            <rect
              x="75"
              y="66"
              width="50"
              height="26"
              rx="6"
              fill="#1a1a1a"
              stroke="#C5B358"
              strokeWidth="1.5"
            />
            <rect
              x="82"
              y="73"
              width="36"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.5"
            />
            <rect
              x="86"
              y="80"
              width="28"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.3"
            />
          </g>

          {/* Leaf nodes — smaller, neutral borders, rounded rects */}
          <g>
            <rect
              x="34"
              y="38"
              width="42"
              height="18"
              rx="5"
              fill="#1a1a1a"
              stroke="#3f3f3f"
              strokeWidth="1"
            />
            <rect
              x="40"
              y="45"
              width="28"
              height="3"
              rx="1"
              fill="#404040"
              opacity="0.5"
            />

            <rect
              x="124"
              y="35"
              width="42"
              height="18"
              rx="5"
              fill="#1a1a1a"
              stroke="#3f3f3f"
              strokeWidth="1"
            />
            <rect
              x="130"
              y="42"
              width="28"
              height="3"
              rx="1"
              fill="#404040"
              opacity="0.5"
            />

            <rect
              x="44"
              y="104"
              width="42"
              height="18"
              rx="5"
              fill="#1a1a1a"
              stroke="#3f3f3f"
              strokeWidth="1"
            />
            <rect
              x="50"
              y="111"
              width="28"
              height="3"
              rx="1"
              fill="#404040"
              opacity="0.5"
            />

            <rect
              x="114"
              y="104"
              width="42"
              height="18"
              rx="5"
              fill="#1a1a1a"
              stroke="#3f3f3f"
              strokeWidth="1"
            />
            <rect
              x="120"
              y="111"
              width="28"
              height="3"
              rx="1"
              fill="#404040"
              opacity="0.5"
            />
          </g>

          {/* Subtle gold accent dots at edge midpoints */}
          <circle cx="76" cy="62" r="1.5" fill="#C5B358" opacity="0.3" />
          <circle cx="124" cy="59" r="1.5" fill="#C5B358" opacity="0.3" />
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
    bookmarks: {
      title: "No bookmarks yet",
      description:
        "Tap any verse number while reading, then tap the bookmark icon to save it. Your marked verses appear here for quick access.",
      actionLabel: "Read Bible",
      illustration: (
        <svg
          viewBox="0 0 200 160"
          fill="none"
          className="w-48 h-40"
          aria-hidden="true"
        >
          <defs>
            <filter id="bk-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Bookmark ribbon */}
          <g filter="url(#bk-glow)">
            <path
              d="M80 35 L80 115 L100 100 L120 115 L120 35 Z"
              fill="#1a1a1a"
              stroke="#C5B358"
              strokeWidth="1.5"
            />
            <rect
              x="88"
              y="50"
              width="24"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.5"
            />
            <rect
              x="90"
              y="58"
              width="20"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.35"
            />
            <rect
              x="88"
              y="66"
              width="24"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.25"
            />
            <rect
              x="92"
              y="74"
              width="16"
              height="3"
              rx="1"
              fill="#C5B358"
              opacity="0.3"
            />
          </g>
          <circle cx="70" cy="125" r="1.5" fill="#C5B358" opacity="0.2" />
          <circle cx="130" cy="125" r="1.5" fill="#525252" opacity="0.2" />
        </svg>
      ),
    },
    notes: {
      title: "No notes yet",
      description:
        "Tap a verse number and use the pencil icon to add personal notes. Your reflections and study notes are saved here.",
      actionLabel: "Read Bible",
      illustration: (
        <svg
          viewBox="0 0 200 160"
          fill="none"
          className="w-48 h-40"
          aria-hidden="true"
        >
          <defs>
            <filter id="note-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Notepad */}
          <g filter="url(#note-glow)">
            <rect
              x="60"
              y="30"
              width="80"
              height="100"
              rx="4"
              fill="#1a1a1a"
              stroke="#3f3f3f"
              strokeWidth="1"
            />
            <rect
              x="70"
              y="45"
              width="60"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.5"
            />
            <rect
              x="70"
              y="55"
              width="50"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.35"
            />
            <rect
              x="70"
              y="65"
              width="55"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.25"
            />
            <rect
              x="70"
              y="75"
              width="45"
              height="3"
              rx="1"
              fill="#525252"
              opacity="0.2"
            />
          </g>
          {/* Pencil */}
          <g transform="translate(135, 55) rotate(30)" opacity="0.7">
            <rect x="0" y="0" width="5" height="40" rx="1" fill="#C5B358" />
            <polygon points="0,40 5,40 2.5,48" fill="#C5B358" opacity="0.8" />
            <rect
              x="0.5"
              y="0"
              width="4"
              height="4"
              rx="0.5"
              fill="#FDE68A"
              opacity="0.6"
            />
          </g>
          <circle cx="55" cy="140" r="1.5" fill="#C5B358" opacity="0.2" />
          <circle cx="145" cy="140" r="1.5" fill="#525252" opacity="0.2" />
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
                : type === "maps" || type === "bookmarks" || type === "notes"
                  ? "radial-gradient(circle, #C5B358 0%, transparent 70%)"
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
          className="group mt-2 px-6 py-3 bg-gradient-to-r from-brand-primary-500/20 to-brand-primary-600/20 hover:from-brand-primary-500/30 hover:to-brand-primary-600/30 border border-brand-primary-500/30 hover:border-brand-primary-400/50 text-brand-primary-200 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 shadow-lg shadow-brand-primary-500/10 hover:shadow-brand-primary-500/20"
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
  onGoDeeper,
  onOpenMap,
  onNavigateToVerse,
  onExploreBible,
}: LibraryViewProps) {
  const { highlights, removeHighlight, updateHighlight } =
    useBibleHighlightsContext();
  const { bookmarks, removeBookmark } = useBibleBookmarks();
  const { allNotes, setNote } = useBibleNotes();
  const { session } = useAuth();
  const navigate = useNavigate();
  const notes = allNotes();
  const { toast } = useToast();
  const pendingDeleteTimers = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const [activeTab, setActiveTab] = useState<LibraryTab>("connections");
  const [connections, setConnections] = useState<LibraryConnection[]>([]);
  const [maps, setMaps] = useState<LibraryMap[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeConnection, setActiveConnection] =
    useState<LibraryConnection | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const hasAuthSession = Boolean(session?.access_token);

  // Scroll position memory - remembers scroll position per tab
  const { scrollRef: libraryScrollRef } = useLibraryScrollMemory(activeTab);

  const openSignIn = useCallback(() => {
    navigate(WEB_SIGN_IN_PATH);
  }, [navigate]);

  const loadLibrary = useCallback(async () => {
    if (!hasAuthSession) {
      setConnections([]);
      setMaps([]);
      setError("Sign in required to load Library");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const [connectionsData, mapsData] = await Promise.all([
        fetchLibraryConnections(),
        fetchLibraryMaps(),
      ]);
      setConnections(connectionsData as LibraryConnection[]);
      setMaps(mapsData as LibraryMap[]);
    } catch (err) {
      if (isAuthenticationRequiredError(err)) {
        console.info("[LibraryView] Load blocked: user not authenticated.");
        setError("Sign in required to load Library");
      } else {
        console.error("Error loading library:", err);
        setError("Failed to load library");
      }
    } finally {
      setIsLoading(false);
    }
  }, [hasAuthSession]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

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

  const getExportData = useCallback(() => {
    if (activeTab === "connections") {
      return connections.map((c) => ({
        type: c.connectionType,
        fromVerse: c.fromVerse,
        toVerse: c.toVerse,
        synopsis: c.synopsis,
        explanation: c.explanation,
        note: c.note,
        tags: c.tags,
        savedAt: c.createdAt,
      }));
    } else if (activeTab === "highlights") {
      return highlights.map((h) => ({
        reference: `${h.book} ${h.chapter}:${formatVerseRange(h.verses)}`,
        text: h.text,
        color: h.color,
        savedAt: h.createdAt,
      }));
    } else {
      return maps.map((m) => ({
        title: m.title,
        verseCount: m.verseCount,
        savedAt: m.createdAt,
      }));
    }
  }, [activeTab, connections, highlights, maps]);

  const exportAsText = useCallback(() => {
    const data = getExportData();
    const label = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
    let text = `Biblelot ${label} Export\n${"=".repeat(30)}\n\n`;

    if (activeTab === "connections") {
      (data as ReturnType<typeof getExportData>).forEach(
        (item: Record<string, unknown>, i: number) => {
          text += `${i + 1}. [${item.type}] ${item.fromVerse} → ${item.toVerse}\n`;
          if (item.synopsis) text += `   ${item.synopsis}\n`;
          if (item.note) text += `   Note: ${item.note}\n`;
          text += "\n";
        },
      );
    } else if (activeTab === "highlights") {
      (data as ReturnType<typeof getExportData>).forEach(
        (item: Record<string, unknown>, i: number) => {
          text += `${i + 1}. ${item.reference}\n`;
          text += `   "${item.text}"\n\n`;
        },
      );
    } else {
      (data as ReturnType<typeof getExportData>).forEach(
        (item: Record<string, unknown>, i: number) => {
          text += `${i + 1}. ${item.title} (${item.verseCount} verses)\n`;
        },
      );
    }

    navigator.clipboard.writeText(text);
    toast(`${label} copied to clipboard`, { type: "success", duration: 2000 });
    setShowExportMenu(false);
  }, [getExportData, activeTab, toast]);

  const exportAsJSON = useCallback(() => {
    const data = getExportData();
    const label = activeTab;
    const blob = new window.Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biblelot-${label}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast(`${label} downloaded as JSON`, { type: "success", duration: 2000 });
    setShowExportMenu(false);
  }, [getExportData, activeTab, toast]);

  const deleteConnection = (id: string) => {
    // Optimistic removal with undo
    const removed = connections.find((c) => c.id === id);
    if (!removed) return;
    setConnections((prev) => prev.filter((entry) => entry.id !== id));

    // Schedule actual API delete after toast expires
    const timer = setTimeout(async () => {
      pendingDeleteTimers.current.delete(id);
      try {
        await deleteLibraryConnection(id);
      } catch (err) {
        console.error("Error deleting connection:", err);
        // Restore on API failure
        setConnections((prev) => [...prev, removed]);
        setError("Failed to delete connection");
      }
    }, 5000);
    pendingDeleteTimers.current.set(id, timer);

    toast("Connection deleted", {
      duration: 5000,
      onUndo: () => {
        clearTimeout(timer);
        pendingDeleteTimers.current.delete(id);
        setConnections((prev) => [...prev, removed]);
      },
    });
  };

  const deleteMap = (id: string) => {
    const removed = maps.find((m) => m.id === id);
    if (!removed) return;
    setMaps((prev) => prev.filter((entry) => entry.id !== id));

    const timer = setTimeout(async () => {
      pendingDeleteTimers.current.delete(id);
      try {
        await deleteLibraryMap(id);
      } catch (err) {
        console.error("Error deleting map:", err);
        setMaps((prev) => [...prev, removed]);
        setError("Failed to delete map");
      }
    }, 5000);
    pendingDeleteTimers.current.set(id, timer);

    toast("Map deleted", {
      duration: 5000,
      onUndo: () => {
        clearTimeout(timer);
        pendingDeleteTimers.current.delete(id);
        setMaps((prev) => [...prev, removed]);
      },
    });
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
    const connection = (await updateLibraryConnection(id, {
      note,
      tags,
    })) as LibraryConnection;
    setConnections((prev) =>
      prev.map((entry) => (entry.id === id ? connection : entry)),
    );
    setActiveConnection((prev) => (prev && prev.id === id ? connection : prev));
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

  const emptyStateCount: Record<LibraryTab, number> = {
    connections: connections.length,
    maps: maps.length,
    highlights: highlights.length,
    bookmarks: bookmarks.length,
    notes: notes.length,
  };

  return (
    <div ref={libraryScrollRef} className="h-screen overflow-y-auto bg-black">
      {/* Header chrome — matches Reader bar */}
      <div className="flex-shrink-0 border-b border-neutral-800/50 bg-neutral-900/50">
        <div className="max-w-6xl mx-auto px-6 py-4 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <svg
                className="w-6 h-6 text-brand-primary-400"
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
              <h1 className="text-lg font-semibold text-white">Library</h1>
            </div>
            <p className="text-neutral-500 text-sm hidden md:block">
              Connections, maps, and highlights
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-8 pt-6">
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <TabBar
            tabs={[
              {
                key: "connections",
                label: `Connections (${connections.length})`,
              },
              { key: "maps", label: `Maps (${maps.length})` },
              { key: "highlights", label: `Highlights (${highlights.length})` },
              { key: "bookmarks", label: `Bookmarks (${bookmarks.length})` },
              { key: "notes", label: `Notes (${notes.length})` },
            ]}
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as LibraryTab)}
          />

          {/* Export button */}
          {((activeTab === "connections" && connections.length > 0) ||
            (activeTab === "maps" && maps.length > 0) ||
            (activeTab === "highlights" && highlights.length > 0)) && (
            <div className="relative ml-auto">
              <button
                onClick={() => setShowExportMenu((prev) => !prev)}
                className="p-2 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors"
                title="Export"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </button>
              {showExportMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl z-40 p-1">
                    <button
                      onClick={exportAsText}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/60 rounded-lg transition-colors"
                    >
                      <svg
                        className="w-4 h-4 text-neutral-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      Copy as text
                    </button>
                    <button
                      onClick={exportAsJSON}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/60 rounded-lg transition-colors"
                    >
                      <svg
                        className="w-4 h-4 text-neutral-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      Download JSON
                    </button>
                  </div>
                </>
              )}
            </div>
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
          <ErrorState
            title={error}
            detail={
              !hasAuthSession
                ? "Open sign-in, authenticate, then return to Library."
                : undefined
            }
            onRetry={!hasAuthSession ? openSignIn : loadLibrary}
            retryLabel={!hasAuthSession ? "Open Sign In" : "Try Again"}
          />
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
                  className="group relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden transition-all duration-200 hover:shadow-2xl cursor-pointer"
                >
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteConnection(connection.id);
                    }}
                    className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-red-300 hover:bg-white/10 transition-all duration-150 z-10 opacity-0 group-hover:opacity-100"
                    aria-label="Delete connection"
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
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
                        onClick={(event) => {
                          event.stopPropagation();
                          handleGoDeeper(connection);
                        }}
                        disabled={!connection.bundle}
                        className="group px-4 py-2 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: `${color}20`,
                          color,
                        }}
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
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
                className="group relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden p-4 transition-all duration-200 hover:shadow-2xl cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-neutral-500">
                    {formatDate(entry.createdAt)}
                  </span>
                  <button
                    onClick={() => deleteMap(entry.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-neutral-500 hover:text-red-300 hover:bg-white/10 transition-all duration-150"
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
                    className="px-4 py-2 bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] rounded-md text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Open Map
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* AI Insights button for highlights */}
            {highlights.length >= 3 && onGoDeeper && (
              <div className="mb-4 flex items-center gap-3">
                <button
                  onClick={() => {
                    const sample = highlights.slice(0, 20);
                    const refs = sample
                      .map(
                        (h) =>
                          `- ${h.book} ${h.chapter}:${formatVerseRange(h.verses)} (${h.color})${h.note ? ` — "${h.note}"` : ""}`,
                      )
                      .join("\n");
                    const prompt = `Analyze my Bible highlights and share insights. Here are my highlighted passages:\n\n${refs}\n\nPlease identify:\n1. Recurring themes or patterns across these highlights\n2. How these passages connect theologically\n3. A short devotional reflection based on what I've been drawn to\n\nKeep the tone scholarly but warm.`;
                    onGoDeeper({
                      displayText: `Analyze my ${highlights.length} highlights for patterns and insights`,
                      prompt,
                      mode: "exegesis_long",
                    });
                  }}
                  className="px-4 py-2 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/20 hover:border-[#D4AF37]/40 text-[#D4AF37] rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-2"
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
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  AI Insights
                </button>
                <span className="text-neutral-600 text-[11px]">
                  Discover themes and patterns in your highlights
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedHighlights.map((highlight) => (
                <div
                  key={highlight.id}
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "auto 200px",
                  }}
                >
                  <HighlightCard
                    highlight={highlight}
                    onDelete={removeHighlight}
                    onUpdateNote={(id, note) =>
                      updateHighlight(id, { note: note || undefined })
                    }
                    onUpdateColor={(id, color) =>
                      updateHighlight(id, { color })
                    }
                    onClick={() => onNavigateToVerse?.()}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Bookmarks tab */}
        {activeTab === "bookmarks" && bookmarks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookmarks.map((bookmark) => {
              const ref = bookmark.verse
                ? `${bookmark.book} ${bookmark.chapter}:${bookmark.verse}`
                : `${bookmark.book} ${bookmark.chapter}`;
              return (
                <div
                  key={bookmark.id}
                  className="group relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden transition-all duration-200 hover:shadow-2xl cursor-pointer p-4"
                  onClick={() => {
                    if (bookmark.verse) {
                      onNavigateToVerse?.(
                        `${bookmark.book} ${bookmark.chapter}:${bookmark.verse}`,
                      );
                    } else {
                      onNavigateToVerse?.();
                    }
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBookmark(bookmark.id);
                    }}
                    className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-red-300 hover:bg-white/10 transition-all duration-150 z-10 opacity-0 group-hover:opacity-100"
                    aria-label="Remove bookmark"
                    type="button"
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
                  <div className="flex items-center gap-2 mb-2">
                    <svg
                      className="w-4 h-4 text-[#D4AF37]"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    <span className="font-bold text-[#D4AF37] text-sm">
                      {ref}
                    </span>
                  </div>
                  {bookmark.note && (
                    <p className="text-sm text-neutral-300 line-clamp-2">
                      {bookmark.note}
                    </p>
                  )}
                  <div className="text-xs text-neutral-500 mt-2">
                    {new Date(bookmark.createdAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Notes tab */}
        {activeTab === "notes" && notes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {notes.map((note) => {
              const [book, chapter, verse] = note.key.split(":");
              const ref = `${book} ${chapter}:${verse}`;
              return (
                <div
                  key={note.key}
                  className="group relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden transition-all duration-200 hover:shadow-2xl cursor-pointer p-4"
                  onClick={() => onNavigateToVerse?.(ref)}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNote(book, parseInt(chapter), parseInt(verse), "");
                    }}
                    className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-red-300 hover:bg-white/10 transition-all duration-150 z-10 opacity-0 group-hover:opacity-100"
                    aria-label="Delete note"
                    type="button"
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
                  <div className="flex items-center gap-2 mb-2">
                    <svg
                      className="w-4 h-4 text-[#D4AF37]/70"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    <span className="font-bold text-[#D4AF37] text-sm">
                      {ref}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-300 line-clamp-3">
                    {note.text}
                  </p>
                  <div className="text-xs text-neutral-500 mt-2">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
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
