import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LayoutMode } from "../../hooks/useLayoutMode";
import { T } from "../../theme/mobileStyles";
import { BottomSheetSurface } from "./BottomSheetSurface";

type MapInspectorVariant = "node" | "edge" | "parallels";

const SNAP_POINTS: Record<MapInspectorVariant, string[]> = {
  node: ["60%"],
  parallels: ["65%"],
  edge: ["58%"],
};

function SkeletonLine({ width }: { width: number | string }) {
  return (
    <View
      style={[
        local.skeletonLine,
        typeof width === "number" ? { width } : { width: width as never },
      ]}
    />
  );
}

export function MapInspectorSurface({
  mode,
  variant,
  visible,
  onClose,
  title,
  subtitle,
  headerRight,
  children,
  scrollable = false,
  titleLoading = false,
}: {
  mode: LayoutMode;
  variant: MapInspectorVariant;
  visible: boolean;
  onClose: () => void;
  title?: string | null;
  subtitle?: string | null;
  headerRight?: ReactNode;
  children: ReactNode;
  scrollable?: boolean;
  titleLoading?: boolean;
}) {
  const insets = useSafeAreaInsets();

  if (mode === "compact") {
    const showTitleSkeleton = titleLoading && !title;
    return (
      <BottomSheetSurface
        visible={visible}
        onClose={onClose}
        title={showTitleSkeleton ? undefined : (title ?? undefined)}
        subtitle={showTitleSkeleton ? undefined : subtitle}
        headerRight={
          showTitleSkeleton ? (
            <View style={local.skeletonHeaderCompact}>
              <SkeletonLine width={200} />
              {subtitle ? (
                <View style={{ opacity: 0.6 }}>
                  <SkeletonLine width={120} />
                </View>
              ) : null}
            </View>
          ) : (
            headerRight
          )
        }
        snapPoints={SNAP_POINTS[variant]}
      >
        {children}
      </BottomSheetSurface>
    );
  }

  if (!visible) return null;

  const content = scrollable ? (
    <ScrollView
      style={local.contentScroll}
      contentContainerStyle={local.contentScrollContent}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={local.contentStatic}>{children}</View>
  );

  return (
    <View
      style={[
        local.rail,
        {
          paddingTop: Math.max(insets.top, 14),
          paddingBottom: Math.max(insets.bottom, 14),
        },
      ]}
    >
      {title || subtitle || headerRight || titleLoading ? (
        <View style={local.header}>
          <View style={local.titleBlock}>
            {title ? (
              <Text
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={local.title}
              >
                {title}
              </Text>
            ) : titleLoading ? (
              <SkeletonLine width={180} />
            ) : null}
            {subtitle ? (
              <Text numberOfLines={1} style={local.subtitle}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerRight}
          <Pressable
            accessibilityLabel="Close inspector"
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
            style={local.closeButton}
          >
            <Ionicons color={T.colors.textMuted} name="close" size={18} />
          </Pressable>
        </View>
      ) : null}
      {content}
    </View>
  );
}

const local = StyleSheet.create({
  rail: {
    width: "32%",
    minWidth: 320,
    maxWidth: 420,
    backgroundColor: T.colors.ink,
    borderLeftWidth: 1,
    borderLeftColor: T.colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: T.spacing.sm,
    paddingHorizontal: T.spacing.lg,
    paddingBottom: T.spacing.sm,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    color: T.colors.text,
    fontSize: T.typography.subheading,
    fontWeight: "700",
    fontFamily: T.fonts.sans,
  },
  subtitle: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    fontFamily: T.fonts.sans,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  contentScroll: {
    flex: 1,
  },
  contentScrollContent: {
    paddingBottom: T.spacing.lg,
  },
  contentStatic: {
    flex: 1,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  skeletonTitleRow: {
    flex: 1,
    gap: 6,
  },
  skeletonHeaderCompact: {
    flex: 1,
    gap: 6,
    paddingTop: 2,
  },
});
