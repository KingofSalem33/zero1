import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useMobileApp } from "../context/MobileAppContext";
import { styles, T } from "../theme/mobileStyles";
import {
  BookmarkCard,
  ConnectionCard,
  HighlightCard,
  formatRelativeDate,
} from "./common/EntityCards";

export function LibraryScreen() {
  const controller = useMobileApp();
  return (
    <View style={styles.tabScreen}>
      <View style={styles.panel}>
        <View style={styles.spaceBetweenRow}>
          <View style={styles.flex1}>
            <Text style={styles.panelTitle}>Library Connections</Text>
            <Text style={styles.panelSubtitle}>
              First production feature route on mobile. Data is pulled from the
              same authenticated backend as desktop/web.
            </Text>
          </View>
          <Pressable
            disabled={controller.libraryLoading || controller.busy}
            onPress={() => void controller.loadLibraryConnections()}
            style={[
              styles.ghostButton,
              (controller.libraryLoading || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.ghostButtonLabel}>
              {controller.libraryLoading ? "Loading..." : "Refresh"}
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
        refreshing={controller.libraryLoading}
        onRefresh={() => void controller.loadLibraryConnections()}
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
