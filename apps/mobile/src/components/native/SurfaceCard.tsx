import type { ReactNode } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { styles } from "../../theme/mobileStyles";

interface SurfaceCardProps extends ViewProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SurfaceCard({ children, style, ...rest }: SurfaceCardProps) {
  return (
    <View {...rest} style={[styles.panel, style]}>
      {children}
    </View>
  );
}
