/**
 * In-memory cache for Bible book data fetched from GitHub CDN.
 * Persists across re-renders and component unmounts (resets on page reload).
 */

interface Verse {
  verse: string;
  text: string;
}

interface Chapter {
  chapter: string;
  verses: Verse[];
}

export interface CachedBook {
  book: string;
  chapters: Chapter[];
}

const bookCache = new Map<string, CachedBook>();
const inflightRequests = new Map<string, Promise<CachedBook>>();

function buildUrl(bookName: string): string {
  const fileName = bookName.replace(/ /g, "");
  return `https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/${fileName}.json`;
}

async function fetchBook(bookName: string): Promise<CachedBook> {
  const response = await fetch(buildUrl(bookName));
  if (!response.ok) {
    throw new Error(`Failed to load ${bookName} (${response.status})`);
  }
  const data: CachedBook = await response.json();
  bookCache.set(bookName, data);
  return data;
}

/**
 * Get a book, returning from cache if available.
 * Deduplicates concurrent requests for the same book.
 *
 * NOTE: The shared inflight promise intentionally does NOT use an AbortSignal.
 * React StrictMode double-mounts components — if the first mount's signal is
 * passed into the shared promise and then aborted during cleanup, the second
 * mount reuses the same (now-aborting) promise and gets an empty result.
 * Callers can still check their own signal after awaiting.
 */
export async function getBook(
  bookName: string,
  _signal?: AbortSignal,
): Promise<CachedBook> {
  const cached = bookCache.get(bookName);
  if (cached) return cached;

  const inflight = inflightRequests.get(bookName);
  if (inflight) return inflight;

  const promise = fetchBook(bookName).finally(() => {
    inflightRequests.delete(bookName);
  });
  inflightRequests.set(bookName, promise);
  return promise;
}

/** Check if a book is already cached (sync). */
export function isBookCached(bookName: string): boolean {
  return bookCache.has(bookName);
}
