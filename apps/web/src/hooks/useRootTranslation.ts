/**
 * useRootTranslation — manages ROOT translation state and API calls.
 * Shared between TextHighlightTooltip and VerseTooltip.
 */

import { useState, useCallback } from "react";
import { useAIRequest } from "./useAIRequest";
import type { RootWord } from "../types/tooltip";

interface RootTranslationResult {
  isLoading: boolean;
  language: string;
  words: RootWord[];
  lostContext: string;
  fallbackText: string;
  selectedWordIndex: number | null;
  setSelectedWordIndex: (index: number | null) => void;
  generate: (
    text: string,
    context: {
      book?: string;
      chapter?: number;
      verse?: number;
      verses?: number[];
    },
  ) => Promise<void>;
  reset: () => void;
}

export function useRootTranslation(): RootTranslationResult {
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState("");
  const [words, setWords] = useState<RootWord[]>([]);
  const [lostContext, setLostContext] = useState("");
  const [fallbackText, setFallbackText] = useState("");
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(
    null,
  );

  const { execute, abort } = useAIRequest();

  const reset = useCallback(() => {
    abort();
    setIsLoading(false);
    setLanguage("");
    setWords([]);
    setLostContext("");
    setFallbackText("");
    setSelectedWordIndex(null);
  }, [abort]);

  const generate = useCallback(
    async (
      text: string,
      context: {
        book?: string;
        chapter?: number;
        verse?: number;
        verses?: number[];
      },
    ) => {
      setIsLoading(true);
      setWords([]);
      setLostContext("");
      setFallbackText("");
      setSelectedWordIndex(null);

      await execute({
        endpoint: "/api/root-translation",
        body: {
          selectedText: text,
          maxWords: 140,
          book: context.book,
          chapter: context.chapter,
          verse: context.verse,
          verses: context.verses,
        },
        onSuccess: (data) => {
          const lang = (data.language as string) || "";
          const wordList = Array.isArray(data.words)
            ? (data.words as RootWord[])
            : [];
          const analysis =
            (data.lostContext as string) ||
            (data.translation as string) ||
            "Unable to generate translation.";

          setLanguage(lang);
          setWords(wordList);
          setLostContext(analysis);
          setFallbackText(analysis);
          setIsLoading(false);
        },
        onError: (message) => {
          setFallbackText(`Root translation unavailable: ${message}`);
          setIsLoading(false);
        },
      });
    },
    [execute],
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
