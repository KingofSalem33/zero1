import fs from "fs/promises";
import * as fsSync from "fs";
import path from "path";
import { IVerseRepository } from "./IVerseRepository";
import { Verse, VerseRef, Book } from "../bible/types";
import { BOOK_NAMES, ABBREV_TO_INDEX } from "../bible/bookNames";
import { fuzzyMatchWord, calculateMatchScore } from "../bible/fuzzyMatch";

export class InMemoryVerseRepository implements IVerseRepository {
  private kjvData: Book[] | null = null;
  private readonly kjvPath: string;

  constructor(dataPath?: string) {
    if (dataPath) {
      this.kjvPath = dataPath;
      return;
    }

    const candidates = [
      path.resolve(process.cwd(), "apps", "api", "data", "kjv.json"),
      path.resolve(process.cwd(), "data", "kjv.json"),
      path.join(__dirname, "..", "..", "data", "kjv.json"), // dist/
      path.join(__dirname, "..", "..", "..", "data", "kjv.json"), // src/
    ];

    const resolved =
      candidates.find((candidate) => {
        try {
          return fsSync.existsSync(candidate);
        } catch {
          return false;
        }
      }) || candidates[candidates.length - 1];

    this.kjvPath = resolved;
  }

  async initialize(): Promise<void> {
    if (this.kjvData) return;
    try {
      console.log("[InMemoryVerseRepository] Loading KJV data...");
      const rawData = await fs.readFile(this.kjvPath, "utf-8");
      const parsed = JSON.parse(rawData) as
        | Book[]
        | {
            books: Array<{
              name: string;
              chapters: Array<{
                verses: Array<{ text: string }>;
              }>;
            }>;
          };

      const books: Book[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.books)
          ? parsed.books.map((book) => {
              const abbrev =
                Object.entries(BOOK_NAMES).find(
                  ([, fullName]) => fullName === book.name,
                )?.[0] ?? book.name;
              return {
                abbrev,
                name: book.name,
                chapters: book.chapters.map((chapter) =>
                  chapter.verses.map((verse) => verse.text ?? ""),
                ),
              };
            })
          : [];

      if (!Array.isArray(books) || books.length === 0) {
        throw new Error("KJV JSON format is not supported");
      }

      this.kjvData = books.map((book) => ({
        ...book,
        name: BOOK_NAMES[book.abbrev] || book.name || book.abbrev.toUpperCase(),
      }));
      console.log("[InMemoryVerseRepository] Loaded books from KJV");
    } catch (error) {
      const fileError = error as { code?: string };
      if (fileError?.code === "ENOENT") {
        console.warn(
          `[InMemoryVerseRepository] KJV data not found at ${this.kjvPath}; continuing without in-memory fallback data`,
        );
        this.kjvData = [];
        return;
      }
      console.error(
        "[InMemoryVerseRepository] Failed to load KJV data:",
        error,
      );
      throw new Error("Failed to load KJV Bible data");
    }
  }

  isReady(): boolean {
    return this.kjvData !== null;
  }

  private normalizeBookName(bookName: string): string {
    const lower = bookName.toLowerCase().trim();
    // Direct abbreviation match (e.g., "mt", "gn")
    if (ABBREV_TO_INDEX[lower] !== undefined) return lower;
    // Exact full-name match (e.g., "matthew", "genesis")
    for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
      if (fullName.toLowerCase() === lower) return abbrev;
    }
    // Prefix match on full names (e.g., "matt" -> "Matthew" -> "mt")
    if (lower.length >= 3) {
      for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
        if (fullName.toLowerCase().startsWith(lower)) return abbrev;
      }
    }
    return lower;
  }

  private async ensureInitialized(): Promise<Book[]> {
    if (!this.kjvData) await this.initialize();
    return this.kjvData!;
  }

  async getVerse(ref: VerseRef): Promise<Verse | null> {
    const data = await this.ensureInitialized();
    const normalizedBook = this.normalizeBookName(ref.book);
    const bookIndex = ABBREV_TO_INDEX[normalizedBook];
    if (bookIndex === undefined || bookIndex >= data.length) return null;
    const book = data[bookIndex];
    const chapter = book.chapters[ref.chapter - 1];
    if (!chapter || ref.verse < 1 || ref.verse > chapter.length) return null;
    return {
      book: book.name,
      chapter: ref.chapter,
      verse: ref.verse,
      text: chapter[ref.verse - 1],
    };
  }

  async getVerses(refs: VerseRef[]): Promise<Verse[]> {
    const verses: Verse[] = [];
    for (const ref of refs) {
      const verse = await this.getVerse(ref);
      if (verse) verses.push(verse);
    }
    return verses;
  }

  async getVerseRange(
    book: string,
    chapter: number,
    startVerse: number,
    endVerse: number,
  ): Promise<Verse[]> {
    const data = await this.ensureInitialized();
    const normalizedBook = this.normalizeBookName(book);
    const bookIndex = ABBREV_TO_INDEX[normalizedBook];
    if (bookIndex === undefined || bookIndex >= data.length) return [];
    const bookData = data[bookIndex];
    const chapterData = bookData.chapters[chapter - 1];
    if (!chapterData) return [];
    const verses: Verse[] = [];
    const actualStart = Math.max(1, startVerse);
    const actualEnd = Math.min(chapterData.length, endVerse);
    for (let verseNum = actualStart; verseNum <= actualEnd; verseNum++) {
      verses.push({
        book: bookData.name,
        chapter,
        verse: verseNum,
        text: chapterData[verseNum - 1],
      });
    }
    return verses;
  }

  async searchVerses(keywords: string[], maxResults = 50): Promise<Verse[]> {
    const data = await this.ensureInitialized();
    const normalizedKeywords = keywords.map((k) => k.toLowerCase());
    const exactResults: Verse[] = [];
    for (const book of data) {
      for (
        let chapterIdx = 0;
        chapterIdx < book.chapters.length;
        chapterIdx++
      ) {
        const chapter = book.chapters[chapterIdx];
        for (let verseIdx = 0; verseIdx < chapter.length; verseIdx++) {
          const verseText = chapter[verseIdx];
          const normalizedText = verseText.toLowerCase();
          const matchCount = normalizedKeywords.filter((keyword) =>
            normalizedText.includes(keyword),
          ).length;
          if (matchCount > 0) {
            exactResults.push({
              book: book.name,
              chapter: chapterIdx + 1,
              verse: verseIdx + 1,
              text: verseText,
            });
            if (exactResults.length >= maxResults) return exactResults;
          }
        }
      }
    }
    if (exactResults.length > 0) return exactResults;
    interface ScoredVerse extends Verse {
      score: number;
    }
    const fuzzyResults: ScoredVerse[] = [];
    for (const book of data) {
      for (
        let chapterIdx = 0;
        chapterIdx < book.chapters.length;
        chapterIdx++
      ) {
        const chapter = book.chapters[chapterIdx];
        for (let verseIdx = 0; verseIdx < chapter.length; verseIdx++) {
          const verseText = chapter[verseIdx];
          let matchCount = 0;
          let totalScore = 0;
          for (const keyword of normalizedKeywords) {
            if (fuzzyMatchWord(keyword, verseText)) {
              matchCount++;
              totalScore += calculateMatchScore(keyword, verseText);
            }
          }
          if (matchCount > 0) {
            fuzzyResults.push({
              book: book.name,
              chapter: chapterIdx + 1,
              verse: verseIdx + 1,
              text: verseText,
              score: totalScore / matchCount,
            });
          }
        }
      }
    }
    fuzzyResults.sort((a, b) => b.score - a.score);
    return fuzzyResults
      .slice(0, maxResults)
      .map(({ score: _score, ...verse }) => verse);
  }

  async getBooks(): Promise<Book[]> {
    return await this.ensureInitialized();
  }

  async getBook(bookName: string): Promise<Book | null> {
    const data = await this.ensureInitialized();
    const normalizedBook = this.normalizeBookName(bookName);
    const bookIndex = ABBREV_TO_INDEX[normalizedBook];
    if (bookIndex === undefined || bookIndex >= data.length) return null;
    return data[bookIndex];
  }
}
