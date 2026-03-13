/**
 * TooltipArrow — the upward-pointing arrow connector for tooltips.
 */

import React from "react";

export const TooltipArrow: React.FC = () => (
  <div
    className="absolute left-1/2 transform -translate-x-1/2"
    style={{ top: "0", transform: "translate(-50%, -100%)" }}
  >
    {/* Arrow shadow */}
    <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1">
      <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-black/20 blur-sm" />
    </div>
    {/* Main arrow */}
    <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-white/[0.08]" />
    {/* Arrow border */}
    <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2">
      <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-b-[9px] border-b-white/10" />
    </div>
  </div>
);
