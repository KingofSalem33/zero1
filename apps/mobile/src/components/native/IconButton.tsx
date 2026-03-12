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

type IconButtonTone = "default" | "accent" | "danger";
type IconButtonShape = "circle" | "rounded";

const BASE_STYLE: ViewStyle = {
  width: T.touchTarget.min,
  height: T.touchTarget.min,
  minWidth: T.touchTarget.min,
  minHeight: T.touchTarget.min,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
};

const TONE_STYLES: Record<IconButtonTone, ViewStyle> = {
  default: {
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(24, 24, 27, 0.84)",
  },
  accent: {
    borderColor: "rgba(212, 175, 55, 0.4)",
    backgroundColor: "rgba(212, 175, 55, 0.14)",
  },
  danger: {
    borderColor: "rgba(239, 68, 68, 0.32)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
};

const PRESSED_STYLES: Record<IconButtonTone, ViewStyle> = {
  default: {
    borderColor: "rgba(255, 255, 255, 0.24)",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  accent: {
    borderColor: "rgba(240, 215, 127, 0.56)",
    backgroundColor: "rgba(212, 175, 55, 0.2)",
  },
  danger: {
    borderColor: "rgba(252, 165, 165, 0.48)",
    backgroundColor: "rgba(239, 68, 68, 0.18)",
  },
};

const SHAPE_STYLES: Record<IconButtonShape, ViewStyle> = {
  circle: {
    borderRadius: T.radius.pill,
  },
  rounded: {
    borderRadius: T.radius.md,
  },
};

export interface IconButtonProps extends PressableProps {
  icon: ReactNode;
  label?: string;
  tone?: IconButtonTone;
  shape?: IconButtonShape;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  motionPreset?: PressMotionPreset;
}

export function IconButton({
  icon,
  label,
  tone = "default",
  shape = "circle",
  style,
  pressedStyle,
  labelStyle,
  motionPreset = "quiet",
  accessibilityLabel,
  ...rest
}: IconButtonProps) {
  return (
    <PressableScale
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      motionPreset={motionPreset}
      style={[BASE_STYLE, SHAPE_STYLES[shape], TONE_STYLES[tone], style]}
      pressedStyle={[PRESSED_STYLES[tone], pressedStyle]}
    >
      {icon}
      {label ? (
        <Text
          style={[
            {
              color: T.colors.text,
              fontSize: T.typography.caption,
              fontWeight: "700",
              fontFamily: T.fonts.sans,
            },
            labelStyle,
          ]}
        >
          {label}
        </Text>
      ) : null}
    </PressableScale>
  );
}
