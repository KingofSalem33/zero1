import { useState, useEffect, useRef } from "react";

export type VoiceOption = "onyx" | "nova";

export interface UserPreferences {
  voice: VoiceOption;
  ttsEnabled: boolean;
  hasSeenOnboarding: boolean;
  hasSeenMapOnboarding: boolean;
  hasSeenHighlightOnboarding: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  voice: "onyx", // Default to Onyx (deep, authoritative voice for Bible teaching)
  ttsEnabled: true,
  hasSeenOnboarding: false,
  hasSeenMapOnboarding: false,
  hasSeenHighlightOnboarding: false,
};

const STORAGE_KEY = "bible-app-user-preferences";

/**
 * Hook for managing user preferences
 * Stores preferences in localStorage
 */
export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    // Load from localStorage on init
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error("Failed to load user preferences:", error);
    }
    return DEFAULT_PREFERENCES;
  });

  const isFirstRender = useRef(true);

  // Save to localStorage whenever preferences change (but not on initial load)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error("Failed to save user preferences:", error);
    }
  }, [preferences]);

  const updateVoice = (voice: VoiceOption) => {
    setPreferences((prev) => ({ ...prev, voice }));
  };

  const toggleTTS = () => {
    setPreferences((prev) => ({ ...prev, ttsEnabled: !prev.ttsEnabled }));
  };

  const markOnboardingComplete = () => {
    setPreferences((prev) => ({ ...prev, hasSeenOnboarding: true }));
  };

  const markMapOnboardingComplete = () => {
    setPreferences((prev) => ({ ...prev, hasSeenMapOnboarding: true }));
  };

  const markHighlightOnboardingComplete = () => {
    setPreferences((prev) => ({ ...prev, hasSeenHighlightOnboarding: true }));
  };

  return {
    preferences,
    updateVoice,
    toggleTTS,
    markOnboardingComplete,
    markMapOnboardingComplete,
    markHighlightOnboardingComplete,
    setPreferences,
  };
}
