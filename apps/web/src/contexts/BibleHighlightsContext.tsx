import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useToast } from "../components/Toast";
import { useHighlightsSync } from "../hooks/useHighlightsSync";
import type { HighlightsSyncState } from "../hooks/useHighlightsSync";

export interface BibleHighlight {
  id: string;
  book: string;
  chapter: number;
  verses: number[];
  text: string;
  color: string;
  note?: string;
  source?: "bible" | "chat";
  createdAt: string;
}

export const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "#FEF3C7", textColor: "#92400E" },
  { name: "Green", value: "#D1FAE5", textColor: "#065F46" },
  { name: "Blue", value: "#DBEAFE", textColor: "#1E40AF" },
  { name: "Pink", value: "#FCE7F3", textColor: "#9F1239" },
  { name: "Purple", value: "#EDE9FE", textColor: "#5B21B6" },
];

/** Format verses array into a display string like "3", "3-5", or "3-5, 8" */
export function formatVerseRange(verses: number[]): string {
  if (verses.length === 0) return "";
  if (verses.length === 1) return String(verses[0]);
  const sorted = [...verses].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? String(start) : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges.join(", ");
}

/** Migrate legacy highlights that used `verse: number` to `verses: number[]` */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateHighlights(data: any[]): BibleHighlight[] {
  return data.map((h) => {
    if (Array.isArray(h.verses)) return h as BibleHighlight;
    // Legacy: single `verse` field → wrap in array
    const { verse, ...rest } = h;
    return { ...rest, verses: [verse] } as BibleHighlight;
  });
}

interface BibleHighlightsContextType {
  highlights: BibleHighlight[];
  addHighlight: (
    book: string,
    chapter: number,
    verses: number[],
    text: string,
    color: string,
    source?: "bible" | "chat",
  ) => BibleHighlight;
  updateHighlight: (
    id: string,
    updates: Partial<Pick<BibleHighlight, "note" | "color">>,
  ) => void;
  removeHighlight: (id: string) => void;
  getHighlightForVerse: (
    book: string,
    chapter: number,
    verse: number,
  ) => BibleHighlight | undefined;
  getHighlightsForBook: (book: string) => BibleHighlight[];
  clearAllHighlights: () => void;
  syncState: HighlightsSyncState;
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
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage after mount (async, non-blocking)
  useEffect(() => {
    const loadHighlights = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setHighlights(migrateHighlights(parsed));
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

  // Cloud sync — merges with server when authenticated
  const syncState = useHighlightsSync(highlights, setHighlights, isLoaded);

  // Add a new highlight
  const addHighlight = useCallback(
    (
      book: string,
      chapter: number,
      verses: number[],
      text: string,
      color: string,
      source?: "bible" | "chat",
    ) => {
      const newHighlight: BibleHighlight = {
        id: crypto.randomUUID(),
        book,
        chapter,
        verses,
        text,
        color,
        source,
        createdAt: new Date().toISOString(),
      };

      setHighlights((prev) => {
        // Skip overlap detection for chat highlights (no verse overlap possible)
        if (source === "chat") return [...prev, newHighlight];

        // Remove any existing highlight that overlaps with these verses
        const newSet = new Set(verses);
        const filtered = prev.filter(
          (h) =>
            !(
              h.book === book &&
              h.chapter === chapter &&
              h.verses.some((v) => newSet.has(v))
            ),
        );
        return [...filtered, newHighlight];
      });

      toast(source === "chat" ? "Saved to highlights" : "Verse highlighted", {
        type: "success",
        duration: 1500,
      });

      return newHighlight;
    },
    [toast],
  );

  // Update a highlight's mutable fields (note, color)
  const updateHighlight = useCallback(
    (id: string, updates: Partial<Pick<BibleHighlight, "note" | "color">>) => {
      setHighlights((prev) =>
        prev.map((h) => (h.id === id ? { ...h, ...updates } : h)),
      );
    },
    [],
  );

  // Remove a highlight
  const removeHighlight = useCallback(
    (id: string) => {
      let removedHighlight: BibleHighlight | null = null;

      setHighlights((prev) => {
        removedHighlight = prev.find((h) => h.id === id) || null;
        return prev.filter((h) => h.id !== id);
      });

      // Show toast with undo — captured in closure, not shared ref
      toast("Highlight removed", {
        type: "default",
        duration: 3000,
        onUndo: () => {
          if (removedHighlight) {
            setHighlights((prev) => [...prev, removedHighlight!]);
          }
        },
      });
    },
    [toast],
  );

  // Get highlight for a specific verse (checks if verse is in any highlight's verses array)
  const getHighlightForVerse = useCallback(
    (book: string, chapter: number, verse: number) => {
      return highlights.find(
        (h) =>
          h.book === book && h.chapter === chapter && h.verses.includes(verse),
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
    updateHighlight,
    removeHighlight,
    getHighlightForVerse,
    getHighlightsForBook,
    clearAllHighlights,
    syncState,
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
