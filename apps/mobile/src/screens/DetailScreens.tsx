import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMobileApp } from "../context/MobileAppContext";
import { styles, T } from "../theme/mobileStyles";
import { formatRelativeDate } from "./common/EntityCards";

export function BookmarkCreateScreen() {
  const controller = useMobileApp();
  return (
    <ScrollView contentContainerStyle={styles.routeScrollContent}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>New Bookmark</Text>
        <Text style={styles.panelSubtitle}>
          Save a verse reference with structured fields.
        </Text>
        <View style={styles.row}>
          <TextInput
            autoCapitalize="words"
            placeholder="Book"
            placeholderTextColor={T.colors.textMuted}
            style={[styles.input, styles.flex1]}
            value={controller.bookmarkDraft.book}
            onChangeText={(value) =>
              controller.setBookmarkDraft((current) => ({
                ...current,
                book: value,
              }))
            }
          />
          <TextInput
            keyboardType="number-pad"
            placeholder="Chapter"
            placeholderTextColor={T.colors.textMuted}
            style={[styles.input, styles.inputCompact]}
            value={controller.bookmarkDraft.chapter}
            onChangeText={(value) =>
              controller.setBookmarkDraft((current) => ({
                ...current,
                chapter: value,
              }))
            }
          />
        </View>
        {controller.bookmarkChapterHint ? (
          <Text style={styles.caption}>{controller.bookmarkChapterHint}</Text>
        ) : null}
        {controller.bookmarkBookGuidance ? (
          <View style={styles.calloutMuted}>
            <Text style={styles.calloutMutedText}>
              {controller.bookmarkBookGuidance}
            </Text>
          </View>
        ) : null}
        {controller.bookmarkBookSuggestions.length > 0 ? (
          <View style={styles.suggestionRow}>
            {controller.bookmarkBookSuggestions.map((book) => (
              <Pressable
                key={book}
                onPress={() => controller.selectBookmarkBookSuggestion(book)}
                style={styles.suggestionChip}
              >
                <Text style={styles.suggestionChipLabel}>{book}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <TextInput
          keyboardType="number-pad"
          placeholder="Verse (optional)"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
          value={controller.bookmarkDraft.verse}
          onChangeText={(value) =>
            controller.setBookmarkDraft((current) => ({
              ...current,
              verse: value,
            }))
          }
        />
        {controller.bookmarkMutationError ? (
          <Text style={styles.error}>{controller.bookmarkMutationError}</Text>
        ) : null}
        <View style={styles.row}>
          <Pressable
            disabled={controller.bookmarkMutationBusy || controller.busy}
            onPress={() => void controller.handleCreateBookmark()}
            style={[
              styles.primaryButton,
              (controller.bookmarkMutationBusy || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>
              {controller.bookmarkMutationBusy ? "Saving..." : "Save bookmark"}
            </Text>
          </Pressable>
          <Pressable
            disabled={
              controller.bookmarkMutationBusy ||
              controller.busy ||
              (!controller.bookmarkDraft.book.trim() &&
                !controller.bookmarkDraft.chapter.trim() &&
                !controller.bookmarkDraft.verse.trim())
            }
            onPress={() =>
              controller.setBookmarkDraft({
                book: "",
                chapter: "",
                verse: "",
              })
            }
            style={[
              styles.secondaryButton,
              (controller.bookmarkMutationBusy ||
                controller.busy ||
                (!controller.bookmarkDraft.book.trim() &&
                  !controller.bookmarkDraft.chapter.trim() &&
                  !controller.bookmarkDraft.verse.trim())) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.secondaryButtonLabel}>Clear</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

export function BookmarkDetailScreen({ bookmarkId }: { bookmarkId: string }) {
  const controller = useMobileApp();
  const bookmark = controller.bookmarks.find((item) => item.id === bookmarkId);
  if (!bookmark) {
    return (
      <View style={styles.tabScreen}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Bookmark not found</Text>
          <Text style={styles.emptySubtitle}>
            It may have been deleted. Return to the list and refresh.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.routeScrollContent}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Bookmark Detail</Text>
        <Text style={styles.bookmarkText}>{bookmark.text}</Text>
        {bookmark.createdAt ? (
          <Text style={styles.caption}>
            Saved {formatRelativeDate(bookmark.createdAt)}
          </Text>
        ) : null}
        {controller.bookmarkMutationError ? (
          <Text style={styles.error}>{controller.bookmarkMutationError}</Text>
        ) : null}
        <View style={styles.row}>
          <Pressable
            disabled={controller.bookmarkMutationBusy || controller.busy}
            onPress={() => void controller.handleDeleteBookmark(bookmark.id)}
            style={[
              styles.dangerButton,
              (controller.bookmarkMutationBusy || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.dangerButtonLabel}>
              {controller.bookmarkMutationBusy ? "Deleting..." : "Delete"}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

export function HighlightCreateScreen() {
  const controller = useMobileApp();
  return (
    <ScrollView contentContainerStyle={styles.routeScrollContent}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>New Highlight</Text>
        <Text style={styles.panelSubtitle}>
          Create a highlight using the existing sync endpoint and shared auth.
        </Text>
        <View style={styles.row}>
          <TextInput
            placeholder="Book"
            placeholderTextColor={T.colors.textMuted}
            style={[styles.input, styles.flex1]}
            value={controller.highlightCreateDraft.book}
            onChangeText={(value) =>
              controller.setHighlightCreateDraft((current) => ({
                ...current,
                book: value,
              }))
            }
          />
          <TextInput
            keyboardType="number-pad"
            placeholder="Chapter"
            placeholderTextColor={T.colors.textMuted}
            style={[styles.input, styles.inputCompact]}
            value={controller.highlightCreateDraft.chapter}
            onChangeText={(value) =>
              controller.setHighlightCreateDraft((current) => ({
                ...current,
                chapter: value,
              }))
            }
          />
        </View>
        <TextInput
          placeholder="Verses (comma-separated, e.g. 1,2,3)"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
          value={controller.highlightCreateDraft.verses}
          onChangeText={(value) =>
            controller.setHighlightCreateDraft((current) => ({
              ...current,
              verses: value,
            }))
          }
        />
        <TextInput
          multiline
          placeholder="Highlight text"
          placeholderTextColor={T.colors.textMuted}
          style={[styles.input, styles.textAreaInput]}
          value={controller.highlightCreateDraft.text}
          onChangeText={(value) =>
            controller.setHighlightCreateDraft((current) => ({
              ...current,
              text: value,
            }))
          }
        />
        <View style={styles.row}>
          <TextInput
            autoCapitalize="none"
            placeholder="#facc15"
            placeholderTextColor={T.colors.textMuted}
            style={[styles.input, styles.flex1]}
            value={controller.highlightCreateDraft.color}
            onChangeText={(value) =>
              controller.setHighlightCreateDraft((current) => ({
                ...current,
                color: value,
              }))
            }
          />
          <View style={styles.colorPreviewWrap}>
            <View
              style={[
                styles.colorPreviewDot,
                {
                  backgroundColor:
                    controller.highlightCreateDraft.color.trim() || "#facc15",
                },
              ]}
            />
            <Text style={styles.caption}>Preview</Text>
          </View>
        </View>
        <TextInput
          multiline
          placeholder="Optional note"
          placeholderTextColor={T.colors.textMuted}
          style={[styles.input, styles.textAreaInputSmall]}
          value={controller.highlightCreateDraft.note}
          onChangeText={(value) =>
            controller.setHighlightCreateDraft((current) => ({
              ...current,
              note: value,
            }))
          }
        />
        {controller.highlightMutationError ? (
          <Text style={styles.error}>{controller.highlightMutationError}</Text>
        ) : null}
        <View style={styles.row}>
          <Pressable
            disabled={controller.highlightMutationBusy || controller.busy}
            onPress={() => void controller.handleCreateHighlight()}
            style={[
              styles.primaryButton,
              (controller.highlightMutationBusy || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>
              {controller.highlightMutationBusy
                ? "Saving..."
                : "Create highlight"}
            </Text>
          </Pressable>
          <Pressable
            disabled={controller.highlightMutationBusy || controller.busy}
            onPress={() =>
              controller.setHighlightCreateDraft((current) => ({
                ...current,
                text: "",
                note: "",
              }))
            }
            style={[
              styles.secondaryButton,
              (controller.highlightMutationBusy || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.secondaryButtonLabel}>Clear</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

export function HighlightDetailScreen({
  highlightId,
}: {
  highlightId: string;
}) {
  const controller = useMobileApp();
  const highlight = controller.highlights.find(
    (item) => item.id === highlightId,
  );
  if (!highlight) {
    return (
      <View style={styles.tabScreen}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Highlight not found</Text>
          <Text style={styles.emptySubtitle}>
            It may have been deleted. Return to the list and refresh.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.routeScrollContent}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Highlight Detail</Text>
        <Text style={styles.meta}>{highlight.referenceLabel}</Text>
        <Text style={styles.connectionSynopsis}>{highlight.text}</Text>
        <TextInput
          autoCapitalize="none"
          placeholder="#facc15"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
          value={controller.highlightEditColor}
          onChangeText={controller.setHighlightEditColor}
        />
        <TextInput
          multiline
          placeholder="Note"
          placeholderTextColor={T.colors.textMuted}
          style={[styles.input, styles.textAreaInputSmall]}
          value={controller.highlightEditNote}
          onChangeText={controller.setHighlightEditNote}
        />
        {controller.highlightMutationError ? (
          <Text style={styles.error}>{controller.highlightMutationError}</Text>
        ) : null}
        <View style={styles.row}>
          <Pressable
            disabled={controller.highlightMutationBusy || controller.busy}
            onPress={() => void controller.handleSaveHighlightEdits()}
            style={[
              styles.primaryButton,
              (controller.highlightMutationBusy || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>
              {controller.highlightMutationBusy ? "Saving..." : "Save changes"}
            </Text>
          </Pressable>
          <Pressable
            disabled={controller.highlightMutationBusy || controller.busy}
            onPress={() => void controller.handleDeleteHighlight(highlight.id)}
            style={[
              styles.dangerButton,
              (controller.highlightMutationBusy || controller.busy) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.dangerButtonLabel}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
