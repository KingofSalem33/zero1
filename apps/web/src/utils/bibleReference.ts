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

/** Number of chapters per book (KJV canon) */
export const CHAPTER_COUNTS: Record<string, number> = {
  Genesis: 50,
  Exodus: 40,
  Leviticus: 27,
  Numbers: 36,
  Deuteronomy: 34,
  Joshua: 24,
  Judges: 21,
  Ruth: 4,
  "1 Samuel": 31,
  "2 Samuel": 24,
  "1 Kings": 22,
  "2 Kings": 25,
  "1 Chronicles": 29,
  "2 Chronicles": 36,
  Ezra: 10,
  Nehemiah: 13,
  Esther: 10,
  Job: 42,
  Psalms: 150,
  Proverbs: 31,
  Ecclesiastes: 12,
  "Song of Solomon": 8,
  Isaiah: 66,
  Jeremiah: 52,
  Lamentations: 5,
  Ezekiel: 48,
  Daniel: 12,
  Hosea: 14,
  Joel: 3,
  Amos: 9,
  Obadiah: 1,
  Jonah: 4,
  Micah: 7,
  Nahum: 3,
  Habakkuk: 3,
  Zephaniah: 3,
  Haggai: 2,
  Zechariah: 14,
  Malachi: 4,
  Matthew: 28,
  Mark: 16,
  Luke: 24,
  John: 21,
  Acts: 28,
  Romans: 16,
  "1 Corinthians": 16,
  "2 Corinthians": 13,
  Galatians: 6,
  Ephesians: 6,
  Philippians: 4,
  Colossians: 4,
  "1 Thessalonians": 5,
  "2 Thessalonians": 3,
  "1 Timothy": 6,
  "2 Timothy": 4,
  Titus: 3,
  Philemon: 1,
  Hebrews: 13,
  James: 5,
  "1 Peter": 5,
  "2 Peter": 3,
  "1 John": 5,
  "2 John": 1,
  "3 John": 1,
  Jude: 1,
  Revelation: 22,
};

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
