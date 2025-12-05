import { useState, useCallback } from "react";

export const useGoldenThreadHighlighting = () => {
  const [highlightedRefs, setHighlightedRefs] = useState<string[]>([]);

  const parseReferences = useCallback((text: string): string[] => {
    // Matches: [Book Ch:v], [1 Book Ch:v], [2 Book Ch:v], [3 Book Ch:v]
    // Examples: [John 3:16], [1 Corinthians 13:4], [Genesis 1:1]
    const regex = /\[([123]?\s?[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(\d+):(\d+)\]/g;
    const matches: string[] = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      const [, book, chapter, verse] = match;
      matches.push(`${book} ${chapter}:${verse}`);
    }

    return matches;
  }, []);

  const addReferencesFromText = useCallback(
    (newText: string) => {
      const refs = parseReferences(newText);
      if (refs.length > 0) {
        setHighlightedRefs((prev) => [...new Set([...prev, ...refs])]);
      }
    },
    [parseReferences],
  );

  const resetHighlights = useCallback(() => {
    setHighlightedRefs([]);
  }, []);

  return {
    highlightedRefs,
    addReferencesFromText,
    resetHighlights,
  };
};
