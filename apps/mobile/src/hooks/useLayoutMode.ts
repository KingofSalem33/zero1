import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

export type LayoutMode = "compact" | "expanded";

const EXPANDED_LAYOUT_MIN_WIDTH = 768;

export function useLayoutMode(): LayoutMode {
  const window = useWindowDimensions();
  return useMemo<LayoutMode>(
    () => (window.width >= EXPANDED_LAYOUT_MIN_WIDTH ? "expanded" : "compact"),
    [window.width],
  );
}
