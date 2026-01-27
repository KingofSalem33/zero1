import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useToast } from "../components/Toast";

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
  const { toast } = useToast();
  // Initialize empty, load async to not block hydration
  const [highlights, setHighlights] = useState<BibleHighlight[]>([]);
  // Ref to track removed highlights for undo
  const lastRemovedRef = useRef<BibleHighlight | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage after mount (async, non-blocking)
  useEffect(() => {
    const loadHighlights = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setHighlights(parsed);
        }
      } catch (error) {
        console.error(
          "[BibleHighlightsContext] Failed to load highlights:",
          error,
        );
      } finally {
        setIsLoaded(true);
      }
    };

    // Load in next tick to not block hydration
    if (typeof requestIdleCallback !== "undefined") {
      // eslint-disable-next-line no-undef
      requestIdleCallback(loadHighlights);
    } else {
      setTimeout(loadHighlights, 0);
    }
  }, []);

  // Save to localStorage whenever highlights change (but only after initial load)
  useEffect(() => {
    if (!isLoaded) return; // Don't save during initial load
    localStorage.setItem(STORAGE_KEY, JSON.stringify(highlights));
  }, [highlights, isLoaded]);

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

      // Subtle confirmation
      toast("Verse highlighted", { type: "success", duration: 1500 });

      return newHighlight;
    },
    [toast],
  );

  // Remove a highlight
  const removeHighlight = useCallback(
    (id: string) => {
      // Find the highlight before removing for undo
      setHighlights((prev) => {
        const toRemove = prev.find((h) => h.id === id);
        if (toRemove) {
          lastRemovedRef.current = toRemove;
        }
        return prev.filter((h) => h.id !== id);
      });

      // Show toast with undo option
      toast("Highlight removed", {
        type: "default",
        duration: 3000,
        onUndo: () => {
          if (lastRemovedRef.current) {
            setHighlights((prev) => [...prev, lastRemovedRef.current!]);
            lastRemovedRef.current = null;
          }
        },
      });
    },
    [toast],
  );

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
    const previousHighlights = [...highlights];
    setHighlights([]);

    toast("All highlights cleared", {
      type: "default",
      duration: 4000,
      onUndo: () => {
        setHighlights(previousHighlights);
      },
    });
  }, [highlights, toast]);

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
