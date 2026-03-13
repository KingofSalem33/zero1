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
}: {
  mode: LayoutMode;
  variant: MapInspectorVariant;
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string | null;
  headerRight?: ReactNode;
  children: ReactNode;
  scrollable?: boolean;
}) {
  const insets = useSafeAreaInsets();

  if (mode === "compact") {
    return (
      <BottomSheetSurface
        visible={visible}
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        headerRight={headerRight}
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
      {title || subtitle || headerRight ? (
        <View style={local.header}>
          <View style={local.titleBlock}>
            {title ? (
              <Text numberOfLines={1} style={local.title}>
                {title}
              </Text>
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
});
