import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

export interface BibleHighlight {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  color: string;
  createdAt: string;
}

interface BibleHighlightsContextType {
  highlights: BibleHighlight[];
  addHighlight: (
    book: string,
    chapter: number,
    verse: number,
    text: string,
    color: string,
  ) => BibleHighlight;
  removeHighlight: (id: string) => void;
  getHighlightForVerse: (
    book: string,
    chapter: number,
    verse: number,
  ) => BibleHighlight | undefined;
  getHighlightsForBook: (book: string) => BibleHighlight[];
  clearAllHighlights: () => void;
}

const BibleHighlightsContext = createContext<
  BibleHighlightsContextType | undefined
>(undefined);

const STORAGE_KEY = "bible_highlights";

export function BibleHighlightsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
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
    // eslint-disable-next-line no-console
    console.log(
      "[BibleHighlightsContext] Saved highlights to localStorage:",
      highlights.length,
    );
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

      // eslint-disable-next-line no-console
      console.log("[BibleHighlightsContext] Added highlight:", newHighlight);

      return newHighlight;
    },
    [],
  );

  // Remove a highlight
  const removeHighlight = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    // eslint-disable-next-line no-console
    console.log("[BibleHighlightsContext] Removed highlight:", id);
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
    // eslint-disable-next-line no-console
    console.log("[BibleHighlightsContext] Cleared all highlights");
  }, []);

  const value = {
    highlights,
    addHighlight,
    removeHighlight,
    getHighlightForVerse,
    getHighlightsForBook,
    clearAllHighlights,
  };

  return (
    <BibleHighlightsContext.Provider value={value}>
      {children}
    </BibleHighlightsContext.Provider>
  );
}

export function useBibleHighlightsContext() {
  const context = useContext(BibleHighlightsContext);
  if (!context) {
    throw new Error(
      "useBibleHighlightsContext must be used within BibleHighlightsProvider",
    );
  }
  return context;
}
