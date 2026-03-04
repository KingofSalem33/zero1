import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMemo, useState } from "react";
import { ActionButton } from "../components/native/ActionButton";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { useMobileApp } from "../context/MobileAppContext";
import { styles, T } from "../theme/mobileStyles";
import {
  BookmarkCard,
  ConnectionCard,
  HighlightCard,
  LibraryMapCard,
  formatRelativeDate,
} from "./common/EntityCards";

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

export function LibraryScreen() {
  const controller = useMobileApp();
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

  async function handleRefreshLibrary() {
    await Promise.all([
      controller.loadLibraryConnections(),
      controller.loadLibraryMaps(),
    ]);
  }

  return (
    <View style={styles.tabScreen}>
      <SurfaceCard>
        <View style={styles.spaceBetweenRow}>
          <View style={styles.flex1}>
            <Text style={styles.panelTitle}>Library</Text>
            <Text style={styles.panelSubtitle}>
              Explore your saved scripture connections and related map bundles.
            </Text>
          </View>
          <ActionButton
            disabled={refreshing || controller.busy}
            label={refreshing ? "Loading..." : "Refresh"}
            onPress={() => void handleRefreshLibrary()}
            variant="ghost"
          />
        </View>
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Connections</Text>
            <Text style={styles.statValue}>{filteredConnections.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Maps</Text>
            <Text style={styles.statValue}>{filteredMaps.length}</Text>
          </View>
        </View>
        <TextInput
          placeholder="Search connections (verse, type, tag, note)"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
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
        refreshing={refreshing}
        onRefresh={() => void handleRefreshLibrary()}
        ListHeaderComponent={
          filteredConnections.length > 0 ? (
            <Text style={styles.panelSubtitle}>Recent connections</Text>
          ) : null
        }
        renderItem={({ item }) => <ConnectionCard item={item} />}
        ListEmptyComponent={
          controller.libraryLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={T.colors.accent} />
              <Text style={styles.emptyTitle}>Loading connections...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {normalizedConnectionQuery
                  ? "No matching connections"
                  : "No saved connections yet"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {normalizedConnectionQuery
                  ? "Try a broader search query."
                  : "Save your first connection from discovery, then pull to refresh this view."}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <SurfaceCard>
            <View style={styles.spaceBetweenRow}>
              <View style={styles.flex1}>
                <Text style={styles.panelTitle}>Maps</Text>
                <Text style={styles.panelSubtitle}>
                  Create and manage map entries for your existing bundle IDs.
                </Text>
              </View>
              <ActionButton
                disabled={controller.libraryMapsLoading || controller.busy}
                label={controller.libraryMapsLoading ? "Loading..." : "Refresh"}
                onPress={() => void controller.loadLibraryMaps()}
                variant="ghost"
              />
            </View>
            <View style={styles.statGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Saved maps</Text>
                <Text style={styles.statValue}>{filteredMaps.length}</Text>
              </View>
            </View>
            <TextInput
              placeholder="Search maps (title, bundle, note)"
              placeholderTextColor={T.colors.textMuted}
              style={styles.input}
              value={mapQuery}
              onChangeText={setMapQuery}
            />
            {normalizedMapQuery ? (
              <Text style={styles.caption}>
                Showing {filteredMaps.length} of {mapsCount} maps
              </Text>
            ) : null}
            <Text style={styles.caption}>Create map</Text>
            <TextInput
              autoCapitalize="none"
              placeholder="Bundle ID"
              placeholderTextColor={T.colors.textMuted}
              style={styles.input}
              value={controller.libraryMapDraft.bundleId}
              onChangeText={(value) =>
                controller.setLibraryMapDraft((current) => ({
                  ...current,
                  bundleId: value,
                }))
              }
            />
            {controller.libraryMapBundleSuggestions.length > 0 ? (
              <View style={styles.suggestionRow}>
                {controller.libraryMapBundleSuggestions.map((bundleId) => (
                  <Pressable
                    key={bundleId}
                    onPress={() =>
                      controller.selectLibraryMapBundleSuggestion(bundleId)
                    }
                    style={styles.suggestionChip}
                  >
                    <Text style={styles.suggestionChipLabel}>{bundleId}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <TextInput
              placeholder="Map title (optional)"
              placeholderTextColor={T.colors.textMuted}
              style={styles.input}
              value={controller.libraryMapDraft.title}
              onChangeText={(value) =>
                controller.setLibraryMapDraft((current) => ({
                  ...current,
                  title: value,
                }))
              }
            />
            <View style={styles.row}>
              <ActionButton
                disabled={controller.libraryMapMutationBusy || controller.busy}
                label={
                  controller.libraryMapMutationBusy ? "Saving..." : "Save map"
                }
                onPress={() => void controller.handleCreateLibraryMap()}
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
            {filteredMaps.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {normalizedMapQuery ? "No matching maps" : "No maps yet"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {normalizedMapQuery
                    ? "Try a broader search query."
                    : "Enter a bundle ID and save your first map."}
                </Text>
              </View>
            ) : (
              <View style={styles.listContent}>
                <Text style={styles.panelSubtitle}>Saved maps</Text>
                {filteredMaps.map((map) => (
                  <LibraryMapCard
                    key={map.id}
                    item={map}
                    mutationBusy={controller.libraryMapMutationBusy}
                    onDelete={() =>
                      void controller.handleDeleteLibraryMap(map.id)
                    }
                  />
                ))}
              </View>
            )}
          </SurfaceCard>
        }
      />
    </View>
  );
}

export function BookmarksScreen({
  nav,
}: {
  nav: {
    openCreate: () => void;
    openDetail: (bookmarkId: string) => void;
  };
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
    <View style={styles.tabScreen}>
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
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Saved</Text>
            <Text style={styles.statValue}>{filteredBookmarks.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Selected</Text>
            <Text style={styles.statValue}>
              {controller.selectedBookmarkId ? 1 : 0}
            </Text>
          </View>
        </View>
        <TextInput
          placeholder="Search bookmarks"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
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
            <View style={styles.emptyState}>
              <ActivityIndicator color={T.colors.accent} />
              <Text style={styles.emptyTitle}>Loading bookmarks...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {normalizedQuery ? "No matching bookmarks" : "No bookmarks yet"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {normalizedQuery
                  ? "Try a broader search query."
                  : "Use New bookmark to create one, then pull down to sync."}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

export function HighlightsScreen({
  nav,
}: {
  nav: {
    openCreate: () => void;
    openDetail: (highlightId: string) => void;
  };
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
    <View style={styles.tabScreen}>
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
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Saved</Text>
            <Text style={styles.statValue}>{filteredHighlights.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Selected</Text>
            <Text style={styles.statValue}>
              {controller.selectedHighlightId ? 1 : 0}
            </Text>
          </View>
        </View>
        <TextInput
          placeholder="Search highlights"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
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
            <View style={styles.emptyState}>
              <ActivityIndicator color={T.colors.accent} />
              <Text style={styles.emptyTitle}>Loading highlights...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {normalizedQuery
                  ? "No matching highlights"
                  : "No highlights yet"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {normalizedQuery
                  ? "Try a broader search query."
                  : "Use New highlight to create one, then pull down to sync."}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
