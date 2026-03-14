import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "../../theme/mobileStyles";

export function BottomSheetSurface({
  visible,
  onClose,
  title,
  subtitle,
  headerRight,
  snapPoints,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string | null;
  headerRight?: ReactNode;
  snapPoints: string[];
  children: ReactNode;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const maxDynamicContentSize = Math.max(
    320,
    Math.floor(window.height - insets.top - 96),
  );

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
      return;
    }
    sheetRef.current?.dismiss();
  }, [visible]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing
      maxDynamicContentSize={maxDynamicContentSize}
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
      handleIndicatorStyle={local.handleIndicator}
      backgroundStyle={local.sheetBg}
      style={local.sheet}
    >
      <BottomSheetView style={local.root}>
        {title || subtitle || headerRight ? (
          <View style={local.header}>
            <View style={local.titleBlock}>
              {title ? (
                <Text
                  style={local.title}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={local.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {headerRight}
          </View>
        ) : null}
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const local = StyleSheet.create({
  sheet: {
    zIndex: 999,
  },
  sheetBg: {
    backgroundColor: T.colors.ink,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  handleIndicator: {
    backgroundColor: T.colors.textMuted,
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.7,
  },
  root: {
    gap: T.spacing.sm,
    paddingBottom: T.spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: T.spacing.sm,
    paddingHorizontal: T.spacing.lg,
    paddingTop: T.spacing.xs,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
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
});
