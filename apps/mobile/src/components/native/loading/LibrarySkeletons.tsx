import { StyleSheet, View } from "react-native";
import { T } from "../../../theme/mobileStyles";
import { SkeletonBlock, SkeletonTextLines } from "./SkeletonNative";

export function ConnectionCardSkeleton() {
  return (
    <View style={localStyles.card}>
      <View style={localStyles.headerRow}>
        <SkeletonBlock width={10} height={10} radius={5} />
        <SkeletonBlock width={84} height={12} radius={5} />
        <SkeletonBlock width={36} height={11} radius={5} />
      </View>
      <View style={localStyles.chipRow}>
        <SkeletonBlock width={92} height={24} radius={999} />
        <SkeletonBlock width={112} height={24} radius={999} />
      </View>
      <SkeletonTextLines lines={["100%", "100%", "76%"]} gap={7} />
      <SkeletonBlock width={96} height={30} radius={8} />
    </View>
  );
}

export function LibraryMapSkeleton() {
  return (
    <View style={localStyles.card}>
      <View style={localStyles.headerRow}>
        <SkeletonBlock width={64} height={11} radius={5} />
      </View>
      <SkeletonBlock width={154} height={14} radius={6} />
      <SkeletonBlock width={182} height={12} radius={5} />
      <SkeletonBlock width={98} height={30} radius={8} />
    </View>
  );
}

export function HighlightCardSkeleton() {
  return (
    <View style={localStyles.card}>
      <View style={localStyles.topMetaRow}>
        <View style={{ gap: 6 }}>
          <SkeletonBlock width={106} height={14} radius={6} />
          <SkeletonBlock width={70} height={11} radius={5} />
        </View>
      </View>
      <View style={localStyles.highlightQuote}>
        <SkeletonTextLines lines={["100%", "97%", "83%"]} gap={7} />
      </View>
      <View style={localStyles.headerRow}>
        <SkeletonBlock width={10} height={10} radius={5} />
        <SkeletonBlock width={102} height={11} radius={5} />
      </View>
    </View>
  );
}

export function BookmarkCardSkeleton() {
  return (
    <View style={localStyles.card}>
      <View style={localStyles.headerRow}>
        <SkeletonBlock width={14} height={14} radius={7} />
        <SkeletonBlock width={128} height={13} radius={6} />
      </View>
      <SkeletonTextLines lines={["98%", "95%", "74%"]} gap={7} />
      <SkeletonBlock width={90} height={11} radius={5} />
    </View>
  );
}

const localStyles = StyleSheet.create({
  card: {
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  highlightQuote: {
    borderLeftWidth: 3,
    borderLeftColor: "rgba(212, 175, 55, 0.28)",
    paddingLeft: 8,
  },
});
