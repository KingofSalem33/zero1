import { Text, View } from "react-native";
import { useToast } from "../../context/ToastContext";
import { styles } from "../../theme/mobileStyles";
import { PressableScale } from "./PressableScale";

export function ToastViewport() {
  const { toasts, dismissToast } = useToast();
  if (toasts.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.toastViewport}>
      {toasts.map((toast) => (
        <PressableScale
          key={toast.id}
          onPress={() => dismissToast(toast.id)}
          style={[
            styles.toastCard,
            toast.tone === "success"
              ? styles.toastCardSuccess
              : toast.tone === "error"
                ? styles.toastCardError
                : styles.toastCardInfo,
          ]}
        >
          <Text style={styles.toastText}>{toast.title}</Text>
        </PressableScale>
      ))}
    </View>
  );
}
