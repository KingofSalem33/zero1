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
] as const;

export type BibleBookName = (typeof BIBLE_BOOKS)[number];

export const CHAPTER_COUNTS: Record<BibleBookName, number> = {
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

const BOOK_ALIAS_MAP: Record<string, BibleBookName> = {
  psalm: "Psalms",
  psalms: "Psalms",
  "song of songs": "Song of Solomon",
  "song of solomon": "Song of Solomon",
  canticles: "Song of Solomon",
  revelations: "Revelation",
};

function normalizeBookInput(rawBook: string): string {
  return rawBook.trim().replace(/\s+/g, " ");
}

export function resolveBibleBookName(rawBook: string): BibleBookName | null {
  const normalized = normalizeBookInput(rawBook);
  if (!normalized) {
    return null;
  }

  const key = normalized.toLowerCase();
  const alias = BOOK_ALIAS_MAP[key];
  if (alias) {
    return alias;
  }

  const direct = BIBLE_BOOKS.find((book) => book.toLowerCase() === key);
  if (direct) {
    return direct;
  }

  const romanKey = key
    .replace(/^iii\s+/, "3 ")
    .replace(/^ii\s+/, "2 ")
    .replace(/^i\s+/, "1 ");
  const romanMatch = BIBLE_BOOKS.find(
    (book) => book.toLowerCase() === romanKey,
  );
  if (romanMatch) {
    return romanMatch;
  }
  if (romanKey.length >= 2) {
    const romanPrefixMatches = BIBLE_BOOKS.filter((book) =>
      book.toLowerCase().startsWith(romanKey),
    );
    if (romanPrefixMatches.length === 1) {
      return romanPrefixMatches[0];
    }
  }

  if (key.length >= 2) {
    const prefixMatches = BIBLE_BOOKS.filter((book) =>
      book.toLowerCase().startsWith(key),
    );
    if (prefixMatches.length === 1) {
      return prefixMatches[0];
    }
  }

  return null;
}

export function getBibleChapterCount(book: string): number | null {
  const resolved = resolveBibleBookName(book);
  return resolved ? CHAPTER_COUNTS[resolved] : null;
}

export function getBibleBookSuggestions(
  query: string,
  limit = 6,
): BibleBookName[] {
  const normalized = normalizeBookInput(query).toLowerCase();
  if (!normalized) {
    return [...BIBLE_BOOKS].slice(0, limit);
  }

  const exact = BIBLE_BOOKS.filter((book) => book.toLowerCase() === normalized);
  const prefix = BIBLE_BOOKS.filter((book) =>
    book.toLowerCase().startsWith(normalized),
  );
  const includes = BIBLE_BOOKS.filter((book) =>
    book.toLowerCase().includes(normalized),
  );

  return Array.from(new Set([...exact, ...prefix, ...includes])).slice(
    0,
    limit,
  );
}
