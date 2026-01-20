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
      <div className="relative w-full max-w-3xl max-h-[80vh] bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
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
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === "connections"
                ? "bg-blue-500/20 text-blue-200"
                : "bg-white/5 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Connections
          </button>
          <button
            onClick={() => setActiveTab("maps")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === "maps"
                ? "bg-blue-500/20 text-blue-200"
                : "bg-white/5 text-neutral-400 hover:text-neutral-200"
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
            <div className="flex flex-col items-center justify-center py-12 gap-3">
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
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <svg
                className="w-16 h-16 text-neutral-600"
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
              <p className="text-sm text-neutral-400">
                {activeTab === "connections"
                  ? "No saved connections yet"
                  : "No saved maps yet"}
              </p>
              <p className="text-xs text-neutral-500 text-center max-w-xs">
                {activeTab === "connections"
                  ? "Save a connection from the map to collect it here."
                  : "Save a map snapshot to return here later."}
              </p>
            </div>
          ) : activeTab === "connections" ? (
            <div className="space-y-3">
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
                  <p className="text-sm text-neutral-200 leading-relaxed mt-3">
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

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleOpenConnection(connection)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-300 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleGoDeeper(connection)}
                      disabled={!connection.bundle}
                      className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Go Deeper
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
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
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        if (!entry.bundle) return;
                        onOpenMap?.(entry.bundle);
                        onClose();
                      }}
                      disabled={!entry.bundle}
                      className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
