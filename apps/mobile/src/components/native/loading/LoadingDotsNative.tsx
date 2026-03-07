import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { T } from "../../../theme/mobileStyles";

interface LoadingDotsNativeProps {
  label: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export function LoadingDotsNative({
  label,
  color = T.colors.accent,
  style,
  labelStyle,
}: LoadingDotsNativeProps) {
  const reduceMotion = useReducedMotion();
  const dotA = useRef(new Animated.Value(0.4)).current;
  const dotB = useRef(new Animated.Value(0.4)).current;
  const dotC = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const makeLoop = (value: Animated.Value, delayMs: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(value, {
            toValue: 1,
            duration: 460,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 460,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );

    const loopA = makeLoop(dotA, 0);
    const loopB = makeLoop(dotB, 160);
    const loopC = makeLoop(dotC, 320);
    loopA.start();
    loopB.start();
    loopC.start();

    return () => {
      loopA.stop();
      loopB.stop();
      loopC.stop();
      dotA.stopAnimation();
      dotB.stopAnimation();
      dotC.stopAnimation();
    };
  }, [dotA, dotB, dotC, reduceMotion]);

  const staticOpacity = reduceMotion ? 0.7 : undefined;

  return (
    <View style={[localStyles.row, style]}>
      <Animated.View
        style={[
          localStyles.dot,
          { backgroundColor: color, opacity: staticOpacity ?? dotA },
        ]}
      />
      <Animated.View
        style={[
          localStyles.dot,
          { backgroundColor: color, opacity: staticOpacity ?? dotB },
        ]}
      />
      <Animated.View
        style={[
          localStyles.dot,
          { backgroundColor: color, opacity: staticOpacity ?? dotC },
        ]}
      />
      <Text style={[localStyles.label, labelStyle]}>{label}</Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 4,
  },
  label: {
    marginLeft: 2,
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    fontWeight: "600",
  },
});
