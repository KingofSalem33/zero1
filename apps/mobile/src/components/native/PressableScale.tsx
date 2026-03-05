import type { ReactNode } from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { styles, T } from "../../theme/mobileStyles";

interface PressableScaleProps extends PressableProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
}

export function PressableScale({
  children,
  disabled,
  style,
  pressedStyle,
  ...rest
}: PressableScaleProps) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      accessibilityState={{
        ...(rest.accessibilityState ?? {}),
        disabled: Boolean(disabled),
      }}
      style={({ pressed }) => [
        style,
        pressed && !disabled
          ? [
              styles.pressableScalePressed,
              { transform: [{ scale: T.motion.pressScale }] },
              pressedStyle,
            ]
          : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      {children}
    </Pressable>
  );
}
