// Shared Bible reference utilities used by routes and components

export const BIBLE_BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
];

const BOOK_ALIAS_MAP: Record<string, string> = {
  psalm: "Psalms",
  psalms: "Psalms",
  "song of songs": "Song of Solomon",
  "song of solomon": "Song of Solomon",
  canticles: "Song of Solomon",
  revelations: "Revelation",
};

/** Resolve a possibly-aliased book name to its canonical form */
export function resolveBookName(rawBook: string): string | null {
  const normalized = rawBook.trim().replace(/\s+/g, " ");
  const key = normalized.toLowerCase();
  if (BOOK_ALIAS_MAP[key]) return BOOK_ALIAS_MAP[key];
  const direct = BIBLE_BOOKS.find((book) => book.toLowerCase() === key);
  if (direct) return direct;
  // Handle Roman numeral prefixes: "I John" → "1 John"
  const romanKey = key
    .replace(/^i\s+/, "1 ")
    .replace(/^ii\s+/, "2 ")
    .replace(/^iii\s+/, "3 ");
  return BIBLE_BOOKS.find((book) => book.toLowerCase() === romanKey) || null;
}

/** Resolve a URL-encoded book name (hyphens instead of spaces) */
export function resolveBookFromUrl(urlBook: string): string | null {
  // URL uses hyphens: "1-Corinthians" → "1 Corinthians", "Song-of-Solomon" → "Song of Solomon"
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
