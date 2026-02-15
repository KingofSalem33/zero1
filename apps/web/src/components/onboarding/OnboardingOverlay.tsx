import React, { useState, useEffect, useCallback, useRef } from "react";
import { useUserPreferences } from "../../hooks/useUserPreferences";

interface OnboardingStep {
  targetSelector: string;
  title: string;
  description: string;
  position: "top" | "bottom";
}

const STEPS: OnboardingStep[] = [
  {
    targetSelector: '[data-verse="1"]',
    title: "Discover Meaning",
    description:
      "Select any text to get an instant AI-powered explanation with cross-references and deeper context.",
    position: "bottom",
  },
  {
    targetSelector: "[data-verse-number]",
    title: "Explore Connections",
    description:
      "Tap any verse number to see cross-references and related passages across all of Scripture.",
    position: "bottom",
  },
  {
    targetSelector: '[data-onboarding="footer"]',
    title: "Go Deeper",
    description:
      "Use these exploration cards to discover prophecies, word studies, thematic threads, and more.",
    position: "top",
  },
];

function getTooltipStyle(
  rect: globalThis.DOMRect,
  position: "top" | "bottom",
): React.CSSProperties {
  const spacing = 20;
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.max(
      16,
      Math.min(rect.left + rect.width / 2, window.innerWidth - 16),
    ),
    transform: "translateX(-50%)",
    maxWidth: Math.min(360, window.innerWidth - 32),
  };
  if (position === "bottom") {
    style.top = Math.min(rect.bottom + spacing, window.innerHeight - 240);
  } else {
    style.bottom = Math.max(spacing, window.innerHeight - rect.top + spacing);
  }
  return style;
}

export default function OnboardingOverlay() {
  const { preferences, markOnboardingComplete } = useUserPreferences();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<globalThis.DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Wait for Bible content to load before showing
  useEffect(() => {
    if (preferences.hasSeenOnboarding) return;

    const checkReady = () => {
      const firstVerse = document.querySelector('[data-verse="1"]');
      if (firstVerse) {
        setIsReady(true);
        return true;
      }
      return false;
    };

    // Poll for verse elements (content loads async)
    if (checkReady()) return;
    const interval = setInterval(() => {
      if (checkReady()) clearInterval(interval);
    }, 500);

    // Give up after 10 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      // If content never loaded, skip onboarding
      if (!document.querySelector('[data-verse="1"]')) {
        markOnboardingComplete();
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [preferences.hasSeenOnboarding, markOnboardingComplete]);

  // Measure and highlight target element
  const measureTarget = useCallback(() => {
    const step = STEPS[currentStep];
    if (!step) return;

    const element = document.querySelector(step.targetSelector) as HTMLElement;
    if (!element) return;

    // Scroll target into view if needed
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    // Measure after scroll settles
    setTimeout(() => {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
      setIsVisible(true);
    }, 400);
  }, [currentStep]);

  useEffect(() => {
    if (!isReady || preferences.hasSeenOnboarding) return;
    // Short delay for initial render to settle
    const timer = setTimeout(measureTarget, 600);
    return () => clearTimeout(timer);
  }, [isReady, currentStep, preferences.hasSeenOnboarding, measureTarget]);

  // Keyboard: Escape to skip, Enter/Space to advance
  useEffect(() => {
    if (!isVisible) return;
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        markOnboardingComplete();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isVisible, currentStep]);

  const handleNext = () => {
    setIsVisible(false);
    if (currentStep >= STEPS.length - 1) {
      markOnboardingComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    setIsVisible(false);
    markOnboardingComplete();
  };

  // Don't render if already completed or not ready
  if (preferences.hasSeenOnboarding || !isReady || !targetRect) return null;

  const step = STEPS[currentStep];
  const padding = 8;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={`Onboarding step ${currentStep + 1} of ${STEPS.length}`}
    >
      {/* Dark overlay with SVG cutout */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <mask id="onboarding-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={targetRect.x - padding}
              y={targetRect.y - padding}
              width={targetRect.width + padding * 2}
              height={targetRect.height + padding * 2}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.7)"
          mask="url(#onboarding-mask)"
        />
      </svg>

      {/* Clickable backdrop to advance (outside the spotlight) */}
      <div className="absolute inset-0" onClick={handleNext} />

      {/* Gold spotlight border */}
      <div
        className="absolute rounded-lg border-2 border-[#D4AF37] pointer-events-none transition-all duration-500 ease-out"
        style={{
          left: targetRect.x - padding,
          top: targetRect.y - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
          boxShadow:
            "0 0 24px rgba(212, 175, 55, 0.25), 0 0 48px rgba(212, 175, 55, 0.1)",
        }}
      />

      {/* Tooltip card */}
      <div
        className={`fixed z-[80] transition-all duration-300 ease-out ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
        style={getTooltipStyle(targetRect, step.position)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-base font-semibold text-white">{step.title}</h3>
            <button
              onClick={handleSkip}
              className="text-neutral-500 hover:text-neutral-300 transition-colors text-xs ml-4 flex-shrink-0"
            >
              Skip
            </button>
          </div>

          <p className="text-neutral-300 text-sm leading-relaxed mb-5">
            {step.description}
          </p>

          {/* Step indicators + Next button */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? "bg-[#D4AF37] w-5"
                      : i < currentStep
                        ? "bg-[#D4AF37]/40 w-1.5"
                        : "bg-neutral-600 w-1.5"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm rounded-lg font-medium transition-all duration-150 active:scale-[0.98]"
            >
              {currentStep === STEPS.length - 1 ? "Got it!" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
