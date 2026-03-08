import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "../../../hooks/useReducedMotion";

interface SkeletonBlockProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}

export function SkeletonBlock({
  width = "100%",
  height = 12,
  radius = 6,
  style,
  animated = true,
}: SkeletonBlockProps) {
  const reduceMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!animated || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.stopAnimation();
    };
  }, [animated, pulse, reduceMotion]);

  return (
    <Animated.View
      style={[
        localStyles.base,
        {
          width,
          height,
          borderRadius: radius,
          opacity: animated && !reduceMotion ? pulse : 0.78,
        },
        style,
      ]}
    />
  );
}

export function SkeletonLine({
  width = "100%",
  style,
}: {
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}) {
  return <SkeletonBlock width={width} height={11} radius={5} style={style} />;
}

export function SkeletonCircle({
  size = 24,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SkeletonBlock width={size} height={size} radius={size / 2} style={style} />
  );
}

export function SkeletonTextLines({
  lines = ["100%", "92%", "78%"],
  gap = 8,
}: {
  lines?: DimensionValue[];
  gap?: number;
}) {
  return (
    <View style={{ gap }}>
      {lines.map((width, index) => (
        <SkeletonLine
          key={`skeleton-line-${String(width)}-${index}`}
          width={width}
        />
      ))}
    </View>
  );
}

const localStyles = StyleSheet.create({
  base: {
    backgroundColor: "rgba(63, 63, 70, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
});
