/**
 * TooltipShell — glassmorphic tooltip container with close button and arrow.
 * Shared wrapper for both text-highlight and verse tooltips.
 */

import React from "react";
import { TooltipArrow } from "./TooltipArrow";

interface TooltipShellProps {
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}

export const TooltipShell: React.FC<TooltipShellProps> = ({
  onClose,
  children,
  maxWidthClassName = "max-w-sm",
}) => (
  <>
    {/* Glassmorphic card */}
    <div
      className={`relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden ${maxWidthClassName}`}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all duration-150 z-10"
        aria-label="Close"
      >
        <svg
          className="w-3.5 h-3.5"
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

      {/* Content */}
      <div className="p-3 pr-8">{children}</div>
    </div>

    <TooltipArrow />
  </>
);
