import { Text, View } from "react-native";
import { ChipButton } from "../../components/native/ChipButton";
import { PressableScale } from "../../components/native/PressableScale";
import type {
  LibraryConnectionItem,
  LibraryMapItem,
  MobileBookmarkItem,
  MobileHighlightItem,
} from "../../lib/api";
import { styles } from "../../theme/mobileStyles";
import type { VerseNoteItem } from "../../lib/verseNotes";

function formatTagSummary(tags: string[]): string | null {
  const cleaned = tags.map((tag) => tag.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  if (cleaned.length <= 2) return cleaned.join(", ");
  return `${cleaned.slice(0, 2).join(", ")} +${cleaned.length - 2}`;
}

export function formatRelativeDate(value?: string): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  const nowMs = Date.now();
  const deltaMs = nowMs - parsed.getTime();
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 45) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return parsed.toLocaleDateString();
}

export function ConnectionCard({
  item,
  selected,
  onPress,
  onLongPress,
  onEdit,
  onGoDeeper,
  onDelete,
  onOpenMap,
  showQuickActions,
}: {
  item: LibraryConnectionItem;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onEdit?: () => void;
  onGoDeeper?: () => void;
  onDelete?: () => void;
  onOpenMap?: () => void;
  showQuickActions?: boolean;
}) {
  const content = (
    <>
      <View style={styles.connectionHeaderRow}>
        <Text style={styles.connectionRoute} numberOfLines={1}>
          {item.fromVerse.reference} {"->"} {item.toVerse.reference}
        </Text>
        <Text style={styles.connectionType}>{item.connectionType}</Text>
      </View>
      <Text style={styles.connectionSynopsis} numberOfLines={3}>
        {item.synopsis}
      </Text>
      <View style={styles.connectionMetaWrap}>
        <Text style={styles.metaPill}>
          Similarity {Math.round(item.similarity * 100)}%
        </Text>
        {item.bundleMeta?.anchorRef ? (
          <Text style={styles.metaPill}>
            Anchor {item.bundleMeta.anchorRef}
          </Text>
        ) : null}
        {item.tags.length > 0 ? (
          <Text style={styles.metaPill}>Tags {item.tags.join(", ")}</Text>
        ) : null}
      </View>
      {item.note ? (
        <Text style={styles.connectionNote}>Note: {item.note}</Text>
      ) : null}
      {item.createdAt ? (
        <Text style={styles.connectionTimestamp}>
          {formatRelativeDate(item.createdAt)}
        </Text>
      ) : null}
      {showQuickActions ? (
        <View style={styles.quickActionsRow}>
          <ChipButton
            onPress={onEdit ?? onPress}
            accessibilityLabel="Edit connection"
            label="Edit"
            style={styles.quickActionButton}
            labelStyle={styles.quickActionButtonLabel}
          />
          {onGoDeeper ? (
            <ChipButton
              onPress={onGoDeeper}
              accessibilityLabel="Go deeper on connection"
              label="Go deeper"
              style={styles.quickActionButton}
              labelStyle={styles.quickActionButtonLabel}
            />
          ) : null}
          {onOpenMap ? (
            <ChipButton
              onPress={onOpenMap}
              accessibilityLabel="Open connection map"
              label="Open map"
              style={styles.quickActionButton}
              labelStyle={styles.quickActionButtonLabel}
            />
          ) : null}
          {onDelete ? (
            <ChipButton
              onPress={onDelete}
              accessibilityLabel="Delete connection"
              label="Delete"
              tone="danger"
              style={[styles.quickActionButton, styles.quickActionButtonDanger]}
              labelStyle={[
                styles.quickActionButtonLabel,
                styles.quickActionButtonLabelDanger,
              ]}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.featureCard, selected && styles.featureCardSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Connection ${item.fromVerse.reference} to ${item.toVerse.reference}`}
    >
      {content}
    </PressableScale>
  );
}

export function BookmarkCard({
  item,
  selected,
  onPress,
  onLongPress,
  onEdit,
  onDelete,
  showQuickActions,
}: {
  item: MobileBookmarkItem;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showQuickActions?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.featureCard, selected && styles.featureCardSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Bookmark ${item.text || "entry"}`}
    >
      <Text style={styles.bookmarkText} numberOfLines={4}>
        {item.text || "Empty bookmark"}
      </Text>
      {item.createdAt ? (
        <Text style={styles.connectionTimestamp}>
          Saved {formatRelativeDate(item.createdAt)}
        </Text>
      ) : null}
      {showQuickActions ? (
        <View style={styles.quickActionsRow}>
          <ChipButton
            onPress={onEdit}
            accessibilityLabel="Edit bookmark"
            label="Edit"
            style={styles.quickActionButton}
            labelStyle={styles.quickActionButtonLabel}
          />
          <ChipButton
            onPress={onDelete}
            accessibilityLabel="Delete bookmark"
            label="Delete"
            tone="danger"
            style={[styles.quickActionButton, styles.quickActionButtonDanger]}
            labelStyle={[
              styles.quickActionButtonLabel,
              styles.quickActionButtonLabelDanger,
            ]}
          />
        </View>
      ) : null}
    </PressableScale>
  );
}

export function HighlightCard({
  item,
  selected,
  onPress,
  onLongPress,
  onEdit,
  onExport,
  onDelete,
  showQuickActions,
}: {
  item: MobileHighlightItem;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onEdit?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  showQuickActions?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.featureCard, selected && styles.featureCardSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Highlight ${item.referenceLabel}`}
    >
      <View style={styles.connectionHeaderRow}>
        <Text style={styles.connectionRoute} numberOfLines={1}>
          {item.referenceLabel}
        </Text>
      </View>
      <Text style={styles.connectionSynopsis} numberOfLines={3}>
        {item.text || "No highlight text"}
      </Text>
      {item.note ? (
        <Text style={styles.connectionNote}>Note: {item.note}</Text>
      ) : null}
      {item.updatedAt ? (
        <Text style={styles.connectionTimestamp}>
          Updated {formatRelativeDate(item.updatedAt)}
        </Text>
      ) : null}
      {showQuickActions ? (
        <View style={styles.quickActionsRow}>
          <ChipButton
            onPress={onEdit}
            accessibilityLabel="Edit highlight"
            label="Edit"
            style={styles.quickActionButton}
            labelStyle={styles.quickActionButtonLabel}
          />
          {onExport ? (
            <ChipButton
              onPress={onExport}
              accessibilityLabel="Share highlight"
              label="Share"
              style={styles.quickActionButton}
              labelStyle={styles.quickActionButtonLabel}
            />
          ) : null}
          <ChipButton
            onPress={onDelete}
            accessibilityLabel="Delete highlight"
            label="Delete"
            tone="danger"
            style={[styles.quickActionButton, styles.quickActionButtonDanger]}
            labelStyle={[
              styles.quickActionButtonLabel,
              styles.quickActionButtonLabelDanger,
            ]}
          />
        </View>
      ) : null}
    </PressableScale>
  );
}

export function LibraryMapCard({
  item,
  selected,
  mutationBusy,
  onPress,
  onLongPress,
  onOpen,
  onEdit,
  onDelete,
  showQuickActions,
}: {
  item: LibraryMapItem;
  selected?: boolean;
  mutationBusy?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showQuickActions?: boolean;
}) {
  const tagSummary = formatTagSummary(item.tags);
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.featureCard, selected && styles.featureCardSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Map ${item.title?.trim() || "Untitled map"}`}
    >
      <View style={styles.connectionHeaderRow}>
        <Text style={styles.connectionRoute} numberOfLines={1}>
          {item.title?.trim() || "Untitled map"}
        </Text>
        {tagSummary ? <Text style={styles.metaPill}>{tagSummary}</Text> : null}
      </View>
      {item.note ? (
        <Text style={styles.connectionNote} numberOfLines={3}>
          Note: {item.note}
        </Text>
      ) : null}
      <View style={styles.connectionMetaWrap}>
        {item.bundleMeta?.anchorRef ? (
          <Text style={styles.metaPill}>
            Anchor {item.bundleMeta.anchorRef}
          </Text>
        ) : null}
        {tagSummary ? (
          <Text style={styles.metaPill}>Tags {tagSummary}</Text>
        ) : null}
      </View>
      {item.updatedAt ? (
        <Text style={styles.connectionTimestamp}>
          Updated {formatRelativeDate(item.updatedAt)}
        </Text>
      ) : null}
      {showQuickActions ? (
        <View style={styles.quickActionsRow}>
          {onEdit ? (
            <ChipButton
              disabled={mutationBusy}
              onPress={onEdit}
              accessibilityLabel="Edit map"
              label="Edit"
              style={styles.quickActionButton}
              labelStyle={styles.quickActionButtonLabel}
            />
          ) : null}
          {onOpen ? (
            <ChipButton
              disabled={mutationBusy}
              onPress={onOpen}
              accessibilityLabel="Open map"
              label="Open map"
              style={styles.quickActionButton}
              labelStyle={styles.quickActionButtonLabel}
            />
          ) : null}
          {onDelete ? (
            <ChipButton
              disabled={mutationBusy}
              onPress={onDelete}
              accessibilityLabel="Delete map"
              label={mutationBusy ? "Deleting..." : "Delete"}
              tone="danger"
              style={[styles.quickActionButton, styles.quickActionButtonDanger]}
              labelStyle={[
                styles.quickActionButtonLabel,
                styles.quickActionButtonLabelDanger,
              ]}
            />
          ) : null}
        </View>
      ) : null}
    </PressableScale>
  );
}

export function VerseNoteCard({
  item,
  selected,
  onPress,
  onLongPress,
  onOpenReader,
  onDelete,
  showQuickActions,
}: {
  item: VerseNoteItem;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onOpenReader?: () => void;
  onDelete?: () => void;
  showQuickActions?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.featureCard, selected && styles.featureCardSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Note ${item.reference}`}
    >
      <View style={styles.connectionHeaderRow}>
        <Text style={styles.connectionRoute} numberOfLines={1}>
          {item.reference}
        </Text>
        <Text style={styles.metaPill}>Note</Text>
      </View>
      <Text style={styles.connectionSynopsis} numberOfLines={4}>
        {item.text}
      </Text>
      <Text style={styles.connectionTimestamp}>
        Updated {formatRelativeDate(item.updatedAt)}
      </Text>
      {showQuickActions ? (
        <View style={styles.quickActionsRow}>
          <ChipButton
            onPress={onPress}
            accessibilityLabel="Edit note"
            label="Edit"
            style={styles.quickActionButton}
            labelStyle={styles.quickActionButtonLabel}
          />
          {onOpenReader ? (
            <ChipButton
              onPress={onOpenReader}
              accessibilityLabel="Open note in reader"
              label="Open"
              style={styles.quickActionButton}
              labelStyle={styles.quickActionButtonLabel}
            />
          ) : null}
          {onDelete ? (
            <ChipButton
              onPress={onDelete}
              accessibilityLabel="Delete note"
              label="Delete"
              tone="danger"
              style={[styles.quickActionButton, styles.quickActionButtonDanger]}
              labelStyle={[
                styles.quickActionButtonLabel,
                styles.quickActionButtonLabelDanger,
              ]}
            />
          ) : null}
        </View>
      ) : null}
    </PressableScale>
  );
}
