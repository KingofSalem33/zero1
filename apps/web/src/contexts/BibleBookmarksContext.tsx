import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createProtectedApiClient,
  type Bookmark as ApiBookmark,
} from "@zero1/shared-client";
import { WEB_ENV } from "../lib/env";
import { useAuth } from "./AuthContext";

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
    return stored ? (JSON.parse(stored) as BibleBookmark[]) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: BibleBookmark[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

function formatBookmarkReference(
  book: string,
  chapter: number,
  verse?: number,
): string {
  return `${book} ${chapter}${verse ? `:${verse}` : ""}`;
}

function parseBookmarkReference(reference: string): {
  book: string;
  chapter: number;
  verse?: number;
} {
  const match = reference.trim().match(/^(.*)\s+(\d+)(?::(\d+))?$/);
  if (!match) {
    return {
      book: reference.trim(),
      chapter: 1,
    };
  }

  return {
    book: match[1].trim(),
    chapter: Number(match[2]),
    ...(match[3] ? { verse: Number(match[3]) } : {}),
  };
}

function mapApiBookmarkToBibleBookmark(bookmark: ApiBookmark): BibleBookmark {
  const parsed = parseBookmarkReference(bookmark.text);
  return {
    id: bookmark.id,
    book: parsed.book,
    chapter: parsed.chapter,
    verse: parsed.verse,
    createdAt: bookmark.createdAt ?? new Date().toISOString(),
  };
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
  const { user, getAccessToken } = useAuth();
  const [bookmarks, setBookmarks] = useState<BibleBookmark[]>(loadBookmarks);

  const authFetch = useCallback(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const token = await getAccessToken();
      const headers = new globalThis.Headers(init?.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(input, {
        ...init,
        headers,
      });
    },
    [getAccessToken],
  );

  const apiClient = useMemo(
    () =>
      createProtectedApiClient({
        apiBaseUrl: WEB_ENV.API_URL,
        authFetch,
      }),
    [authFetch],
  );

  useEffect(() => {
    saveBookmarks(bookmarks);
  }, [bookmarks]);

  useEffect(() => {
    let isCancelled = false;

    if (!user) {
      setBookmarks(loadBookmarks());
      return () => {
        isCancelled = true;
      };
    }

    void apiClient
      .getBookmarks()
      .then((items) => {
        if (isCancelled) return;
        setBookmarks(items.map((item) => mapApiBookmarkToBibleBookmark(item)));
      })
      .catch((error) => {
        if (isCancelled) return;
        console.warn("[BibleBookmarks] Failed to pull bookmarks:", error);
      });

    return () => {
      isCancelled = true;
    };
  }, [apiClient, user]);

  const addBookmark = useCallback(
    (book: string, chapter: number, verse?: number, note?: string) => {
      const referenceText = formatBookmarkReference(book, chapter, verse);
      const optimisticId = `${referenceText}-${Date.now()}`;
      const optimisticBookmark: BibleBookmark = {
        id: optimisticId,
        book,
        chapter,
        verse,
        note,
        createdAt: new Date().toISOString(),
      };

      let wasInserted = false;
      setBookmarks((prev) => {
        const exists = prev.some(
          (entry) =>
            entry.book === book &&
            entry.chapter === chapter &&
            entry.verse === verse,
        );
        if (exists) {
          return prev;
        }
        wasInserted = true;
        return [optimisticBookmark, ...prev];
      });

      if (!user || !wasInserted) return;

      void apiClient
        .createBookmark(referenceText)
        .then((saved) => {
          const mapped = mapApiBookmarkToBibleBookmark(saved);
          setBookmarks((prev) =>
            prev.map((entry) =>
              entry.id === optimisticId
                ? {
                    ...mapped,
                    note,
                  }
                : entry,
            ),
          );
        })
        .catch((error) => {
          console.warn("[BibleBookmarks] Failed to save bookmark:", error);
          setBookmarks((prev) =>
            prev.filter((entry) => entry.id !== optimisticId),
          );
        });
    },
    [apiClient, user],
  );

  const removeBookmark = useCallback(
    (id: string) => {
      let removed: BibleBookmark | null = null;
      setBookmarks((prev) => {
        removed = prev.find((entry) => entry.id === id) ?? null;
        return prev.filter((entry) => entry.id !== id);
      });

      if (!user || !removed) return;

      void apiClient.deleteBookmark(id).catch((error) => {
        console.warn("[BibleBookmarks] Failed to delete bookmark:", error);
        if (!removed) return;
        setBookmarks((prev) => [removed as BibleBookmark, ...prev]);
      });
    },
    [apiClient, user],
  );

  const isBookmarked = useCallback(
    (book: string, chapter: number, verse?: number) =>
      bookmarks.some(
        (entry) =>
          entry.book === book &&
          entry.chapter === chapter &&
          entry.verse === verse,
      ),
    [bookmarks],
  );

  const getBookmark = useCallback(
    (book: string, chapter: number, verse?: number) =>
      bookmarks.find(
        (entry) =>
          entry.book === book &&
          entry.chapter === chapter &&
          entry.verse === verse,
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
  if (!ctx) {
    throw new Error(
      "useBibleBookmarks must be used within BibleBookmarksProvider",
    );
  }
  return ctx;
}
