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

type ChipButtonTone = "default" | "accent" | "danger";

const BASE_STYLE: ViewStyle = {
  minHeight: 36,
  borderRadius: T.radius.pill,
  borderWidth: 1,
  paddingHorizontal: T.spacing.md,
  paddingVertical: 8,
  alignItems: "center",
  justifyContent: "center",
};

const TONE_STYLES: Record<ChipButtonTone, ViewStyle> = {
  default: {
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
  },
  accent: {
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
  },
  danger: {
    borderColor: T.colors.danger,
    backgroundColor: T.colors.dangerSoft,
  },
};

const PRESSED_STYLES: Record<ChipButtonTone, ViewStyle> = {
  default: {
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  accent: {
    borderColor: T.colors.accentStrong,
    backgroundColor: "rgba(212, 175, 55, 0.2)",
  },
  danger: {
    borderColor: "rgba(252, 165, 165, 0.46)",
    backgroundColor: "rgba(239, 68, 68, 0.22)",
  },
};

const LABEL_STYLES: Record<ChipButtonTone, TextStyle> = {
  default: {
    color: T.colors.textMuted,
  },
  accent: {
    color: T.colors.accentStrong,
  },
  danger: {
    color: T.colors.danger,
  },
};

export interface ChipButtonProps extends PressableProps {
  label: string;
  tone?: ChipButtonTone;
  selected?: boolean;
  trailingLabel?: string | number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  trailingLabelStyle?: StyleProp<TextStyle>;
  motionPreset?: PressMotionPreset;
}

export function ChipButton({
  label,
  tone = "default",
  selected = false,
  trailingLabel,
  style,
  labelStyle,
  trailingLabelStyle,
  motionPreset = "quiet",
  accessibilityLabel,
  ...rest
}: ChipButtonProps) {
  const resolvedTone = selected && tone === "default" ? "accent" : tone;

  return (
    <PressableScale
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      motionPreset={motionPreset}
      style={[BASE_STYLE, TONE_STYLES[resolvedTone], style]}
      pressedStyle={PRESSED_STYLES[resolvedTone]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: T.spacing.xs,
        }}
      >
        <Text
          style={[
            {
              fontSize: T.typography.caption,
              fontWeight: "700",
              fontFamily: T.fonts.sans,
            },
            LABEL_STYLES[resolvedTone],
            labelStyle,
          ]}
        >
          {label}
        </Text>
        {trailingLabel !== undefined ? (
          <Text
            style={[
              {
                fontSize: T.typography.caption,
                fontWeight: "700",
                fontFamily: T.fonts.sans,
                color:
                  resolvedTone === "accent"
                    ? T.colors.accent
                    : T.colors.textMuted,
              },
              trailingLabelStyle,
            ]}
          >
            {trailingLabel}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}
