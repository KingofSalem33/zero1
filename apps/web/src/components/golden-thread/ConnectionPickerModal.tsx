import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ThreadNode } from "../../types/goldenThread";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export type ConnectionPickerGroup = {
  styleType: string;
  label: string;
  color: string;
  count: number;
  verses: ThreadNode[];
  verseIds: number[];
  edgeIds: string[];
};

interface ConnectionPickerModalProps {
  verse: ThreadNode;
  position: { x: number; y: number };
  totalCount: number;
  currentBranch?: ConnectionPickerGroup;
  otherGroups: ConnectionPickerGroup[];
  onViewGroup: (
    group: ConnectionPickerGroup,
    useBranchCluster: boolean,
  ) => void;
  onClose: () => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export function ConnectionPickerModal({
  verse,
  position,
  totalCount,
  currentBranch,
  otherGroups,
  onViewGroup,
  onClose,
}: ConnectionPickerModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Focus trap for accessibility (handles ESC key)
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true, {
    onEscape: onClose,
  });

  // Merge refs
  const setModalRefs = useCallback(
    (node: HTMLDivElement | null) => {
      (modalRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
      (focusTrapRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
    },
    [focusTrapRef],
  );

  useEffect(() => {
    if (!modalRef.current) return;

    const rect = modalRef.current.getBoundingClientRect();
    const padding = 16;
    const width = rect.width || 360;
    const height = rect.height || 300;

    const x = clamp(position.x, padding, window.innerWidth - width - padding);
    const y = clamp(position.y, padding, window.innerHeight - height - padding);

    setAdjustedPosition({ x, y });
  }, [position, currentBranch, otherGroups]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modalRef.current?.contains(target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const verseLabel = `${verse.book_name} ${verse.chapter}:${verse.verse}`;
  const verseText =
    verse.text.length > 120 ? `${verse.text.slice(0, 120)}...` : verse.text;

  const renderVerseList = (verses: ThreadNode[]) => {
    const maxList = 4;
    const visible = verses.slice(0, maxList);
    const remaining = verses.length - visible.length;

    return (
      <div className="mt-2 space-y-1 text-xs text-neutral-200">
        {visible.map((item) => (
          <div key={item.id}>
            {item.book_name} {item.chapter}:{item.verse}
          </div>
        ))}
        {remaining > 0 && (
          <div className="text-neutral-400">+ {remaining} more</div>
        )}
      </div>
    );
  };

  const modalContent = (
    <div
      ref={setModalRefs}
      className="fixed z-[80] transition-all duration-150 ease-out"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Connections for ${verseLabel}`}
    >
      <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-lg shadow-xl overflow-hidden w-[360px] max-w-sm">
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

        <div className="p-4 pr-9">
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            {verseLabel}
          </div>
          <div className="mt-1 text-sm text-neutral-200">{verseText}</div>

          <div className="mt-3 text-xs text-neutral-400">
            Connected to {totalCount} verse{totalCount === 1 ? "" : "s"}
          </div>

          {currentBranch && (
            <div className="mt-4 rounded-md border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-2 w-2 rounded-full"
                    style={{ backgroundColor: currentBranch.color }}
                  />
                  <span
                    className="text-xs font-semibold"
                    style={{ color: currentBranch.color }}
                  >
                    Current Branch ({currentBranch.label})
                  </span>
                </div>
                <span className="text-[10px] text-neutral-400">
                  {currentBranch.count} verse
                  {currentBranch.count === 1 ? "" : "s"}
                </span>
              </div>

              {renderVerseList(currentBranch.verses)}

              <button
                onClick={() => onViewGroup(currentBranch, true)}
                className="mt-3 text-xs font-semibold text-neutral-200 hover:text-white transition-colors"
              >
                View Synopsis
              </button>
            </div>
          )}

          {otherGroups.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Other Connections
              </div>
              <div className="mt-2 space-y-2">
                {otherGroups.map((group) => (
                  <div
                    key={group.styleType}
                    className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-2 w-2 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                      <div className="text-xs text-neutral-200">
                        {group.label}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-neutral-400">
                        {group.count} verse{group.count === 1 ? "" : "s"}
                      </span>
                      <button
                        onClick={() => onViewGroup(group, false)}
                        className="text-[10px] font-semibold text-neutral-300 hover:text-white transition-colors"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
