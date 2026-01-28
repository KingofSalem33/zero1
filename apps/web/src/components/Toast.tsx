import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

/**
 * Subtle toast notification system.
 * Designed to feel inevitable - confirms actions without demanding attention.
 */

interface Toast {
  id: string;
  message: string;
  type?: "default" | "success" | "error";
  duration?: number;
  onUndo?: () => void;
}

interface ToastContextValue {
  toast: (message: string, options?: Omit<Toast, "id" | "message">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

/** Individual toast item */
function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 150);
  }, [toast.id, onDismiss]);

  const handleUndo = useCallback(() => {
    if (toast.onUndo) {
      toast.onUndo();
      handleDismiss();
    }
  }, [toast.onUndo, handleDismiss]);

  useEffect(() => {
    const duration = toast.duration ?? 2500;
    timerRef.current = setTimeout(handleDismiss, duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [toast.duration, handleDismiss]);

  // Pause timer on hover
  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  const handleMouseLeave = () => {
    const duration = toast.duration ?? 2500;
    timerRef.current = setTimeout(handleDismiss, duration);
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        flex items-center gap-2 px-4 py-2
        bg-neutral-900/95 backdrop-blur-sm
        border border-neutral-800/50
        rounded-lg shadow-lg
        text-sm text-neutral-300
        transition-all duration-150 ease-out
        ${isExiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}
      `}
      role="status"
      aria-live="polite"
    >
      {/* Subtle status indicator with animation */}
      {toast.type === "success" && (
        <svg
          className="w-4 h-4 text-green-500/70 flex-shrink-0 checkmark-animated"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      )}
      {toast.type === "error" && (
        <svg
          className="w-4 h-4 text-red-500/70 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      )}

      <span className="flex-1">{toast.message}</span>

      {toast.onUndo && (
        <button
          onClick={handleUndo}
          className="text-neutral-500 hover:text-neutral-300 text-xs font-medium transition-colors"
        >
          Undo
        </button>
      )}
    </div>
  );
}

/** Toast container - positioned at bottom center */
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

/** Toast provider - wrap your app with this */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(
    (message: string, options: Omit<Toast, "id" | "message"> = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newToast: Toast = {
        id,
        message,
        type: options.type ?? "default",
        duration: options.duration,
        onUndo: options.onUndo,
      };

      setToasts((prev) => [...prev, newToast]);
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
