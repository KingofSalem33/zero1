/**
 * LoadingDots — gold pulsing dots with a label, used in tooltip loading states.
 */

import React from "react";

interface LoadingDotsProps {
  label: string;
  color?: string;
}

export const LoadingDots: React.FC<LoadingDotsProps> = ({
  label,
  color = "#D4AF37",
}) => (
  <div className="flex items-center gap-2 py-1.5">
    <div
      className="w-1 h-1 rounded-full animate-pulse"
      style={{ backgroundColor: color }}
    />
    <div
      className="w-1 h-1 rounded-full animate-pulse [animation-delay:150ms]"
      style={{ backgroundColor: color }}
    />
    <div
      className="w-1 h-1 rounded-full animate-pulse [animation-delay:300ms]"
      style={{ backgroundColor: color }}
    />
    <span className="text-xs text-neutral-400 ml-1 font-medium">{label}</span>
  </div>
);
