import { supabase } from "../db";
import { BOOK_NAMES } from "./bookNames";
import { Verse, VerseRef, Book } from "./types";

type VerseRow = {
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string | null;
};

const normalizeBookInput = (book: string): string =>
  book.trim().toLowerCase().replace(/\s+/g, " ");

const FULL_NAME_TO_ABBREV = new Map<string, string>(
  Object.entries(BOOK_NAMES).map(([abbrev, fullName]) => [
    normalizeBookInput(fullName),
    abbrev,
  ]),
);

let booksCache: Book[] | null = null;
const bookCacheByAbbrev = new Map<string, Book>();

function normalizeBookAbbrev(book: string): string | null {
  const normalized = normalizeBookInput(book);
  if (!normalized) return null;

  if (BOOK_NAMES[normalized]) {
    return normalized;
  }

  const exact = FULL_NAME_TO_ABBREV.get(normalized);
  if (exact) {
    return exact;
  }

  if (normalized.length >= 3) {
    for (const [fullName, abbrev] of FULL_NAME_TO_ABBREV.entries()) {
      if (fullName.startsWith(normalized)) {
        return abbrev;
      }
    }
  }

  return null;
}

function toVerse(row: VerseRow): Verse {
  return {
    book: row.book_name,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text ?? "",
  };
}

function appendVerseToBook(target: Book, row: VerseRow): void {
  while (target.chapters.length < row.chapter) {
    target.chapters.push([]);
  }
  const chapter = target.chapters[row.chapter - 1];
  while (chapter.length < row.verse) {
    chapter.push("");
  }
  chapter[row.verse - 1] = row.text ?? "";
}

async function loadAllBooksFromDb(): Promise<Book[]> {
  const { data, error } = await supabase
    .from("verses")
    .select("book_abbrev, book_name, chapter, verse, text")
    .order("id", { ascending: true });

  if (error || !data) {
    throw new Error(
      `Failed to load Bible books: ${error?.message || "unknown"}`,
    );
  }

  const booksByAbbrev = new Map<string, Book>();
  for (const row of data as VerseRow[]) {
    let book = booksByAbbrev.get(row.book_abbrev);
    if (!book) {
      book = {
        abbrev: row.book_abbrev,
        name: row.book_name,
        chapters: [],
      };
      booksByAbbrev.set(row.book_abbrev, book);
    }
    appendVerseToBook(book, row);
  }

  const books = Array.from(booksByAbbrev.values());
  booksCache = books;
  bookCacheByAbbrev.clear();
  for (const book of books) {
    bookCacheByAbbrev.set(book.abbrev, book);
  }
  return books;
}

/**
 * Load Bible data from Supabase into memory cache.
 * @deprecated Kept for compatibility with older callers.
 */
export async function loadKJVData(): Promise<Book[]> {
  if (booksCache) return booksCache;
  return loadAllBooksFromDb();
}

/**
 * Get a single verse by reference from Supabase.
 */
export async function getVerse(ref: VerseRef): Promise<Verse | null> {
  const abbrev = normalizeBookAbbrev(ref.book);
  if (!abbrev) return null;
  if (ref.chapter < 1 || ref.verse < 1) return null;

  const { data, error } = await supabase
    .from("verses")
    .select("book_abbrev, book_name, chapter, verse, text")
    .eq("book_abbrev", abbrev)
    .eq("chapter", ref.chapter)
    .eq("verse", ref.verse)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toVerse(data as VerseRow);
}

/**
 * Get multiple verses by references from Supabase.
 */
export async function getVerses(refs: VerseRef[]): Promise<Verse[]> {
  if (refs.length === 0) return [];

  const normalizedRefs = refs
    .map((ref) => ({
      abbrev: normalizeBookAbbrev(ref.book),
      chapter: ref.chapter,
      verse: ref.verse,
    }))
    .filter(
      (ref): ref is { abbrev: string; chapter: number; verse: number } =>
        !!ref.abbrev && ref.chapter > 0 && ref.verse > 0,
    );

  if (normalizedRefs.length === 0) return [];

  const groups = new Map<string, Set<number>>();
  for (const ref of normalizedRefs) {
    const key = `${ref.abbrev}|${ref.chapter}`;
    if (!groups.has(key)) {
      groups.set(key, new Set<number>());
    }
    groups.get(key)!.add(ref.verse);
  }

  const rowsByKey = new Map<string, VerseRow>();
  await Promise.all(
    Array.from(groups.entries()).map(async ([groupKey, verses]) => {
      const [bookAbbrev, chapterRaw] = groupKey.split("|");
      const chapter = Number(chapterRaw);
      const verseList = Array.from(verses);

      const { data, error } = await supabase
        .from("verses")
        .select("book_abbrev, book_name, chapter, verse, text")
        .eq("book_abbrev", bookAbbrev)
        .eq("chapter", chapter)
        .in("verse", verseList);

      if (error || !data) {
        return;
      }

      for (const row of data as VerseRow[]) {
        rowsByKey.set(`${row.book_abbrev}|${row.chapter}|${row.verse}`, row);
      }
    }),
  );

  return normalizedRefs
    .map((ref) => rowsByKey.get(`${ref.abbrev}|${ref.chapter}|${ref.verse}`))
    .filter((row): row is VerseRow => !!row)
    .map((row) => toVerse(row));
}

/**
 * Get a range of verses from a chapter.
 */
export async function getVerseRange(
  book: string,
  chapter: number,
  startVerse: number,
  endVerse: number,
): Promise<Verse[]> {
  const abbrev = normalizeBookAbbrev(book);
  if (!abbrev || chapter < 1) return [];

  const verseStart = Math.max(1, startVerse);
  const verseEnd = Math.max(verseStart, endVerse);

  const { data, error } = await supabase
    .from("verses")
    .select("book_abbrev, book_name, chapter, verse, text")
    .eq("book_abbrev", abbrev)
    .eq("chapter", chapter)
    .gte("verse", verseStart)
    .lte("verse", verseEnd)
    .order("verse", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as VerseRow[]).map((row) => toVerse(row));
}

/**
 * Search verses by keywords from Supabase.
 */
export async function searchVerses(
  keywords: string[],
  limit: number = 50,
): Promise<Verse[]> {
  const cleanKeywords = Array.from(
    new Set(
      keywords
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length > 1)
        .slice(0, 8),
    ),
  );

  if (cleanKeywords.length === 0 || limit <= 0) {
    return [];
  }

  const orFilter = cleanKeywords
    .map((keyword) => `text.ilike.%${keyword.replace(/[%_]/g, "")}%`)
    .join(",");

  const { data, error } = await supabase
    .from("verses")
    .select("book_abbrev, book_name, chapter, verse, text")
    .or(orFilter)
    .order("id", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as VerseRow[]).map((row) => toVerse(row));
}

/**
 * Get all books metadata + text from Supabase.
 */
export async function getBooks(): Promise<Book[]> {
  if (booksCache) return booksCache;
  return loadAllBooksFromDb();
}

/**
 * Get a specific book by name/abbreviation.
 */
export async function getBook(bookName: string): Promise<Book | null> {
  const abbrev = normalizeBookAbbrev(bookName);
  if (!abbrev) return null;

  const cached = bookCacheByAbbrev.get(abbrev);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("verses")
    .select("book_abbrev, book_name, chapter, verse, text")
    .eq("book_abbrev", abbrev)
    .order("chapter", { ascending: true })
    .order("verse", { ascending: true });

  if (error || !data || data.length === 0) {
    return null;
  }

  const rows = data as VerseRow[];
  const book: Book = {
    abbrev: rows[0].book_abbrev,
    name: rows[0].book_name,
    chapters: [],
  };

  for (const row of rows) {
    appendVerseToBook(book, row);
  }

  bookCacheByAbbrev.set(abbrev, book);
  return book;
}
