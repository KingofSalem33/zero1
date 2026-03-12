import type { ReactNode } from "react";
import {
  Text,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { T } from "../../theme/mobileStyles";
import { PressableScale, type PressMotionPreset } from "./PressableScale";

type CompactButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BASE_STYLE: ViewStyle = {
  minHeight: 36,
  borderRadius: T.radius.md,
  paddingHorizontal: T.spacing.md,
  paddingVertical: 8,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  gap: T.spacing.xs,
};

const CONTAINER_VARIANTS: Record<CompactButtonVariant, ViewStyle> = {
  primary: {
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accent,
  },
  secondary: {
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
  },
  ghost: {
    borderColor: T.colors.border,
    backgroundColor: T.colors.surfaceRaised,
  },
  danger: {
    borderColor: T.colors.danger,
    backgroundColor: T.colors.dangerSoft,
  },
};

const PRESSED_VARIANTS: Record<CompactButtonVariant, ViewStyle> = {
  primary: {
    borderColor: T.colors.accentStrong,
    backgroundColor: T.colors.accentStrong,
  },
  secondary: {
    borderColor: "rgba(255, 255, 255, 0.24)",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  ghost: {
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  danger: {
    borderColor: "rgba(252, 165, 165, 0.46)",
    backgroundColor: "rgba(239, 68, 68, 0.22)",
  },
};

const LABEL_VARIANTS: Record<CompactButtonVariant, TextStyle> = {
  primary: {
    color: T.colors.ink,
  },
  secondary: {
    color: T.colors.text,
  },
  ghost: {
    color: T.colors.text,
  },
  danger: {
    color: T.colors.danger,
  },
};

export interface CompactButtonProps extends PressableProps {
  label: string;
  variant?: CompactButtonVariant;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  leftIcon?: ReactNode;
  motionPreset?: PressMotionPreset;
  pressedStyle?: StyleProp<ViewStyle>;
}

export function CompactButton({
  label,
  variant = "ghost",
  style,
  labelStyle,
  leftIcon,
  motionPreset = "quiet",
  pressedStyle,
  accessibilityLabel,
  ...rest
}: CompactButtonProps) {
  return (
    <PressableScale
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      motionPreset={motionPreset}
      style={[BASE_STYLE, CONTAINER_VARIANTS[variant], style]}
      pressedStyle={[PRESSED_VARIANTS[variant], pressedStyle]}
    >
      {leftIcon}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.84}
        numberOfLines={1}
        style={[
          {
            fontSize: 13,
            fontWeight: "700",
            fontFamily: T.fonts.sans,
          },
          LABEL_VARIANTS[variant],
          labelStyle,
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
