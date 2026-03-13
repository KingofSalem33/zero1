import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { styles, T } from "../../theme/mobileStyles";

export type PressMotionPreset = keyof typeof T.motion.press;

interface PressableScaleProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  motionPreset?: PressMotionPreset;
}

export function PressableScale({
  disabled,
  style,
  pressedStyle,
  motionPreset = "default",
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const pressProgress = useRef(new Animated.Value(0)).current;
  const preset = T.motion.press[motionPreset];

  const animateTo = useCallback(
    (toValue: number, duration: number) => {
      pressProgress.stopAnimation();
      Animated.timing(pressProgress, {
        toValue,
        duration,
        easing:
          toValue > 0 ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [pressProgress],
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (!disabled) {
        animateTo(1, preset.inMs);
      }
      onPressIn?.(event);
    },
    [animateTo, disabled, onPressIn, preset.inMs],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      animateTo(0, preset.outMs);
      onPressOut?.(event);
    },
    [animateTo, onPressOut, preset.outMs],
  );

  useEffect(() => {
    if (disabled) {
      pressProgress.stopAnimation();
      pressProgress.setValue(0);
    }
  }, [disabled, pressProgress]);

  const animatedStyle = useMemo(
    () => ({
      transform: [
        {
          scale: pressProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, preset.scale],
          }),
        },
      ],
      opacity: pressProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, preset.opacity],
      }),
    }),
    [pressProgress, preset.opacity, preset.scale],
  );

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityState={{
          ...(rest.accessibilityState ?? {}),
          disabled: Boolean(disabled),
        }}
        style={({ pressed }) => [
          style,
          pressed && !disabled ? pressedStyle : null,
          disabled ? styles.buttonDisabled : null,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
