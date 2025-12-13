import { useState, useEffect, useCallback } from "react";

export interface BibleHighlight {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  color: string;
  createdAt: string;
}

const STORAGE_KEY = "bible_highlights";

export function useBibleHighlights() {
  const [highlights, setHighlights] = useState<BibleHighlight[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Save to localStorage whenever highlights change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(highlights));
  }, [highlights]);

  // Add a new highlight
  const addHighlight = useCallback(
    (
      book: string,
      chapter: number,
      verse: number,
      text: string,
      color: string,
    ) => {
      const newHighlight: BibleHighlight = {
        id: `${book}-${chapter}-${verse}-${Date.now()}`,
        book,
        chapter,
        verse,
        text,
        color,
        createdAt: new Date().toISOString(),
      };

      setHighlights((prev) => {
        // Remove any existing highlight for this verse
        const filtered = prev.filter(
          (h) =>
            !(h.book === book && h.chapter === chapter && h.verse === verse),
        );
        return [...filtered, newHighlight];
      });

      return newHighlight;
    },
    [],
  );

  // Remove a highlight
  const removeHighlight = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // Get highlight for a specific verse
  const getHighlightForVerse = useCallback(
    (book: string, chapter: number, verse: number) => {
      return highlights.find(
        (h) => h.book === book && h.chapter === chapter && h.verse === verse,
      );
    },
    [highlights],
  );

  // Get all highlights for a book
  const getHighlightsForBook = useCallback(
    (book: string) => {
      return highlights.filter((h) => h.book === book);
    },
    [highlights],
  );

  // Clear all highlights
  const clearAllHighlights = useCallback(() => {
    setHighlights([]);
  }, []);

  return {
    highlights,
    addHighlight,
    removeHighlight,
    getHighlightForVerse,
    getHighlightsForBook,
    clearAllHighlights,
  };
}
