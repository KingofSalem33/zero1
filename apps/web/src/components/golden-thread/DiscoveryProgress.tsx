import React from "react";

interface DiscoveryProgressProps {
  phase: "selecting" | "analyzing" | "connecting" | "complete";
  progress: number; // 0-100
  message: string;
}

export const DiscoveryProgress: React.FC<DiscoveryProgressProps> = ({
  phase,
  progress,
  message,
}) => {
  const getPhaseColor = () => {
    switch (phase) {
      case "selecting":
        return "bg-blue-500";
      case "analyzing":
        return "bg-purple-500";
      case "connecting":
        return "bg-cyan-500";
      case "complete":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const getPhaseIcon = () => {
    switch (phase) {
      case "selecting":
        return "🔍";
      case "analyzing":
        return "🧠";
      case "connecting":
        return "🔗";
      case "complete":
        return "✨";
      default:
        return "⏳";
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden min-w-[320px]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="text-lg" style={{ filter: "grayscale(100%)" }}>
              {getPhaseIcon()}
            </div>
            <span className="text-white font-semibold text-sm">
              Discovering Connections
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-4 pt-3 pb-4">
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`absolute top-0 left-0 h-full ${getPhaseColor()} transition-all duration-500 ease-out`}
              style={{ width: `${progress}%` }}
            >
              {/* Shimmer effect */}
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30"
                style={{
                  animation: "shimmer 1.5s infinite",
                }}
              />
            </div>
          </div>

          {/* Message */}
          <div className="mt-2.5 text-xs text-gray-600 font-medium flex items-center justify-between">
            <span>{message}</span>
            <span className="text-gray-400">{Math.round(progress)}%</span>
          </div>

          {/* Phase indicators */}
          <div className="flex gap-1.5 mt-3">
            {["selecting", "analyzing", "connecting", "complete"].map(
              (p, _idx) => {
                const isActive = phase === p;
                const isPast =
                  ["selecting", "analyzing", "connecting", "complete"].indexOf(
                    phase,
                  ) >
                  ["selecting", "analyzing", "connecting", "complete"].indexOf(
                    p,
                  );

                return (
                  <div
                    key={p}
                    className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                      isActive
                        ? getPhaseColor()
                        : isPast
                          ? "bg-green-400"
                          : "bg-gray-200"
                    }`}
                  />
                );
              },
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
};
