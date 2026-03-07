import { Alert, FlatList, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { ActionButton } from "../components/native/ActionButton";
import { EmptyState } from "../components/native/EmptyState";
import {
  BookmarkCardSkeleton,
  ConnectionCardSkeleton,
  HighlightCardSkeleton,
  LibraryMapSkeleton,
} from "../components/native/loading/LibrarySkeletons";
import { PressableScale } from "../components/native/PressableScale";
import { SearchInput } from "../components/native/SearchInput";
import { StatCard } from "../components/native/StatCard";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { useMobileApp } from "../context/MobileAppContext";
import { styles } from "../theme/mobileStyles";
import {
  BookmarkCard,
  ConnectionCard,
  HighlightCard,
  LibraryMapCard,
  formatRelativeDate,
} from "./common/EntityCards";
import type { MobileGoDeeperPayload } from "../types/chat";

function includesQuery(
  fields: Array<string | null | undefined>,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  const haystack = fields
    .map((value) => value ?? "")
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

type LibraryMode =
  | "connections"
  | "maps"
  | "bookmarks"
  | "highlights"
  | "notes";

export function LibraryScreen({
  nav,
}: {
  nav: {
    openMapCreate: () => void;
    openBookmarkCreate: () => void;
    openBookmarkDetail: (bookmarkId: string) => void;
    openHighlightCreate: () => void;
    openHighlightDetail: (highlightId: string) => void;
    openMapViewer: (title?: string, bundle?: unknown) => void;
    openChat: (prompt: MobileGoDeeperPayload, autoSend?: boolean) => void;
  };
}) {
  const controller = useMobileApp();
  const [mode, setMode] = useState<LibraryMode>("connections");
  const refreshing = controller.libraryLoading || controller.libraryMapsLoading;
  const [connectionQuery, setConnectionQuery] = useState("");
  const [mapQuery, setMapQuery] = useState("");
  const normalizedConnectionQuery = connectionQuery.trim().toLowerCase();
  const normalizedMapQuery = mapQuery.trim().toLowerCase();
  const filteredConnections = useMemo(
    () =>
      controller.libraryConnections.filter((item) =>
        includesQuery(
          [
            item.fromVerse.reference,
            item.toVerse.reference,
            item.synopsis,
            item.connectionType,
            item.note,
            item.tags.join(" "),
            item.bundleMeta?.anchorRef,
          ],
          normalizedConnectionQuery,
        ),
      ),
    [controller.libraryConnections, normalizedConnectionQuery],
  );
  const filteredMaps = useMemo(
    () =>
      controller.libraryMaps.filter((item) =>
        includesQuery(
          [
            item.title,
            item.bundleId,
            item.note,
            item.tags.join(" "),
            item.bundleMeta?.anchorRef,
          ],
          normalizedMapQuery,
        ),
      ),
    [controller.libraryMaps, normalizedMapQuery],
  );
  const connectionsCount = controller.libraryConnections.length;
  const mapsCount = controller.libraryMaps.length;
  const bookmarksCount = controller.bookmarks.length;
  const highlightsCount = controller.highlights.length;

  async function handleRefreshLibrary() {
    await Promise.all([
      controller.loadLibraryConnections(),
      controller.loadLibraryMaps(),
      controller.loadBookmarks(),
      controller.loadHighlights(),
    ]);
  }

  return (
    <View style={styles.tabScreen}>
      <SurfaceCard>
        <Text style={styles.panelTitle}>Library</Text>
        <Text style={styles.panelSubtitle}>
          Review connections, maps, bookmarks, highlights, and notes in one
          native workspace.
        </Text>
        <View style={styles.suggestionRow}>
          <PressableScale
            onPress={() => setMode("connections")}
            style={[
              styles.outlineChip,
              mode === "connections" ? styles.outlineChipActive : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show connections"
          >
            <Text style={styles.outlineChipLabel}>
              Connections ({connectionsCount})
            </Text>
          </PressableScale>
          <PressableScale
            onPress={() => setMode("maps")}
            style={[
              styles.outlineChip,
              mode === "maps" ? styles.outlineChipActive : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show maps"
          >
            <Text style={styles.outlineChipLabel}>Maps ({mapsCount})</Text>
          </PressableScale>
          <PressableScale
            onPress={() => setMode("bookmarks")}
            style={[
              styles.outlineChip,
              mode === "bookmarks" ? styles.outlineChipActive : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show bookmarks"
          >
            <Text style={styles.outlineChipLabel}>
              Bookmarks ({bookmarksCount})
            </Text>
          </PressableScale>
          <PressableScale
            onPress={() => setMode("highlights")}
            style={[
              styles.outlineChip,
              mode === "highlights" ? styles.outlineChipActive : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show highlights"
          >
            <Text style={styles.outlineChipLabel}>
              Highlights ({highlightsCount})
            </Text>
          </PressableScale>
          <PressableScale
            onPress={() => setMode("notes")}
            style={[
              styles.outlineChip,
              mode === "notes" ? styles.outlineChipActive : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show notes"
          >
            <Text style={styles.outlineChipLabel}>Notes</Text>
          </PressableScale>
        </View>
        <View style={styles.row}>
          <ActionButton
            disabled={refreshing || controller.busy}
            label={refreshing ? "Refreshing..." : "Refresh all"}
            onPress={() => void handleRefreshLibrary()}
            variant="ghost"
          />
        </View>
      </SurfaceCard>

      {mode === "connections" ? (
        <>
          <SurfaceCard>
            <View style={styles.statGrid}>
              <StatCard
                label="Connections"
                value={filteredConnections.length}
              />
            </View>
            <SearchInput
              placeholder="Search connections (verse, type, tag, note)"
              value={connectionQuery}
              onChangeText={setConnectionQuery}
            />
            {normalizedConnectionQuery ? (
              <Text style={styles.caption}>
                Showing {filteredConnections.length} of {connectionsCount}{" "}
                connections
              </Text>
            ) : null}
            {controller.libraryError ? (
              <Text style={styles.error}>{controller.libraryError}</Text>
            ) : null}
            {controller.libraryLoadedAt ? (
              <Text style={styles.caption}>
                Last sync {formatRelativeDate(controller.libraryLoadedAt)}
              </Text>
            ) : null}
          </SurfaceCard>
          <FlatList
            data={filteredConnections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={controller.libraryLoading}
            onRefresh={() => void controller.loadLibraryConnections()}
            renderItem={({ item }) => (
              <ConnectionCard
                item={item}
                onGoDeeper={() =>
                  nav.openChat(
                    item.goDeeperPrompt ||
                      `Explain the connection between ${item.fromVerse.reference} and ${item.toVerse.reference}.`,
                    true,
                  )
                }
                onOpenMap={
                  item.bundle
                    ? () =>
                        nav.openMapViewer(
                          item.bundleMeta?.anchorRef || "Connection map",
                          item.bundle,
                        )
                    : undefined
                }
              />
            )}
            ListEmptyComponent={
              controller.libraryLoading ? (
                <View style={styles.listContent}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <ConnectionCardSkeleton
                      key={`connection-skeleton-${index}`}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  title={
                    normalizedConnectionQuery
                      ? "No matching connections"
                      : "No saved connections yet"
                  }
                  subtitle={
                    normalizedConnectionQuery
                      ? "Try a broader search query."
                      : "Save a connection from discovery or chat to build your library."
                  }
                />
              )
            }
          />
        </>
      ) : null}

      {mode === "maps" ? (
        <FlatList
          data={filteredMaps}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={controller.libraryMapsLoading}
          onRefresh={() => void controller.loadLibraryMaps()}
          ListHeaderComponent={
            <SurfaceCard>
              <View style={styles.statGrid}>
                <StatCard label="Saved maps" value={filteredMaps.length} />
              </View>
              <SearchInput
                placeholder="Search maps (title, bundle, note)"
                value={mapQuery}
                onChangeText={setMapQuery}
              />
              {normalizedMapQuery ? (
                <Text style={styles.caption}>
                  Showing {filteredMaps.length} of {mapsCount} maps
                </Text>
              ) : null}
              <View style={styles.row}>
                <ActionButton
                  disabled={controller.busy}
                  label="Create map"
                  onPress={nav.openMapCreate}
                  variant="primary"
                />
              </View>
              {controller.libraryMapsError ? (
                <Text style={styles.error}>{controller.libraryMapsError}</Text>
              ) : null}
              {controller.libraryMapMutationError ? (
                <Text style={styles.error}>
                  {controller.libraryMapMutationError}
                </Text>
              ) : null}
              {controller.libraryMapsLoadedAt ? (
                <Text style={styles.caption}>
                  Last sync {formatRelativeDate(controller.libraryMapsLoadedAt)}
                </Text>
              ) : null}
            </SurfaceCard>
          }
          renderItem={({ item }) => (
            <LibraryMapCard
              item={item}
              mutationBusy={controller.libraryMapMutationBusy}
              onOpen={
                item.bundle
                  ? () =>
                      nav.openMapViewer(
                        item.title || item.bundleId || "Map",
                        item.bundle,
                      )
                  : undefined
              }
              onDelete={() => void controller.handleDeleteLibraryMap(item.id)}
            />
          )}
          ListEmptyComponent={
            controller.libraryMapsLoading ? (
              <View style={styles.listContent}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <LibraryMapSkeleton key={`map-skeleton-${index}`} />
                ))}
              </View>
            ) : (
              <EmptyState
                title={normalizedMapQuery ? "No matching maps" : "No maps yet"}
                subtitle={
                  normalizedMapQuery
                    ? "Try a broader search query."
                    : "Create a map from your saved bundles."
                }
              />
            )
          }
        />
      ) : null}

      {mode === "bookmarks" ? (
        <BookmarksScreen
          nav={{
            openCreate: nav.openBookmarkCreate,
            openDetail: nav.openBookmarkDetail,
          }}
          embedded
        />
      ) : null}

      {mode === "highlights" ? (
        <HighlightsScreen
          nav={{
            openCreate: nav.openHighlightCreate,
            openDetail: nav.openHighlightDetail,
          }}
          embedded
        />
      ) : null}

      {mode === "notes" ? (
        <SurfaceCard>
          <Text style={styles.panelTitle}>Notes</Text>
          <Text style={styles.panelSubtitle}>
            Notes parity is queued next. This section will consolidate verse
            notes into the same library model.
          </Text>
          <EmptyState
            title="Notes coming next"
            subtitle="Core native parity is live for reader, chat, maps, bookmarks, and highlights."
          />
        </SurfaceCard>
      ) : null}
    </View>
  );
}

export function BookmarksScreen({
  nav,
  embedded = false,
}: {
  nav: {
    openCreate: () => void;
    openDetail: (bookmarkId: string) => void;
  };
  embedded?: boolean;
}) {
  const controller = useMobileApp();
  const [query, setQuery] = useState("");
  const [actionBookmarkId, setActionBookmarkId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredBookmarks = useMemo(
    () =>
      controller.bookmarks.filter((item) =>
        includesQuery([item.text], normalizedQuery),
      ),
    [controller.bookmarks, normalizedQuery],
  );
  const bookmarksCount = controller.bookmarks.length;

  function confirmDeleteBookmark(bookmarkId: string) {
    Alert.alert(
      "Delete bookmark?",
      "This will remove the bookmark from your library.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void controller.handleDeleteBookmark(bookmarkId);
            setActionBookmarkId((current) =>
              current === bookmarkId ? null : current,
            );
          },
        },
      ],
    );
  }

  return (
    <View style={embedded ? styles.savedListContainer : styles.tabScreen}>
      <SurfaceCard>
        <View style={styles.spaceBetweenRow}>
          <View style={styles.flex1}>
            <Text style={styles.panelTitle}>Bookmarks</Text>
            <Text style={styles.panelSubtitle}>
              Save and revisit scripture references quickly.
            </Text>
          </View>
          <ActionButton
            disabled={controller.bookmarksLoading || controller.busy}
            label={controller.bookmarksLoading ? "Loading..." : "Refresh"}
            onPress={() => void controller.loadBookmarks()}
            variant="ghost"
          />
        </View>
        <View style={styles.statGrid}>
          <StatCard label="Saved" value={filteredBookmarks.length} />
        </View>
        <SearchInput
          placeholder="Search bookmarks"
          value={query}
          onChangeText={setQuery}
        />
        {normalizedQuery ? (
          <Text style={styles.caption}>
            Showing {filteredBookmarks.length} of {bookmarksCount} bookmarks
          </Text>
        ) : null}
        <View style={styles.row}>
          <ActionButton
            disabled={controller.bookmarkMutationBusy || controller.busy}
            label="New bookmark"
            onPress={nav.openCreate}
            variant="primary"
          />
        </View>
        {controller.bookmarksError ? (
          <Text style={styles.error}>{controller.bookmarksError}</Text>
        ) : null}
        {controller.bookmarksLoadedAt ? (
          <Text style={styles.caption}>
            Last sync {formatRelativeDate(controller.bookmarksLoadedAt)}
          </Text>
        ) : null}
        {controller.bookmarkMutationError ? (
          <Text style={styles.error}>{controller.bookmarkMutationError}</Text>
        ) : null}
      </SurfaceCard>
      <FlatList
        data={filteredBookmarks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={controller.bookmarksLoading}
        onRefresh={() => void controller.loadBookmarks()}
        ListHeaderComponent={
          filteredBookmarks.length > 0 ? (
            <Text style={styles.panelSubtitle}>
              Tap to open. Long press for quick actions.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <BookmarkCard
            item={item}
            selected={item.id === controller.selectedBookmarkId}
            showQuickActions={
              item.id === controller.selectedBookmarkId ||
              item.id === actionBookmarkId
            }
            onPress={() => {
              controller.setSelectedBookmarkId(item.id);
              nav.openDetail(item.id);
            }}
            onLongPress={() =>
              setActionBookmarkId((current) =>
                current === item.id ? null : item.id,
              )
            }
            onEdit={() => {
              controller.setSelectedBookmarkId(item.id);
              nav.openDetail(item.id);
            }}
            onDelete={() => confirmDeleteBookmark(item.id)}
          />
        )}
        ListEmptyComponent={
          controller.bookmarksLoading ? (
            <View style={styles.listContent}>
              {Array.from({ length: 4 }).map((_, index) => (
                <BookmarkCardSkeleton key={`bookmark-skeleton-${index}`} />
              ))}
            </View>
          ) : (
            <EmptyState
              title={
                normalizedQuery ? "No matching bookmarks" : "No bookmarks yet"
              }
              subtitle={
                normalizedQuery
                  ? "Try a broader search query."
                  : "Use New bookmark to create one, then pull down to sync."
              }
            />
          )
        }
      />
    </View>
  );
}

export function HighlightsScreen({
  nav,
  embedded = false,
}: {
  nav: {
    openCreate: () => void;
    openDetail: (highlightId: string) => void;
  };
  embedded?: boolean;
}) {
  const controller = useMobileApp();
  const [query, setQuery] = useState("");
  const [actionHighlightId, setActionHighlightId] = useState<string | null>(
    null,
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredHighlights = useMemo(
    () =>
      controller.highlights.filter((item) =>
        includesQuery(
          [item.referenceLabel, item.text, item.note, item.color],
          normalizedQuery,
        ),
      ),
    [controller.highlights, normalizedQuery],
  );
  const highlightsCount = controller.highlights.length;

  function confirmDeleteHighlight(highlightId: string) {
    Alert.alert(
      "Delete highlight?",
      "This will permanently remove the highlight.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void controller.handleDeleteHighlight(highlightId);
            setActionHighlightId((current) =>
              current === highlightId ? null : current,
            );
          },
        },
      ],
    );
  }

  return (
    <View style={embedded ? styles.savedListContainer : styles.tabScreen}>
      <SurfaceCard>
        <View style={styles.spaceBetweenRow}>
          <View style={styles.flex1}>
            <Text style={styles.panelTitle}>Highlights</Text>
            <Text style={styles.panelSubtitle}>
              Organize highlighted verses and notes across your reading flow.
            </Text>
          </View>
          <ActionButton
            disabled={controller.highlightsLoading || controller.busy}
            label={controller.highlightsLoading ? "Loading..." : "Refresh"}
            onPress={() => void controller.loadHighlights()}
            variant="ghost"
          />
        </View>
        <View style={styles.statGrid}>
          <StatCard label="Saved" value={filteredHighlights.length} />
        </View>
        <SearchInput
          placeholder="Search highlights"
          value={query}
          onChangeText={setQuery}
        />
        {normalizedQuery ? (
          <Text style={styles.caption}>
            Showing {filteredHighlights.length} of {highlightsCount} highlights
          </Text>
        ) : null}
        <View style={styles.row}>
          <ActionButton
            disabled={controller.highlightMutationBusy || controller.busy}
            label="New highlight"
            onPress={nav.openCreate}
            variant="primary"
          />
        </View>
        {controller.highlightsError ? (
          <Text style={styles.error}>{controller.highlightsError}</Text>
        ) : null}
        {controller.highlightsLoadedAt ? (
          <Text style={styles.caption}>
            Last sync {formatRelativeDate(controller.highlightsLoadedAt)}
          </Text>
        ) : null}
        {controller.highlightMutationError ? (
          <Text style={styles.error}>{controller.highlightMutationError}</Text>
        ) : null}
      </SurfaceCard>
      <FlatList
        data={filteredHighlights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={controller.highlightsLoading}
        onRefresh={() => void controller.loadHighlights()}
        ListHeaderComponent={
          filteredHighlights.length > 0 ? (
            <Text style={styles.panelSubtitle}>
              Tap to open. Long press for quick actions.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <HighlightCard
            item={item}
            selected={item.id === controller.selectedHighlightId}
            showQuickActions={
              item.id === controller.selectedHighlightId ||
              item.id === actionHighlightId
            }
            onPress={() => {
              controller.setSelectedHighlightId(item.id);
              nav.openDetail(item.id);
            }}
            onLongPress={() =>
              setActionHighlightId((current) =>
                current === item.id ? null : item.id,
              )
            }
            onEdit={() => {
              controller.setSelectedHighlightId(item.id);
              nav.openDetail(item.id);
            }}
            onDelete={() => confirmDeleteHighlight(item.id)}
          />
        )}
        ListEmptyComponent={
          controller.highlightsLoading ? (
            <View style={styles.listContent}>
              {Array.from({ length: 4 }).map((_, index) => (
                <HighlightCardSkeleton key={`highlight-skeleton-${index}`} />
              ))}
            </View>
          ) : (
            <EmptyState
              title={
                normalizedQuery ? "No matching highlights" : "No highlights yet"
              }
              subtitle={
                normalizedQuery
                  ? "Try a broader search query."
                  : "Use New highlight to create one, then pull down to sync."
              }
            />
          )
        }
      />
    </View>
  );
}

export function SavedScreen({
  nav,
}: {
  nav: {
    openBookmarkCreate: () => void;
    openBookmarkDetail: (bookmarkId: string) => void;
    openHighlightCreate: () => void;
    openHighlightDetail: (highlightId: string) => void;
  };
}) {
  const [mode, setMode] = useState<"bookmarks" | "highlights">("bookmarks");

  return (
    <View style={styles.tabScreen}>
      <SurfaceCard>
        <Text style={styles.panelTitle}>Saved</Text>
        <Text style={styles.panelSubtitle}>
          Switch between bookmarks and highlights.
        </Text>
        <View style={styles.row}>
          <PressableScale
            onPress={() => setMode("bookmarks")}
            style={[
              styles.outlineChip,
              mode === "bookmarks" ? styles.outlineChipActive : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show bookmarks"
            accessibilityState={{ selected: mode === "bookmarks" }}
          >
            <Text style={styles.outlineChipLabel}>Bookmarks</Text>
          </PressableScale>
          <PressableScale
            onPress={() => setMode("highlights")}
            style={[
              styles.outlineChip,
              mode === "highlights" ? styles.outlineChipActive : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show highlights"
            accessibilityState={{ selected: mode === "highlights" }}
          >
            <Text style={styles.outlineChipLabel}>Highlights</Text>
          </PressableScale>
        </View>
      </SurfaceCard>
      {mode === "bookmarks" ? (
        <BookmarksScreen
          nav={{
            openCreate: nav.openBookmarkCreate,
            openDetail: nav.openBookmarkDetail,
          }}
          embedded
        />
      ) : (
        <HighlightsScreen
          nav={{
            openCreate: nav.openHighlightCreate,
            openDetail: nav.openHighlightDetail,
          }}
          embedded
        />
      )}
    </View>
  );
}
