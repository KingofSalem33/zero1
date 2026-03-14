import {
  Alert,
  Share,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import { parseBookmarkReference } from "@zero1/shared";
import { ActionButton } from "../components/native/ActionButton";
import { ChipButton } from "../components/native/ChipButton";
import { PressableScale } from "../components/native/PressableScale";
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

function formatHighlightShareText(args: {
  referenceLabel: string;
  text: string;
  color: string;
  note?: string;
}): string {
  return [
    args.referenceLabel,
    args.text,
    `Color: ${args.color}`,
    args.note?.trim() ? `Note: ${args.note.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

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
              accessibilityLabel="Bookmark book"
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
              accessibilityLabel="Bookmark chapter"
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
              <ChipButton
                key={book}
                onPress={() => controller.selectBookmarkBookSuggestion(book)}
                accessibilityLabel={`Select ${book}`}
                label={book}
                style={styles.suggestionChip}
                labelStyle={styles.suggestionChipLabel}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.fieldGroup}>
          <Text style={styles.helperText}>Verse (optional)</Text>
          <TextInput
            keyboardType="number-pad"
            placeholder="Verse"
            accessibilityLabel="Bookmark verse"
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
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
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
            label="Open in Bible"
            onPress={() => {
              try {
                const reference = parseBookmarkReference(bookmark.text);
                if (reference.verse !== undefined) {
                  controller.queueReaderFocusTarget(
                    reference.book,
                    reference.chapter,
                    reference.verse,
                  );
                }
                void controller.navigateReaderTo(
                  reference.book,
                  reference.chapter,
                );
                navigation.navigate("Tabs", { mode: "Reader" } as never);
              } catch {
                // Bookmark string is malformed; keep user on detail view.
              }
            }}
            variant="secondary"
          />
          <ActionButton
            disabled={controller.bookmarkMutationBusy || controller.busy}
            label={controller.bookmarkMutationBusy ? "Deleting..." : "Delete"}
            onPress={() =>
              Alert.alert(
                "Delete bookmark?",
                "This will remove the bookmark from your library.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      const deleted = await controller.handleDeleteBookmark(
                        bookmark.id,
                      );
                      if (!deleted) return;
                      if (navigation.canGoBack()) {
                        navigation.goBack();
                        return;
                      }
                      navigation.navigate("Tabs", { mode: "Library" } as never);
                    },
                  },
                ],
              )
            }
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
              accessibilityLabel="Highlight book"
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
              accessibilityLabel="Highlight chapter"
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
            accessibilityLabel="Highlight verses"
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
            accessibilityLabel="Highlight text"
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
            <PressableScale
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
              accessibilityRole="button"
              accessibilityLabel={`Set highlight color ${color}`}
            />
          ))}
        </View>
        <View style={styles.row}>
          <TextInput
            autoCapitalize="none"
            placeholder="#facc15"
            accessibilityLabel="Highlight color hex"
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
            accessibilityLabel="Highlight note"
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
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
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
        <TextInput
          autoCapitalize="none"
          placeholder="#facc15"
          accessibilityLabel="Edit highlight color"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
          value={controller.highlightEditColor}
          onChangeText={controller.setHighlightEditColor}
        />
        <Text style={styles.fieldLabel}>Note</Text>
        <TextInput
          multiline
          placeholder="Note"
          accessibilityLabel="Edit highlight note"
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
            label="Open in Bible"
            onPress={() => {
              const firstVerse = highlight.verses.at(0);
              if (firstVerse !== undefined) {
                controller.queueReaderFocusTarget(
                  highlight.book,
                  highlight.chapter,
                  firstVerse,
                );
              }
              void controller.navigateReaderTo(
                highlight.book,
                highlight.chapter,
              );
              navigation.navigate("Tabs", { mode: "Reader" } as never);
            }}
            variant="secondary"
          />
          <ActionButton
            disabled={controller.highlightMutationBusy || controller.busy}
            label="Share"
            onPress={() =>
              void Share.share({
                title: highlight.referenceLabel,
                message: formatHighlightShareText({
                  referenceLabel: highlight.referenceLabel,
                  text: highlight.text,
                  color: highlight.color,
                  note: highlight.note,
                }),
              })
            }
            variant="ghost"
          />
        </View>
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
            onPress={() =>
              Alert.alert(
                "Delete highlight?",
                "This will permanently remove the highlight.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      const deleted = await controller.handleDeleteHighlight(
                        highlight.id,
                      );
                      if (!deleted) return;
                      if (navigation.canGoBack()) {
                        navigation.goBack();
                        return;
                      }
                      navigation.navigate("Tabs", { mode: "Library" } as never);
                    },
                  },
                ],
              )
            }
            variant="danger"
          />
        </View>
      </SurfaceCard>
    </ScrollView>
  );
}
