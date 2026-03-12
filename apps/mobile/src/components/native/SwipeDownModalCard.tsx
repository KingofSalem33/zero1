import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { T } from "../../theme/mobileStyles";

const CLOSE_TRANSLATE_Y = 180;
const CLOSE_THRESHOLD = 56;

export function SwipeDownModalCard({
  visible,
  onClose,
  style,
  animatedStyle,
  children,
  showHandle = true,
}: {
  visible: boolean;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  animatedStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  showHandle?: boolean;
}) {
  const gestureTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      gestureTranslateY.setValue(0);
    }
  }, [gestureTranslateY, visible]);

  const clampedTranslateY = useMemo(
    () =>
      gestureTranslateY.interpolate({
        inputRange: [-1, 0, CLOSE_TRANSLATE_Y],
        outputRange: [0, 0, CLOSE_TRANSLATE_Y],
        extrapolate: "clamp",
      }),
    [gestureTranslateY],
  );

  const closeWithAnimation = useMemo(
    () => () => {
      Animated.timing(gestureTranslateY, {
        toValue: CLOSE_TRANSLATE_Y,
        duration: 160,
        useNativeDriver: true,
      }).start(({ finished }) => {
        gestureTranslateY.setValue(0);
        if (finished) {
          onClose();
        }
      });
    },
    [gestureTranslateY, onClose],
  );

  const handleGestureEvent = useMemo(
    () =>
      Animated.event<PanGestureHandlerGestureEvent["nativeEvent"]>(
        [{ nativeEvent: { translationY: gestureTranslateY } }],
        { useNativeDriver: true },
      ),
    [gestureTranslateY],
  );

  function restorePosition() {
    Animated.spring(gestureTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 110,
      friction: 14,
    }).start();
  }

  function handleStateChange(event: PanGestureHandlerStateChangeEvent) {
    const { state, oldState, translationY, velocityY } = event.nativeEvent;
    if (
      state === State.CANCELLED ||
      state === State.FAILED ||
      oldState === State.ACTIVE
    ) {
      if (
        translationY >= CLOSE_THRESHOLD ||
        (translationY > 20 && velocityY > 650)
      ) {
        closeWithAnimation();
        return;
      }
      restorePosition();
      return;
    }

    if (
      state === State.END &&
      (translationY >= CLOSE_THRESHOLD ||
        (translationY > 20 && velocityY > 650))
    ) {
      closeWithAnimation();
    }
  }

  return (
    <Animated.View style={animatedStyle}>
      <Animated.View
        style={[
          style,
          {
            transform: [{ translateY: clampedTranslateY }],
          },
        ]}
      >
        <PanGestureHandler
          activeOffsetY={8}
          failOffsetX={[-16, 16]}
          onGestureEvent={handleGestureEvent}
          onHandlerStateChange={handleStateChange}
        >
          <Animated.View
            style={showHandle ? local.dragHandleArea : local.dragAreaCompact}
          >
            {showHandle ? <View style={local.handle} /> : null}
          </Animated.View>
        </PanGestureHandler>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const local = StyleSheet.create({
  dragHandleArea: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    paddingTop: T.spacing.xs,
    paddingBottom: T.spacing.sm,
  },
  dragAreaCompact: {
    minHeight: 14,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: T.colors.border,
    opacity: 0.9,
  },
});
