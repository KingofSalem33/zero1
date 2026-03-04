import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { ActionButton } from "../components/native/ActionButton";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { useMobileApp } from "../context/MobileAppContext";
import { styles, T } from "../theme/mobileStyles";
import { formatRelativeDate } from "./common/EntityCards";

const HIGHLIGHT_PRESET_COLORS = [
  "#FACC15",
  "#F97316",
  "#22C55E",
  "#38BDF8",
  "#A78BFA",
  "#F43F5E",
];

export function BookmarkCreateScreen() {
  const controller = useMobileApp();
  const { width } = useWindowDimensions();
  const stackReferenceInputs = width < 390;
  const clearDisabled =
    controller.bookmarkMutationBusy ||
    controller.busy ||
    (!controller.bookmarkDraft.book.trim() &&
      !controller.bookmarkDraft.chapter.trim() &&
      !controller.bookmarkDraft.verse.trim());

  return (
    <ScrollView contentContainerStyle={styles.routeScrollContent}>
      <SurfaceCard>
        <Text style={styles.panelTitle}>New Bookmark</Text>
        <Text style={styles.panelSubtitle}>
          Save a verse reference with structured fields.
        </Text>
        <Text style={styles.fieldLabel}>Reference</Text>
        <View style={[styles.row, stackReferenceInputs && styles.rowStack]}>
          <View style={[styles.fieldGroup, styles.flex1]}>
            <Text style={styles.helperText}>Book</Text>
            <TextInput
              autoCapitalize="words"
              placeholder="Book"
              placeholderTextColor={T.colors.textMuted}
              style={styles.input}
              value={controller.bookmarkDraft.book}
              onChangeText={(value) =>
                controller.setBookmarkDraft((current) => ({
                  ...current,
                  book: value,
                }))
              }
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.helperText}>Chapter</Text>
            <TextInput
              keyboardType="number-pad"
              placeholder="Chapter"
              placeholderTextColor={T.colors.textMuted}
              style={[
                styles.input,
                !stackReferenceInputs && styles.inputCompact,
                stackReferenceInputs && styles.flex1,
              ]}
              value={controller.bookmarkDraft.chapter}
              onChangeText={(value) =>
                controller.setBookmarkDraft((current) => ({
                  ...current,
                  chapter: value,
                }))
              }
            />
          </View>
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
        <View style={styles.fieldGroup}>
          <Text style={styles.helperText}>Verse (optional)</Text>
          <TextInput
            keyboardType="number-pad"
            placeholder="Verse"
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
        </View>
        {controller.bookmarkMutationError ? (
          <Text style={styles.error}>{controller.bookmarkMutationError}</Text>
        ) : null}
        <View style={styles.row}>
          <ActionButton
            disabled={controller.bookmarkMutationBusy || controller.busy}
            label={
              controller.bookmarkMutationBusy ? "Saving..." : "Save bookmark"
            }
            onPress={() => void controller.handleCreateBookmark()}
            variant="primary"
          />
          <ActionButton
            disabled={clearDisabled}
            label="Clear"
            onPress={() =>
              controller.setBookmarkDraft({
                book: "",
                chapter: "",
                verse: "",
              })
            }
            variant="secondary"
          />
        </View>
      </SurfaceCard>
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
      <SurfaceCard>
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
          <ActionButton
            disabled={controller.bookmarkMutationBusy || controller.busy}
            label={controller.bookmarkMutationBusy ? "Deleting..." : "Delete"}
            onPress={() => void controller.handleDeleteBookmark(bookmark.id)}
            variant="danger"
          />
        </View>
      </SurfaceCard>
    </ScrollView>
  );
}

export function HighlightCreateScreen() {
  const controller = useMobileApp();
  const { width } = useWindowDimensions();
  const stackReferenceInputs = width < 390;

  return (
    <ScrollView contentContainerStyle={styles.routeScrollContent}>
      <SurfaceCard>
        <Text style={styles.panelTitle}>New Highlight</Text>
        <Text style={styles.panelSubtitle}>
          Capture verses, assign a color, and keep optional notes for context.
        </Text>
        <Text style={styles.fieldLabel}>Reference</Text>
        <View style={[styles.row, stackReferenceInputs && styles.rowStack]}>
          <View style={[styles.fieldGroup, styles.flex1]}>
            <Text style={styles.helperText}>Book</Text>
            <TextInput
              placeholder="Book"
              placeholderTextColor={T.colors.textMuted}
              style={styles.input}
              value={controller.highlightCreateDraft.book}
              onChangeText={(value) =>
                controller.setHighlightCreateDraft((current) => ({
                  ...current,
                  book: value,
                }))
              }
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.helperText}>Chapter</Text>
            <TextInput
              keyboardType="number-pad"
              placeholder="Chapter"
              placeholderTextColor={T.colors.textMuted}
              style={[
                styles.input,
                !stackReferenceInputs && styles.inputCompact,
                stackReferenceInputs && styles.flex1,
              ]}
              value={controller.highlightCreateDraft.chapter}
              onChangeText={(value) =>
                controller.setHighlightCreateDraft((current) => ({
                  ...current,
                  chapter: value,
                }))
              }
            />
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.helperText}>Verses</Text>
          <TextInput
            placeholder="Comma-separated, e.g. 1,2,3"
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
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.helperText}>Highlight text</Text>
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
        </View>
        <Text style={styles.fieldLabel}>Color</Text>
        <View style={styles.colorChipRow}>
          {HIGHLIGHT_PRESET_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() =>
                controller.setHighlightCreateDraft((current) => ({
                  ...current,
                  color,
                }))
              }
              style={[
                styles.colorChip,
                { backgroundColor: color },
                controller.highlightCreateDraft.color.trim().toLowerCase() ===
                color.toLowerCase()
                  ? styles.colorChipActive
                  : null,
              ]}
            />
          ))}
        </View>
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
        <View style={styles.fieldGroup}>
          <Text style={styles.helperText}>Note (optional)</Text>
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
        </View>
        {controller.highlightMutationError ? (
          <Text style={styles.error}>{controller.highlightMutationError}</Text>
        ) : null}
        <View style={styles.row}>
          <ActionButton
            disabled={controller.highlightMutationBusy || controller.busy}
            label={
              controller.highlightMutationBusy
                ? "Saving..."
                : "Create highlight"
            }
            onPress={() => void controller.handleCreateHighlight()}
            variant="primary"
          />
          <ActionButton
            disabled={controller.highlightMutationBusy || controller.busy}
            label="Clear"
            onPress={() =>
              controller.setHighlightCreateDraft((current) => ({
                ...current,
                text: "",
                note: "",
              }))
            }
            variant="secondary"
          />
        </View>
      </SurfaceCard>
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
      <SurfaceCard>
        <Text style={styles.panelTitle}>Highlight Detail</Text>
        <Text style={styles.meta}>{highlight.referenceLabel}</Text>
        <Text style={styles.connectionSynopsis}>{highlight.text}</Text>
        <Text style={styles.fieldLabel}>Color</Text>
        <View style={styles.colorChipRow}>
          {HIGHLIGHT_PRESET_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => controller.setHighlightEditColor(color)}
              style={[
                styles.colorChip,
                { backgroundColor: color },
                controller.highlightEditColor.trim().toLowerCase() ===
                color.toLowerCase()
                  ? styles.colorChipActive
                  : null,
              ]}
            />
          ))}
        </View>
        <TextInput
          autoCapitalize="none"
          placeholder="#facc15"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
          value={controller.highlightEditColor}
          onChangeText={controller.setHighlightEditColor}
        />
        <Text style={styles.fieldLabel}>Note</Text>
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
          <ActionButton
            disabled={controller.highlightMutationBusy || controller.busy}
            label={
              controller.highlightMutationBusy ? "Saving..." : "Save changes"
            }
            onPress={() => void controller.handleSaveHighlightEdits()}
            variant="primary"
          />
          <ActionButton
            disabled={controller.highlightMutationBusy || controller.busy}
            label="Delete"
            onPress={() => void controller.handleDeleteHighlight(highlight.id)}
            variant="danger"
          />
        </View>
      </SurfaceCard>
    </ScrollView>
  );
}
