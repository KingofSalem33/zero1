import { useState } from "react";
import {
  EDGE_STYLES,
  resolveConnectionFamily,
} from "./golden-thread/narrativeMapConfig";
import type { ChainData, ChainStep } from "../types/goldenThread";

function connectionLabel(step: ChainStep): string {
  return step.connectionType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (ch) => ch.toUpperCase());
}

export function ChainOfThought({ chainData }: { chainData: ChainData }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60 transition-colors"
      >
        {isOpen
          ? "Hide path"
          : `See the path - ${chainData.steps.length} links`}
      </button>

      {isOpen ? (
        <div className="mt-2 rounded-xl border border-white/10 bg-neutral-900/60 p-3 backdrop-blur-xl">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">
            {chainData.theme}
          </div>
          <div className="space-y-2">
            {chainData.steps.map((step, index) => {
              const family = resolveConnectionFamily(step.connectionType);
              const style = EDGE_STYLES[family];
              return (
                <div
                  key={`${step.fromReference}-${step.toReference}-${index}`}
                  className="rounded-lg border border-white/5 bg-neutral-900/40 p-2.5"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-[#D4AF37]">
                      {step.fromReference}
                    </span>
                    <span className="text-neutral-500">-&gt;</span>
                    <span className="font-semibold text-[#D4AF37]">
                      {step.toReference}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${style.color}22`,
                      color: style.color,
                    }}
                  >
                    {connectionLabel(step)}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">
                    {step.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
