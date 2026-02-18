import React, { createContext, useContext, useState, useCallback } from "react";

export interface BibleBookmark {
  id: string;
  book: string;
  chapter: number;
  verse?: number;
  note?: string;
  createdAt: string;
}

const STORAGE_KEY = "bible-bookmarks";

function loadBookmarks(): BibleBookmark[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: BibleBookmark[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

interface BibleBookmarksContextValue {
  bookmarks: BibleBookmark[];
  addBookmark: (
    book: string,
    chapter: number,
    verse?: number,
    note?: string,
  ) => void;
  removeBookmark: (id: string) => void;
  isBookmarked: (book: string, chapter: number, verse?: number) => boolean;
  getBookmark: (
    book: string,
    chapter: number,
    verse?: number,
  ) => BibleBookmark | undefined;
}

const BibleBookmarksContext = createContext<BibleBookmarksContextValue | null>(
  null,
);

export function BibleBookmarksProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [bookmarks, setBookmarks] = useState<BibleBookmark[]>(loadBookmarks);

  const addBookmark = useCallback(
    (book: string, chapter: number, verse?: number, note?: string) => {
      setBookmarks((prev) => {
        // Don't add duplicate
        const exists = prev.some(
          (b) => b.book === book && b.chapter === chapter && b.verse === verse,
        );
        if (exists) return prev;
        const next = [
          {
            id: `${book}:${chapter}${verse ? `:${verse}` : ""}-${Date.now()}`,
            book,
            chapter,
            verse,
            note,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ];
        saveBookmarks(next);
        return next;
      });
    },
    [],
  );

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      saveBookmarks(next);
      return next;
    });
  }, []);

  const isBookmarked = useCallback(
    (book: string, chapter: number, verse?: number) =>
      bookmarks.some(
        (b) => b.book === book && b.chapter === chapter && b.verse === verse,
      ),
    [bookmarks],
  );

  const getBookmark = useCallback(
    (book: string, chapter: number, verse?: number) =>
      bookmarks.find(
        (b) => b.book === book && b.chapter === chapter && b.verse === verse,
      ),
    [bookmarks],
  );

  return (
    <BibleBookmarksContext.Provider
      value={{
        bookmarks,
        addBookmark,
        removeBookmark,
        isBookmarked,
        getBookmark,
      }}
    >
      {children}
    </BibleBookmarksContext.Provider>
  );
}

export function useBibleBookmarks() {
  const ctx = useContext(BibleBookmarksContext);
  if (!ctx)
    throw new Error(
      "useBibleBookmarks must be used within BibleBookmarksProvider",
    );
  return ctx;
}
