import { Text, View } from "react-native";
import { ActionButton } from "../../components/native/ActionButton";
import { PressableScale } from "../../components/native/PressableScale";
import type {
  LibraryConnectionItem,
  LibraryMapItem,
  MobileBookmarkItem,
  MobileHighlightItem,
} from "../../lib/api";
import { styles } from "../../theme/mobileStyles";

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
  onGoDeeper,
  onOpenMap,
}: {
  item: LibraryConnectionItem;
  onGoDeeper?: () => void;
  onOpenMap?: () => void;
}) {
  return (
    <View style={styles.featureCard}>
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
      {onGoDeeper || onOpenMap ? (
        <View style={styles.row}>
          {onGoDeeper ? (
            <ActionButton
              label="Go deeper"
              onPress={onGoDeeper}
              variant="secondary"
            />
          ) : null}
          {onOpenMap ? (
            <ActionButton
              label="Open map"
              onPress={onOpenMap}
              variant="ghost"
            />
          ) : null}
        </View>
      ) : null}
    </View>
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
          <PressableScale
            onPress={onEdit}
            style={styles.quickActionButton}
            accessibilityRole="button"
            accessibilityLabel="Edit bookmark"
          >
            <Text style={styles.quickActionButtonLabel}>Edit</Text>
          </PressableScale>
          <PressableScale
            onPress={onDelete}
            style={[styles.quickActionButton, styles.quickActionButtonDanger]}
            accessibilityRole="button"
            accessibilityLabel="Delete bookmark"
          >
            <Text
              style={[
                styles.quickActionButtonLabel,
                styles.quickActionButtonLabelDanger,
              ]}
            >
              Delete
            </Text>
          </PressableScale>
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
  onDelete,
  showQuickActions,
}: {
  item: MobileHighlightItem;
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
      accessibilityLabel={`Highlight ${item.referenceLabel}`}
    >
      <View style={styles.connectionHeaderRow}>
        <Text style={styles.connectionRoute} numberOfLines={1}>
          {item.referenceLabel}
        </Text>
        <View style={styles.highlightColorBadgeWrap}>
          <View
            style={[styles.highlightColorDot, { backgroundColor: item.color }]}
          />
          <Text style={styles.highlightColorCode} numberOfLines={1}>
            {item.color}
          </Text>
        </View>
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
          <PressableScale
            onPress={onEdit}
            style={styles.quickActionButton}
            accessibilityRole="button"
            accessibilityLabel="Edit highlight"
          >
            <Text style={styles.quickActionButtonLabel}>Edit</Text>
          </PressableScale>
          <PressableScale
            onPress={onDelete}
            style={[styles.quickActionButton, styles.quickActionButtonDanger]}
            accessibilityRole="button"
            accessibilityLabel="Delete highlight"
          >
            <Text
              style={[
                styles.quickActionButtonLabel,
                styles.quickActionButtonLabelDanger,
              ]}
            >
              Delete
            </Text>
          </PressableScale>
        </View>
      ) : null}
    </PressableScale>
  );
}

export function LibraryMapCard({
  item,
  mutationBusy,
  onOpen,
  onDelete,
}: {
  item: LibraryMapItem;
  mutationBusy?: boolean;
  onOpen?: () => void;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.connectionHeaderRow}>
        <Text style={styles.connectionRoute} numberOfLines={1}>
          {item.title?.trim() || "Untitled map"}
        </Text>
        <Text style={styles.metaPill}>Bundle {item.bundleId ?? "unknown"}</Text>
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
        {item.tags.length > 0 ? (
          <Text style={styles.metaPill}>Tags {item.tags.join(", ")}</Text>
        ) : null}
      </View>
      {item.updatedAt ? (
        <Text style={styles.connectionTimestamp}>
          Updated {formatRelativeDate(item.updatedAt)}
        </Text>
      ) : null}
      {onOpen || onDelete ? (
        <View style={styles.row}>
          {onOpen ? (
            <ActionButton
              disabled={mutationBusy}
              label="Open map"
              onPress={onOpen}
              variant="secondary"
            />
          ) : null}
          {onDelete ? (
            <ActionButton
              disabled={mutationBusy}
              label={mutationBusy ? "Deleting..." : "Delete map"}
              onPress={onDelete}
              variant="danger"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
