import React from "react";

export const MapSkeleton: React.FC = () => {
  return (
    <div className="h-full w-full bg-gray-50 p-8 relative overflow-hidden">
      {/* Header skeleton */}
      <div className="h-8 bg-gray-200 rounded-lg w-64 mb-6 animate-pulse" />

      {/* Graph skeleton - simulated nodes */}
      <div className="relative h-[calc(100%-80px)]">
        {/* Simulated node positions */}
        {[
          { left: 50, top: 50 },
          { left: 200, top: 80 },
          { left: 350, top: 50 },
          { left: 120, top: 180 },
          { left: 280, top: 200 },
          { left: 160, top: 320 },
          { left: 320, top: 340 },
        ].map((pos, i) => (
          <div
            key={i}
            className="absolute bg-gray-300 rounded-lg"
            style={{
              width: 120,
              height: 50,
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              animation: `pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}

        {/* Simulated edges */}
        <svg className="absolute inset-0 pointer-events-none">
          {[
            { x1: 110, y1: 75, x2: 200, y2: 105 },
            { x1: 260, y1: 105, x2: 350, y2: 75 },
            { x1: 180, y1: 180, x2: 280, y2: 200 },
            { x1: 180, y1: 205, x2: 220, y2: 320 },
            { x1: 340, y1: 225, x2: 380, y2: 340 },
          ].map((edge, i) => (
            <line
              key={i}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke="#d1d5db"
              strokeWidth={2}
              strokeLinecap="round"
              style={{
                animation: `fadeInOut 2s ease-in-out infinite`,
                animationDelay: `${i * 300}ms`,
              }}
            />
          ))}
        </svg>

        {/* Pulsing overlay to indicate loading */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white rounded-lg shadow-md px-3 py-2">
            <div className="flex gap-1">
              <div
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
            <span className="text-sm text-gray-600 font-medium">
              Loading map...
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInOut {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};
