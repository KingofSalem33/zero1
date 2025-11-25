import React, { useState } from "react";
import { useUserPreferences } from "../hooks/useUserPreferences";

type VoiceOption = "onyx" | "nova";

export const VoiceSettings: React.FC = () => {
  const { preferences, updateVoice } = useUserPreferences();
  const [isOpen, setIsOpen] = useState(false);

  const voices: { value: VoiceOption; label: string; description: string }[] = [
    {
      value: "onyx",
      label: "Onyx (Default)",
      description: "Deep, authoritative voice - perfect for Scripture reading",
    },
    {
      value: "nova",
      label: "Nova",
      description: "Warm, clear voice - great for teaching and study",
    },
  ];

  return (
    <div className="relative">
      {/* Settings Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-md hover:bg-neutral-800/60 text-neutral-500 hover:text-neutral-300 transition-colors"
        title="Voice Settings"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.350 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Settings Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Settings Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-20 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              Voice Preferences
            </h3>

            <div className="space-y-2">
              {voices.map((voice) => (
                <button
                  key={voice.value}
                  onClick={() => {
                    updateVoice(voice.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    preferences.voice === voice.value
                      ? "border-brand-primary-500 bg-brand-primary-500/10"
                      : "border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-white">
                        {voice.label}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {voice.description}
                      </div>
                    </div>
                    {preferences.voice === voice.value && (
                      <svg
                        className="w-5 h-5 text-brand-primary-500 flex-shrink-0 ml-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-800">
              <p className="text-xs text-neutral-500">
                Voice powered by OpenAI Text-to-Speech
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
