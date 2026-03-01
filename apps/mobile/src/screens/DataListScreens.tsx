import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMobileApp } from "../context/MobileAppContext";
import { styles, T } from "../theme/mobileStyles";
import {
  BookmarkCard,
  ConnectionCard,
  HighlightCard,
  LibraryMapCard,
  formatRelativeDate,
} from "./common/EntityCards";

export function LibraryScreen() {
  const controller = useMobileApp();
  const refreshing = controller.libraryLoading || controller.libraryMapsLoading;

  async function handleRefreshLibrary() {
    await Promise.all([
      controller.loadLibraryConnections(),
      controller.loadLibraryMaps(),
    ]);
  }

  return (
    <View style={styles.tabScreen}>
      <View style={styles.panel}>
        <View style={styles.spaceBetweenRow}>
          <View style={styles.flex1}>
            <Text style={styles.panelTitle}>Library Connections</Text>
            <Text style={styles.panelSubtitle}>
              Authenticated connection and map workflows powered by the same
              backend as desktop/web.
            </Text>
          </View>
          <Pressable
            disabled={refreshing || controller.busy}
            onPress={() => void handleRefreshLibrary()}
            style={[
              styles.ghostButton,
              (refreshing || controller.busy) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.ghostButtonLabel}>
              {refreshing ? "Loading..." : "Refresh"}
            </Text>
          </Pressable>
        </View>
        {controller.libraryError ? (
          <Text style={styles.error}>{controller.libraryError}</Text>
        ) : null}
        {controller.libraryLoadedAt ? (
          <Text style={styles.caption}>
            Last sync {formatRelativeDate(controller.libraryLoadedAt)}
          </Text>
        ) : null}
      </View>
      <FlatList
        data={controller.libraryConnections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={() => void handleRefreshLibrary()}
        renderItem={({ item }) => <ConnectionCard item={item} />}
        ListEmptyComponent={
          controller.libraryLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={T.colors.accent} />
              <Text style={styles.emptyTitle}>Loading connections...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No saved connections yet</Text>
              <Text style={styles.emptySubtitle}>
                Create or save connections in your existing app flows, then
                return here and refresh.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={styles.panel}>
            <View style={styles.spaceBetweenRow}>
              <View style={styles.flex1}>
                <Text style={styles.panelTitle}>Library Maps</Text>
                <Text style={styles.panelSubtitle}>
                  Create and manage map entries for your existing bundle IDs.
                </Text>
              </View>
              <Pressable
                disabled={controller.libraryMapsLoading || controller.busy}
                onPress={() => void controller.loadLibraryMaps()}
                style={[
                  styles.ghostButton,
                  (controller.libraryMapsLoading || controller.busy) &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.ghostButtonLabel}>
                  {controller.libraryMapsLoading ? "Loading..." : "Refresh"}
                </Text>
              </Pressable>
            </View>
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
              <Pressable
                disabled={controller.libraryMapMutationBusy || controller.busy}
                onPress={() => void controller.handleCreateLibraryMap()}
                style={[
                  styles.primaryButton,
                  (controller.libraryMapMutationBusy || controller.busy) &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.primaryButtonLabel}>
                  {controller.libraryMapMutationBusy ? "Saving..." : "Save map"}
                </Text>
              </Pressable>
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
            {controller.libraryMaps.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No maps yet</Text>
                <Text style={styles.emptySubtitle}>
                  Enter a bundle ID and save your first map.
                </Text>
              </View>
            ) : (
              <View style={styles.listContent}>
                {controller.libraryMaps.map((map) => (
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
          </View>
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
  return (
    <View style={styles.tabScreen}>
      <View style={styles.panel}>
        <View style={styles.spaceBetweenRow}>
          <View style={styles.flex1}>
            <Text style={styles.panelTitle}>Bookmarks</Text>
            <Text style={styles.panelSubtitle}>
              Authenticated mobile list backed by `/api/bookmarks`.
            </Text>
          </View>
          <Pressable
            disabled={controller.bookmarksLoading || controller.busy}
            onPress={() => void controller.loadBookmarks()}
            style={[
              styles.ghostButton,
              (controller.bookmarksLoading || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.ghostButtonLabel}>
              {controller.bookmarksLoading ? "Loading..." : "Refresh"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            disabled={controller.bookmarkMutationBusy || controller.busy}
            onPress={nav.openCreate}
            style={[
              styles.primaryButton,
              (controller.bookmarkMutationBusy || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>New bookmark</Text>
          </Pressable>
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
      </View>

      <View style={styles.listHintRow}>
        <Text style={styles.caption}>
          Tap a bookmark to open its route screen.
        </Text>
      </View>
      <FlatList
        data={controller.bookmarks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={controller.bookmarksLoading}
        onRefresh={() => void controller.loadBookmarks()}
        renderItem={({ item }) => (
          <BookmarkCard
            item={item}
            selected={item.id === controller.selectedBookmarkId}
            onPress={() => {
              controller.setSelectedBookmarkId(item.id);
              nav.openDetail(item.id);
            }}
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
              <Text style={styles.emptyTitle}>No bookmarks yet</Text>
              <Text style={styles.emptySubtitle}>
                Use New bookmark to create one, then pull down to sync.
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
  return (
    <View style={styles.tabScreen}>
      <View style={styles.panel}>
        <View style={styles.spaceBetweenRow}>
          <View style={styles.flex1}>
            <Text style={styles.panelTitle}>Highlights</Text>
            <Text style={styles.panelSubtitle}>
              Authenticated mobile list backed by `/api/highlights`.
            </Text>
          </View>
          <Pressable
            disabled={controller.highlightsLoading || controller.busy}
            onPress={() => void controller.loadHighlights()}
            style={[
              styles.ghostButton,
              (controller.highlightsLoading || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.ghostButtonLabel}>
              {controller.highlightsLoading ? "Loading..." : "Refresh"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            disabled={controller.highlightMutationBusy || controller.busy}
            onPress={nav.openCreate}
            style={[
              styles.primaryButton,
              (controller.highlightMutationBusy || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>New highlight</Text>
          </Pressable>
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
      </View>

      <View style={styles.listHintRow}>
        <Text style={styles.caption}>
          Tap a highlight to open its route screen.
        </Text>
      </View>
      <FlatList
        data={controller.highlights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={controller.highlightsLoading}
        onRefresh={() => void controller.loadHighlights()}
        renderItem={({ item }) => (
          <HighlightCard
            item={item}
            selected={item.id === controller.selectedHighlightId}
            onPress={() => {
              controller.setSelectedHighlightId(item.id);
              nav.openDetail(item.id);
            }}
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
              <Text style={styles.emptyTitle}>No highlights yet</Text>
              <Text style={styles.emptySubtitle}>
                Use New highlight to create one, then pull down to sync.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
