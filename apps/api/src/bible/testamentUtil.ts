/**
 * Testament Checking Utility
 *
 * Provides utilities for determining which testament a book belongs to.
 * Uses canonical database abbreviations (lowercase, 2-3 chars) from bookNames.ts
 */

/**
 * Old Testament books
 * Uses database abbreviations (book_abbrev field) for accurate matching
 */
export const OLD_TESTAMENT_BOOKS = new Set([
  // Pentateuch
  "gn", // Genesis
  "ex", // Exodus
  "lv", // Leviticus
  "nm", // Numbers
  "dt", // Deuteronomy

  // Historical Books
  "js", // Joshua
  "jud", // Judges
  "rt", // Ruth
  "1sm", // 1 Samuel
  "2sm", // 2 Samuel
  "1kgs", // 1 Kings
  "2kgs", // 2 Kings
  "1ch", // 1 Chronicles
  "2ch", // 2 Chronicles
  "ezr", // Ezra
  "ne", // Nehemiah
  "et", // Esther

  // Wisdom Literature
  "job", // Job
  "ps", // Psalms
  "prv", // Proverbs
  "ec", // Ecclesiastes
  "so", // Song of Solomon

  // Major Prophets
  "is", // Isaiah
  "jr", // Jeremiah
  "lm", // Lamentations
  "ez", // Ezekiel
  "dn", // Daniel

  // Minor Prophets
  "ho", // Hosea
  "jl", // Joel
  "am", // Amos
  "ob", // Obadiah
  "jn", // Jonah (NOT "jo" which is John Gospel!)
  "mi", // Micah
  "na", // Nahum
  "hk", // Habakkuk
  "zp", // Zephaniah
  "hg", // Haggai
  "zc", // Zechariah
  "ml", // Malachi
]);

/**
 * New Testament books
 * Uses database abbreviations (book_abbrev field) for accurate matching
 */
export const NEW_TESTAMENT_BOOKS = new Set([
  // Gospels
  "mt", // Matthew
  "mk", // Mark
  "lk", // Luke
  "jo", // John (NOT "jn" which is Jonah!)

  // Acts
  "act", // Acts

  // Pauline Epistles
  "rm", // Romans
  "1co", // 1 Corinthians
  "2co", // 2 Corinthians
  "gl", // Galatians
  "eph", // Ephesians
  "ph", // Philippians
  "cl", // Colossians
  "1ts", // 1 Thessalonians
  "2ts", // 2 Thessalonians
  "1tm", // 1 Timothy
  "2tm", // 2 Timothy
  "tt", // Titus
  "phm", // Philemon

  // General Epistles
  "hb", // Hebrews
  "jm", // James
  "1pe", // 1 Peter
  "2pe", // 2 Peter
  "1jo", // 1 John
  "2jo", // 2 John
  "3jo", // 3 John
  "jd", // Jude

  // Apocalyptic
  "re", // Revelation
]);

/**
 * Determine if a book is in the Old Testament
 */
export function isOldTestament(bookAbbrev: string): boolean {
  return OLD_TESTAMENT_BOOKS.has(bookAbbrev);
}

/**
 * Determine if a book is in the New Testament
 */
export function isNewTestament(bookAbbrev: string): boolean {
  return NEW_TESTAMENT_BOOKS.has(bookAbbrev);
}

/**
 * Get testament for a book ("OT" or "NT")
 * Returns "OT" if not found (defensive default)
 */
export function getTestament(bookAbbrev: string): "OT" | "NT" {
  return OLD_TESTAMENT_BOOKS.has(bookAbbrev) ? "OT" : "NT";
}

/**
 * Check if two books are in the same testament
 */
export function areSameTestament(book1: string, book2: string): boolean {
  const book1IsOT = OLD_TESTAMENT_BOOKS.has(book1);
  const book2IsOT = OLD_TESTAMENT_BOOKS.has(book2);
  return book1IsOT === book2IsOT;
}
