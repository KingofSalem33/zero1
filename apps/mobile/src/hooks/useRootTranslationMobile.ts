import { useCallback, useRef, useState } from "react";
import { fetchRootTranslation, type RootTranslationWord } from "../lib/api";
import { ensureMinLoaderDuration } from "../utils/ensureMinLoaderDuration";

interface RootContext {
  book?: string;
  chapter?: number;
  verse?: number;
  verses?: number[];
}

interface UseRootTranslationMobileOptions {
  apiBaseUrl: string;
  accessToken?: string;
}

export interface RootTranslationMobileState {
  isLoading: boolean;
  language: string;
  words: RootTranslationWord[];
  lostContext: string;
  fallbackText: string;
  selectedWordIndex: number | null;
  setSelectedWordIndex: (index: number | null) => void;
  generate: (selectedText: string, context?: RootContext) => Promise<void>;
  reset: () => void;
}

export function useRootTranslationMobile({
  apiBaseUrl,
  accessToken,
}: UseRootTranslationMobileOptions): RootTranslationMobileState {
  const MIN_ROOT_LOADING_MS = 240;
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState("");
  const [words, setWords] = useState<RootTranslationWord[]>([]);
  const [lostContext, setLostContext] = useState("");
  const [fallbackText, setFallbackText] = useState("");
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(
    null,
  );
  const requestIdRef = useRef(0);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setIsLoading(false);
    setLanguage("");
    setWords([]);
    setLostContext("");
    setFallbackText("");
    setSelectedWordIndex(null);
  }, []);

  const generate = useCallback(
    async (selectedText: string, context?: RootContext) => {
      const trimmedText = selectedText.trim();
      if (!trimmedText) return;
      const loadStartedAt = Date.now();

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setIsLoading(true);
      setLanguage("");
      setWords([]);
      setLostContext("");
      setFallbackText("");
      setSelectedWordIndex(null);

      try {
        const result = await fetchRootTranslation({
          apiBaseUrl,
          accessToken,
          selectedText: trimmedText,
          maxWords: 140,
          book: context?.book,
          chapter: context?.chapter,
          verse: context?.verse,
          verses: context?.verses,
        });

        if (requestIdRef.current !== requestId) return;

        const languageValue =
          typeof result.language === "string" ? result.language : "";
        const wordsValue = Array.isArray(result.words) ? result.words : [];
        const lostContextValue =
          typeof result.lostContext === "string" ? result.lostContext : "";
        const fallbackValue =
          lostContextValue.length > 0
            ? lostContextValue
            : "Unable to generate root translation.";

        setLanguage(languageValue);
        setWords(wordsValue);
        setLostContext(lostContextValue);
        setFallbackText(fallbackValue);
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        const message =
          error instanceof Error ? error.message : "Unknown error.";
        setFallbackText(`Root translation unavailable: ${message}`);
      } finally {
        if (requestIdRef.current === requestId) {
          await ensureMinLoaderDuration(loadStartedAt, MIN_ROOT_LOADING_MS);
        }
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [accessToken, apiBaseUrl],
  );

  return {
    isLoading,
    language,
    words,
    lostContext,
    fallbackText,
    selectedWordIndex,
    setSelectedWordIndex,
    generate,
    reset,
  };
}
