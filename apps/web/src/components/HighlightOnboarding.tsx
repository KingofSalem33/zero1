import React, { useState, useEffect } from "react";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { HIGHLIGHT_COLORS } from "../contexts/BibleHighlightsContext";

/**
 * A one-time dismissible tooltip shown over the Bible reader on first visit,
 * explaining how to highlight verses. Auto-dismisses after 12s or on click.
 */
export function HighlightOnboarding() {
  const { preferences, markHighlightOnboardingComplete } = useUserPreferences();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (preferences.hasSeenHighlightOnboarding) return;

    // Delay appearance so it doesn't compete with initial load
    const showTimer = setTimeout(() => setVisible(true), 3000);

    // Auto-dismiss after 12s
    const hideTimer = setTimeout(() => dismiss(), 15000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [preferences.hasSeenHighlightOnboarding]);

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      markHighlightOnboardingComplete();
    }, 300);
  };

  if (preferences.hasSeenHighlightOnboarding || !visible) return null;

  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[9998] max-w-sm w-[90vw] transition-all duration-300 ease-out ${
        exiting ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
      }`}
      role="alert"
      aria-live="polite"
    >
      <div className="bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-5">
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
          aria-label="Dismiss hint"
        >
          <svg
            className="w-4 h-4"
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
        <div className="flex items-start gap-3">
          {/* Color dots illustration */}
          <div className="flex flex-col items-center gap-1 pt-1 flex-shrink-0">
            {HIGHLIGHT_COLORS.slice(0, 3).map((c) => (
              <div
                key={c.value}
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>

          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-white">
              Highlight verses
            </h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Select any text in the Bible to see a synopsis, trace connections,
              or highlight it with a color. Use{" "}
              <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px] text-neutral-300 font-mono">
                Ctrl+1
              </kbd>{" "}
              through{" "}
              <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px] text-neutral-300 font-mono">
                5
              </kbd>{" "}
              for quick keyboard highlighting.
            </p>
          </div>
        </div>

        {/* Progress bar (auto-dismiss timer) */}
        <div className="mt-3 h-0.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#D4AF37]/40 rounded-full"
            style={{
              animation: "highlight-onboarding-progress 12s linear 3s forwards",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes highlight-onboarding-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
