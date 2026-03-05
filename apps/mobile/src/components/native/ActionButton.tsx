import type { ReactNode } from "react";
import {
  Text,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { styles } from "../../theme/mobileStyles";
import { PressableScale } from "./PressableScale";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const CONTAINER_VARIANTS: Record<ButtonVariant, StyleProp<ViewStyle>> = {
  primary: styles.primaryButton,
  secondary: styles.secondaryButton,
  ghost: styles.ghostButton,
  danger: styles.dangerButton,
};

const LABEL_VARIANTS: Record<ButtonVariant, StyleProp<TextStyle>> = {
  primary: styles.primaryButtonLabel,
  secondary: styles.secondaryButtonLabel,
  ghost: styles.ghostButtonLabel,
  danger: styles.dangerButtonLabel,
};

interface ActionButtonProps extends PressableProps {
  label: string;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  leftIcon?: ReactNode;
}

export function ActionButton({
  label,
  variant = "primary",
  disabled,
  style,
  labelStyle,
  leftIcon,
  accessibilityLabel,
  ...rest
}: ActionButtonProps) {
  return (
    <PressableScale
      {...rest}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[
        CONTAINER_VARIANTS[variant],
        disabled ? styles.buttonDisabled : null,
        style,
      ]}
    >
      {leftIcon}
      <Text style={[LABEL_VARIANTS[variant], labelStyle]}>{label}</Text>
    </PressableScale>
  );
}
