import React, { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  duration?: number; // in milliseconds, 0 = permanent
  onClose?: () => void;
  type?: "info" | "success" | "warning" | "error";
}

export const Toast: React.FC<ToastProps> = ({
  message,
  duration = 4000,
  onClose,
  type = "info",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Entrance animation
  useEffect(() => {
    // Trigger entrance animation after mount
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 10);
    return () => clearTimeout(timer);
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    if (duration === 0) return; // Permanent toast

    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    // Wait for exit animation
    setTimeout(() => {
      onClose?.();
    }, 200);
  };

  const typeStyles = {
    info: {
      bg: "from-blue-600 to-purple-600",
      border: "border-blue-400/30",
      shadow: "shadow-blue-500/30",
    },
    success: {
      bg: "from-green-600 to-emerald-600",
      border: "border-green-400/30",
      shadow: "shadow-green-500/30",
    },
    warning: {
      bg: "from-amber-600 to-orange-600",
      border: "border-amber-400/30",
      shadow: "shadow-amber-500/30",
    },
    error: {
      bg: "from-red-600 to-rose-600",
      border: "border-red-400/30",
      shadow: "shadow-red-500/30",
    },
  };

  const style = typeStyles[type];

  return (
    <div
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-200 ${
        isVisible && !isExiting
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2"
      }`}
      role="alert"
      aria-live="polite"
    >
      <div
        className={`bg-gradient-to-r ${style.bg} text-white px-6 py-3.5 rounded-2xl shadow-2xl ${style.shadow} backdrop-blur-sm border ${style.border} max-w-md text-center font-medium flex items-center gap-3`}
      >
        <span className="flex-1">{message}</span>
        {duration === 0 && (
          <button
            onClick={handleClose}
            className="flex-shrink-0 w-5 h-5 rounded-full hover:bg-white/20 transition-colors flex items-center justify-center"
            aria-label="Close"
          >
            <svg
              className="w-3 h-3"
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
          </button>
        )}
      </div>
    </div>
  );
};

// Toast hook for programmatic usage
export const useToast = () => {
  const [toasts, setToasts] = useState<
    Array<{
      id: number;
      message: string;
      type: ToastProps["type"];
      duration?: number;
    }>
  >([]);

  const showToast = (
    message: string,
    type: ToastProps["type"] = "info",
    duration = 4000,
  ) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  };

  const hideToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const ToastContainer = () => (
    <>
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{
            position: "fixed",
            bottom: `${2 + index * 4.5}rem`,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
          }}
        >
          <Toast
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => hideToast(toast.id)}
          />
        </div>
      ))}
    </>
  );

  return { showToast, ToastContainer };
};
