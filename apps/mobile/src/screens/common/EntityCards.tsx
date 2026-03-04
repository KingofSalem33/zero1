import { Pressable, Text, View } from "react-native";
import { ActionButton } from "../../components/native/ActionButton";
import type {
  LibraryConnectionItem,
  LibraryMapItem,
  MobileBookmarkItem,
  MobileHighlightItem,
} from "../../lib/api";
import { styles } from "../../theme/mobileStyles";

export function formatRelativeDate(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

export function ConnectionCard({ item }: { item: LibraryConnectionItem }) {
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
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.featureCard, selected && styles.featureCardSelected]}
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
          <Pressable onPress={onEdit} style={styles.quickActionButton}>
            <Text style={styles.quickActionButtonLabel}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            style={[styles.quickActionButton, styles.quickActionButtonDanger]}
          >
            <Text
              style={[
                styles.quickActionButtonLabel,
                styles.quickActionButtonLabelDanger,
              ]}
            >
              Delete
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
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
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.featureCard, selected && styles.featureCardSelected]}
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
          <Pressable onPress={onEdit} style={styles.quickActionButton}>
            <Text style={styles.quickActionButtonLabel}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            style={[styles.quickActionButton, styles.quickActionButtonDanger]}
          >
            <Text
              style={[
                styles.quickActionButtonLabel,
                styles.quickActionButtonLabelDanger,
              ]}
            >
              Delete
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

export function LibraryMapCard({
  item,
  mutationBusy,
  onDelete,
}: {
  item: LibraryMapItem;
  mutationBusy?: boolean;
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
      {onDelete ? (
        <View style={styles.row}>
          <ActionButton
            disabled={mutationBusy}
            label={mutationBusy ? "Deleting..." : "Delete map"}
            onPress={onDelete}
            variant="danger"
          />
        </View>
      ) : null}
    </View>
  );
}
