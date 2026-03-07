import { AccessibilityInfo } from "react-native";
import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!active) return;
      setReduceMotionEnabled(Boolean(enabled));
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        setReduceMotionEnabled(Boolean(enabled));
      },
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotionEnabled;
}
