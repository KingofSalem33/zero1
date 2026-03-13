import {
  BIBLE_BOOKS as SHARED_BIBLE_BOOKS,
  CHAPTER_COUNTS as SHARED_CHAPTER_COUNTS,
  resolveBibleBookName,
} from "@zero1/shared";

export const BIBLE_BOOKS = [...SHARED_BIBLE_BOOKS];

/** Number of chapters per book (KJV canon) */
export const CHAPTER_COUNTS: Record<string, number> = {
  ...SHARED_CHAPTER_COUNTS,
};

/** Resolve a possibly-aliased book name to its canonical form */
export function resolveBookName(rawBook: string): string | null {
  return resolveBibleBookName(rawBook);
}

/** Resolve a URL-encoded book name (hyphens instead of spaces) */
export function resolveBookFromUrl(urlBook: string): string | null {
  const decoded = decodeURIComponent(urlBook).replace(/-/g, " ");
  return resolveBookName(decoded);
}

/** Encode a book name for use in URLs */
export function bookToUrlParam(book: string): string {
  return book.replace(/ /g, "-");
}

/** Parse a reference like "John 3:16" into structured parts */
export function parseVerseReference(reference: string): {
  book: string;
  chapter: number;
  verse: number;
} | null {
  const cleaned = reference.trim().replace(/\s+/g, " ");
  const match = cleaned.match(/^(.+?)\s+(\d+):(\d+)(?:-\d+)?$/);
  if (!match) return null;

  const bookRaw = match[1];
  const chapter = Number.parseInt(match[2], 10);
  const verse = Number.parseInt(match[3], 10);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;

  const book = resolveBookName(bookRaw);
  if (!book) return null;
  return { book, chapter, verse };
}
