import React from "react";
import { Handle, Position } from "@xyflow/react";
import type { ThreadNode } from "../../types/goldenThread";

interface VerseNodeData {
  verse: ThreadNode;
  isHighlighted: boolean;
  isAnchor: boolean;
  collapsedChildCount: number;
  onExpand: () => void;
}

export const VerseNode: React.FC<{ data: VerseNodeData }> = ({ data }) => {
  const { verse, isHighlighted, isAnchor, collapsedChildCount, onExpand } =
    data;

  // Compact styling for at-a-glance tree view
  const baseClasses =
    "px-2 py-1 rounded border transition-all duration-300 cursor-pointer relative";

  const stateClasses = isAnchor
    ? "bg-yellow-400 border-yellow-600 text-black font-bold shadow-md"
    : isHighlighted
      ? "bg-yellow-100 border-yellow-500 text-black font-semibold shadow-sm"
      : "bg-gray-50 border-gray-300 text-gray-700";

  return (
    <>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className={`${baseClasses} ${stateClasses}`}>
        <div className="text-[11px] font-mono font-semibold whitespace-nowrap">
          {verse.book_abbrev.toUpperCase()} {verse.chapter}:{verse.verse}
        </div>
        {isHighlighted && (
          <div className="text-[9px] mt-0.5 max-w-[110px] truncate leading-tight">
            {verse.text}
          </div>
        )}
        {collapsedChildCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            className="absolute -bottom-2 -right-2 bg-blue-500 hover:bg-blue-600 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center border border-white shadow-sm transition-colors cursor-pointer"
            title={`Expand ${collapsedChildCount} hidden ${collapsedChildCount === 1 ? "reference" : "references"}`}
          >
            +{collapsedChildCount}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </>
  );
};
