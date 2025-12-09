import { Verse, VerseRef, Book } from "../bible/types";

/**
 * Repository interface for Bible verse data access
 * Abstracts the data source (in-memory, database, API, etc.)
 */
export interface IVerseRepository {
  /**
   * Initialize the repository (load data, connect to DB, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Get a single verse by reference
   */
  getVerse(ref: VerseRef): Promise<Verse | null>;

  /**
   * Get multiple verses by references
   */
  getVerses(refs: VerseRef[]): Promise<Verse[]>;

  /**
   * Get a range of verses from a chapter
   */
  getVerseRange(
    book: string,
    chapter: number,
    startVerse: number,
    endVerse: number,
  ): Promise<Verse[]>;

  /**
   * Search for verses containing keywords
   */
  searchVerses(keywords: string[], maxResults?: number): Promise<Verse[]>;

  /**
   * Get all books metadata
   */
  getBooks(): Promise<Book[]>;

  /**
   * Get a specific book by name/abbreviation
   */
  getBook(bookName: string): Promise<Book | null>;

  /**
   * Check if repository is initialized and ready
   */
  isReady(): boolean;
}
