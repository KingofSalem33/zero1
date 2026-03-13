import {
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { T } from "../../theme/mobileStyles";
import { PressableScale, type PressMotionPreset } from "./PressableScale";

export interface ListRowButtonProps extends PressableProps {
  label: string;
  meta?: string;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  metaStyle?: StyleProp<TextStyle>;
  motionPreset?: PressMotionPreset;
}

export function ListRowButton({
  label,
  meta,
  selected = false,
  style,
  labelStyle,
  metaStyle,
  motionPreset = "quiet",
  accessibilityLabel,
  ...rest
}: ListRowButtonProps) {
  return (
    <PressableScale
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{
        ...(rest.accessibilityState ?? {}),
        selected,
      }}
      motionPreset={motionPreset}
      style={[
        {
          minHeight: T.touchTarget.min,
          borderRadius: T.radius.md,
          borderWidth: 1,
          borderColor: selected ? T.colors.accent : T.colors.border,
          backgroundColor: selected ? T.colors.accentSoft : T.colors.surface,
          paddingHorizontal: T.spacing.md,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: T.spacing.sm,
        },
        style,
      ]}
      pressedStyle={{
        borderColor: selected
          ? T.colors.accentStrong
          : "rgba(255, 255, 255, 0.22)",
        backgroundColor: selected
          ? "rgba(212, 175, 55, 0.2)"
          : "rgba(255, 255, 255, 0.14)",
      }}
    >
      <Text
        style={[
          {
            flex: 1,
            color: selected ? T.colors.accentStrong : T.colors.text,
            fontSize: T.typography.bodySm,
            fontWeight: "700",
            fontFamily: T.fonts.sans,
          },
          labelStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {meta ? (
        <View>
          <Text
            style={[
              {
                color: T.colors.textMuted,
                fontSize: T.typography.caption,
                fontWeight: "600",
                fontFamily: T.fonts.sans,
              },
              metaStyle,
            ]}
          >
            {meta}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}
