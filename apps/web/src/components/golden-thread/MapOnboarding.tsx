import React from "react";

interface MapOnboardingProps {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

export const MapOnboarding: React.FC<MapOnboardingProps> = ({
  step,
  onNext,
  onSkip,
}) => (
  <div className="absolute inset-0 z-50 pointer-events-none">
    {/* Scrim */}
    <div
      className="absolute inset-0 bg-black/40 pointer-events-auto"
      onClick={onSkip}
    />
    {/* Tooltip card */}
    <div
      className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl p-5"
      style={{ animation: "fade-in 300ms ease-out" }}
    >
      {/* Step indicator */}
      <div className="flex items-center gap-1.5 mb-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 rounded-full transition-all duration-200"
            style={{
              width: i === step ? "16px" : "6px",
              backgroundColor:
                i === step
                  ? "#D4AF37"
                  : i < step
                    ? "rgba(212,175,55,0.4)"
                    : "rgba(255,255,255,0.15)",
            }}
          />
        ))}
      </div>

      {/* Step content */}
      {step === 0 && (
        <>
          <div className="text-[13px] font-serif font-semibold text-white/90 mb-1.5">
            The anchor verse
          </div>
          <div className="text-[11px] text-white/60 leading-relaxed">
            The large node at the center is your anchor — the verse your
            conversation is rooted in. Everything else flows from it.
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <div className="text-[13px] font-serif font-semibold text-white/90 mb-1.5">
            Connected Scripture
          </div>
          <div className="text-[11px] text-white/60 leading-relaxed">
            Lines trace real cross-references and shared themes between
            passages. Gold lines connect to the anchor. White lines link related
            verses.
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <div className="text-[13px] font-serif font-semibold text-white/90 mb-1.5">
            Explore deeper
          </div>
          <div className="text-[11px] text-white/60 leading-relaxed">
            Click any verse to see its connections. Use the{" "}
            <span className="text-[#D4AF37]">Discover</span> button to let AI
            find hidden links across Scripture.
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          onClick={onSkip}
          className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={onNext}
          className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#D4AF37] border border-[#D4AF37]/20 hover:border-[#D4AF37]/40 transition-all duration-150"
        >
          {step < 2 ? "Next" : "Got it"}
        </button>
      </div>
    </div>
  </div>
);
