import {
  useCallback,
  useEffect,
  useRef,
  type ComponentRef,
  type ReactNode,
} from "react";
import { Keyboard, StyleSheet, Text, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "./ActionButton";
import { T } from "../../theme/mobileStyles";

const SNAP_POINTS = ["58%", "82%"];

export function NoteEditorModal({
  visible,
  title,
  subtitle,
  value,
  onChangeText,
  onClose,
  onSave,
  busy = false,
  error = null,
  placeholder = "Write a note...",
  saveLabel = "Save",
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  value: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
  placeholder?: string;
  saveLabel?: string;
  children?: ReactNode;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const inputRef = useRef<ComponentRef<typeof BottomSheetTextInput> | null>(
    null,
  );
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
      const timer = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(timer);
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    Keyboard.dismiss();
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
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      enableDynamicSizing={false}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
      handleIndicatorStyle={local.handleIndicator}
      backgroundStyle={local.sheetBg}
      style={local.sheet}
    >
      <View style={local.header}>
        <View style={local.titleBlock}>
          <Text style={local.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={local.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <ActionButton
          label={busy ? "Saving..." : saveLabel}
          onPress={() => void onSave()}
          disabled={busy}
          variant="primary"
        />
      </View>

      <BottomSheetScrollView
        contentContainerStyle={[
          local.body,
          {
            paddingBottom: Math.max(T.spacing.xl, insets.bottom + T.spacing.md),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
        <BottomSheetTextInput
          ref={inputRef}
          accessibilityLabel={`${title} note`}
          multiline
          placeholder={placeholder}
          placeholderTextColor={T.colors.textMuted}
          scrollEnabled={false}
          style={local.input}
          textAlignVertical="top"
          value={value}
          onChangeText={onChangeText}
        />
        {error ? <Text style={local.error}>{error}</Text> : null}
      </BottomSheetScrollView>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: T.spacing.lg,
    paddingTop: T.spacing.xs,
    paddingBottom: T.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.colors.border,
    gap: T.spacing.md,
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
  body: {
    paddingHorizontal: T.spacing.lg,
    paddingTop: T.spacing.lg,
    gap: T.spacing.md,
  },
  input: {
    color: T.colors.text,
    fontSize: T.typography.body,
    fontFamily: T.fonts.sans,
    lineHeight: 24,
    minHeight: 160,
    textAlignVertical: "top",
    padding: 0,
  },
  error: {
    color: T.colors.danger,
    fontSize: T.typography.caption,
    fontFamily: T.fonts.sans,
  },
});
