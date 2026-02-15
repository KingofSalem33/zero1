import { useState, useEffect, useMemo } from "react";
import type { GoDeeperPayload } from "../types/chat";
import type { VisualContextBundle } from "../types/goldenThread";
import { SemanticConnectionModal } from "./golden-thread/SemanticConnectionModal";

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

interface BookmarkPanelProps {
  userId?: string;
  onClose: () => void;
  onGoDeeper?: (payload: GoDeeperPayload) => void;
  onOpenMap?: (bundle: VisualContextBundle) => void;
}

type LibraryTab = "connections" | "maps";

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

export function BookmarkPanel({
  userId = "anonymous",
  onClose,
  onGoDeeper,
  onOpenMap,
}: BookmarkPanelProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>("connections");
  const [connections, setConnections] = useState<LibraryConnection[]>([]);
  const [maps, setMaps] = useState<LibraryMap[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeConnection, setActiveConnection] =
    useState<LibraryConnection | null>(null);

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
      mapSession: connection.mapSession as any,
    });
    onClose();
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

  const emptyState = activeTab === "connections" ? connections : maps;
  const connectionCount = connections.length;
  const mapCount = maps.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[80vh] bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-400"
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
            <h2 className="text-lg font-semibold text-white">Library</h2>
            <span className="text-sm text-neutral-400">
              {activeTab === "connections"
                ? `(${connectionCount})`
                : `(${mapCount})`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close library"
          >
            <svg
              className="w-5 h-5 text-neutral-400"
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

        {/* Tabs */}
        <div className="flex gap-2 px-6 pt-4">
          <button
            onClick={() => setActiveTab("connections")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeTab === "connections"
                ? "bg-neutral-800/60 backdrop-blur-md border border-amber-300/20 text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "bg-neutral-800/40 backdrop-blur-sm border border-amber-200/[0.08] text-neutral-400 hover:bg-neutral-800/50 hover:border-amber-200/[0.12] hover:text-neutral-300"
            }`}
          >
            Connections
          </button>
          <button
            onClick={() => setActiveTab("maps")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeTab === "maps"
                ? "bg-neutral-800/60 backdrop-blur-md border border-amber-300/20 text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "bg-neutral-800/40 backdrop-blur-sm border border-amber-200/[0.08] text-neutral-400 hover:bg-neutral-800/50 hover:border-amber-200/[0.12] hover:text-neutral-300"
            }`}
          >
            Maps
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <div
                  className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"
                  style={{ animationDelay: "300ms" }}
                />
                <span className="text-sm text-neutral-400 ml-2">
                  Loading library...
                </span>
              </div>
            </div>
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
          ) : emptyState.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              {/* Compact illustration */}
              <div className="relative">
                {activeTab === "connections" ? (
                  <svg
                    viewBox="0 0 120 80"
                    fill="none"
                    className="w-32 h-20"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient
                        id="panel-conn-grad"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor="#D97706"
                          stopOpacity="0.6"
                        />
                        <stop
                          offset="100%"
                          stopColor="#7C3AED"
                          stopOpacity="0.4"
                        />
                      </linearGradient>
                    </defs>
                    <path
                      d="M30 40 Q60 20 90 40"
                      stroke="url(#panel-conn-grad)"
                      strokeWidth="2"
                      strokeDasharray="6 3"
                      fill="none"
                      opacity="0.6"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="18"
                        to="0"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </path>
                    <circle
                      cx="30"
                      cy="40"
                      r="12"
                      fill="#1a1a1a"
                      stroke="#D97706"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx="90"
                      cy="40"
                      r="12"
                      fill="#1a1a1a"
                      stroke="#7C3AED"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M57 25 L60 25 L60 32 L58.5 29 L57 32 Z"
                      fill="#fafafa"
                      opacity="0.5"
                    >
                      <animate
                        attributeName="opacity"
                        values="0.3;0.7;0.3"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </path>
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 120 80"
                    fill="none"
                    className="w-32 h-20"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient
                        id="panel-map-grad"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor="#3B82F6"
                          stopOpacity="0.6"
                        />
                        <stop
                          offset="100%"
                          stopColor="#8B5CF6"
                          stopOpacity="0.4"
                        />
                      </linearGradient>
                    </defs>
                    <g stroke="#3B82F6" strokeWidth="1" opacity="0.4">
                      <line x1="35" y1="25" x2="60" y2="40" />
                      <line x1="60" y1="40" x2="85" y2="25" />
                      <line x1="60" y1="40" x2="70" y2="60" />
                      <line x1="70" y1="60" x2="50" y2="55" />
                    </g>
                    <circle
                      cx="35"
                      cy="25"
                      r="5"
                      fill="#1a1a1a"
                      stroke="#3B82F6"
                      strokeWidth="1"
                    >
                      <animate
                        attributeName="r"
                        values="4;6;4"
                        dur="3s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx="60"
                      cy="40"
                      r="8"
                      fill="#1a1a1a"
                      stroke="#8B5CF6"
                      strokeWidth="1.5"
                    >
                      <animate
                        attributeName="r"
                        values="7;9;7"
                        dur="2.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx="85"
                      cy="25"
                      r="4"
                      fill="#1a1a1a"
                      stroke="#3B82F6"
                      strokeWidth="1"
                    />
                    <circle
                      cx="70"
                      cy="60"
                      r="5"
                      fill="#1a1a1a"
                      stroke="#06B6D4"
                      strokeWidth="1"
                    />
                    <circle
                      cx="50"
                      cy="55"
                      r="6"
                      fill="#1a1a1a"
                      stroke="#10B981"
                      strokeWidth="1"
                    />
                  </svg>
                )}
                <div
                  className="absolute inset-0 -z-10 opacity-20 blur-2xl"
                  style={{
                    background:
                      activeTab === "connections"
                        ? "radial-gradient(circle, #D97706 0%, transparent 70%)"
                        : "radial-gradient(circle, #3B82F6 0%, transparent 70%)",
                  }}
                />
              </div>

              {/* Text */}
              <div className="text-center max-w-xs space-y-2">
                <p className="text-sm font-medium text-neutral-300">
                  {activeTab === "connections"
                    ? "Your saved connections will appear here"
                    : "Your saved maps will appear here"}
                </p>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {activeTab === "connections"
                    ? "Tap any verse connection to save it."
                    : "Save a map snapshot while exploring."}
                </p>
              </div>
            </div>
          ) : activeTab === "connections" ? (
            <div className="space-y-4">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="group relative bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 rounded-lg p-4 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-neutral-500">
                      {formatDate(connection.createdAt)}
                    </span>
                    <button
                      onClick={() => deleteConnection(connection.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all"
                      aria-label="Delete connection"
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
                    {connection.fromVerse.reference} →{" "}
                    {connection.toVerse.reference}
                  </div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {connection.connectionType}
                    {connection.bundleMeta?.anchorRef
                      ? ` • ${connection.bundleMeta.anchorRef}`
                      : ""}
                  </div>
                  <p className="text-sm text-neutral-200 leading-relaxed mt-4">
                    {truncateText(connection.synopsis)}
                  </p>

                  {connection.note && (
                    <div className="mt-2 text-xs text-neutral-400">
                      Note: {truncateText(connection.note, 120)}
                    </div>
                  )}

                  {connection.tags && connection.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {connection.tags.map((tag) => (
                        <span
                          key={`${connection.id}-${tag}`}
                          className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-neutral-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleOpenConnection(connection)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded text-xs font-medium transition-colors flex items-center gap-2"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleGoDeeper(connection)}
                      disabled={!connection.bundle}
                      className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Go Deeper
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {maps.map((entry) => (
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
                      onClick={() => {
                        if (!entry.bundle) return;
                        onOpenMap?.(entry.bundle);
                        onClose();
                      }}
                      disabled={!entry.bundle}
                      className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Open Map
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeConnection && (
        <SemanticConnectionModal
          fromVerse={activeConnection.fromVerse}
          toVerse={activeConnection.toVerse}
          connectionType={activeConnection.connectionType as any}
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
                  mapSession: activeConnection.mapSession as any,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
