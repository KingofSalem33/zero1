import React from "react";

export const MapSkeleton: React.FC = () => {
  const layers = [3, 5, 5, 3];
  const layerCount = layers.length;
  const layerX = layers.map((_, idx) =>
    layerCount === 1 ? 50 : 10 + (80 * idx) / (layerCount - 1),
  );

  const nodes = layers.flatMap((count, layerIndex) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `l${layerIndex}-n${i}`,
      layerIndex,
      x: layerX[layerIndex],
      y: ((i + 1) / (count + 1)) * 100,
    }));
  });

  const edges = layers.flatMap((count, layerIndex) => {
    if (layerIndex >= layerCount - 1) return [];
    const nextCount = layers[layerIndex + 1];
    return Array.from({ length: count }, (_, i) =>
      Array.from({ length: nextCount }, (_, j) => ({
        id: `e${layerIndex}-${i}-${j}`,
        from: `l${layerIndex}-n${i}`,
        to: `l${layerIndex + 1}-n${j}`,
      })),
    ).flat();
  });

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="h-full w-full bg-gray-50 p-8 relative overflow-hidden">
      {/* Header skeleton */}
      <div className="h-8 bg-gray-200 rounded-lg w-64 mb-6 animate-pulse" />

      {/* Graph skeleton - fully connected MLP */}
      <div className="relative h-[calc(100%-80px)]">
        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {edges.map((edge, i) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#d1d5db"
                strokeWidth={0.4}
                strokeLinecap="round"
                style={{
                  animation: `fadeInOut 2.2s ease-in-out infinite`,
                  animationDelay: `${(i % 12) * 120}ms`,
                }}
              />
            );
          })}

          {nodes.map((node, i) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={2.3}
              fill="#d1d5db"
              style={{
                animation: `pulse 1.6s ease-in-out infinite`,
                animationDelay: `${(i % 10) * 140}ms`,
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
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.95; }
        }
      `}</style>
    </div>
  );
};
