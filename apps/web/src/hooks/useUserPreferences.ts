import { useState, useEffect, useRef } from "react";

export type VoiceOption = "onyx" | "nova";

export interface UserPreferences {
  voice: VoiceOption;
  ttsEnabled: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  voice: "onyx", // Default to Onyx (deep, authoritative voice for Bible teaching)
  ttsEnabled: true,
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.error("Failed to save user preferences:", error);
    }
  }, [preferences]);

  const updateVoice = (voice: VoiceOption) => {
    setPreferences((prev) => ({ ...prev, voice }));
  };

  const toggleTTS = () => {
    setPreferences((prev) => ({ ...prev, ttsEnabled: !prev.ttsEnabled }));
  };

  return {
    preferences,
    updateVoice,
    toggleTTS,
    setPreferences,
  };
}
