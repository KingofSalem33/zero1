import type { BibleBookName } from "@zero1/shared";

export interface BibleChapterVerse {
  verse: number;
  text: string;
}

export interface BibleChapterData {
  chapter: number;
  verses: BibleChapterVerse[];
}

export interface BibleBookData {
  book: string;
  chapters: BibleChapterData[];
}

const bookCache = new Map<string, BibleBookData>();
const inflightRequests = new Map<string, Promise<BibleBookData>>();

function buildBookUrl(bookName: string): string {
  const fileName = bookName.replace(/\s+/g, "");
  return `https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/${encodeURIComponent(fileName)}.json`;
}

function normalizeBookPayload(
  payload: unknown,
  requestedBook: string,
): BibleBookData {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Invalid Bible book payload for ${requestedBook}.`);
  }
  const raw = payload as {
    book?: unknown;
    chapters?: Array<{
      chapter?: unknown;
      verses?: Array<{ verse?: unknown; text?: unknown }>;
    }>;
  };
  if (!Array.isArray(raw.chapters)) {
    throw new Error(
      `Bible book payload missing chapters for ${requestedBook}.`,
    );
  }

  return {
    book:
      typeof raw.book === "string" && raw.book.trim().length > 0
        ? raw.book
        : requestedBook,
    chapters: raw.chapters.map((chapter, chapterIndex) => {
      const chapterNumber = Number(chapter.chapter);
      if (!Array.isArray(chapter.verses)) {
        throw new Error(
          `Bible chapter payload missing verses for ${requestedBook} chapter ${chapterIndex + 1}.`,
        );
      }

      return {
        chapter:
          Number.isInteger(chapterNumber) && chapterNumber > 0
            ? chapterNumber
            : chapterIndex + 1,
        verses: chapter.verses.map((verse, verseIndex) => {
          const verseNumber = Number(verse.verse);
          return {
            verse:
              Number.isInteger(verseNumber) && verseNumber > 0
                ? verseNumber
                : verseIndex + 1,
            text: typeof verse.text === "string" ? verse.text : "",
          };
        }),
      };
    }),
  };
}

async function fetchBook(bookName: string): Promise<BibleBookData> {
  const response = await fetch(buildBookUrl(bookName));
  if (!response.ok) {
    throw new Error(`Failed to load ${bookName} (${response.status})`);
  }
  const payload = await response.json();
  const normalized = normalizeBookPayload(payload, bookName);
  bookCache.set(bookName, normalized);
  return normalized;
}

export async function getBibleBook(
  bookName: BibleBookName,
): Promise<BibleBookData> {
  const cached = bookCache.get(bookName);
  if (cached) {
    return cached;
  }

  const inflight = inflightRequests.get(bookName);
  if (inflight) {
    return inflight;
  }

  const promise = fetchBook(bookName).finally(() => {
    inflightRequests.delete(bookName);
  });
  inflightRequests.set(bookName, promise);
  return promise;
}
