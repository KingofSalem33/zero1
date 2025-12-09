import { Verse, VerseRef, Book } from "./types";
import { InMemoryVerseRepository } from "../repositories";

// Singleton repository instance
let repository: InMemoryVerseRepository | null = null;

/**
 * Get the Bible repository instance
 */
function getRepository(): InMemoryVerseRepository {
  if (!repository) {
    repository = new InMemoryVerseRepository();
  }
  return repository;
}

/**
 * Load KJV Bible data into memory
 * @deprecated Use repository.initialize() instead
 */
export async function loadKJVData(): Promise<Book[]> {
  const repo = getRepository();
  await repo.initialize();
  return repo.getBooks();
}

/**
 * Get a single verse by reference
 */
export async function getVerse(ref: VerseRef): Promise<Verse | null> {
  const repo = getRepository();
  return repo.getVerse(ref);
}

/**
 * Get multiple verses by references
 */
export async function getVerses(refs: VerseRef[]): Promise<Verse[]> {
  const repo = getRepository();
  return repo.getVerses(refs);
}

/**
 * Get a range of verses from a chapter
 */
export async function getVerseRange(
  book: string,
  chapter: number,
  startVerse: number,
  endVerse: number,
): Promise<Verse[]> {
  const repo = getRepository();
  return repo.getVerseRange(book, chapter, startVerse, endVerse);
}

/**
 * Search verses by keywords with fuzzy matching
 */
export async function searchVerses(
  keywords: string[],
  limit: number = 50,
): Promise<Verse[]> {
  const repo = getRepository();
  return repo.searchVerses(keywords, limit);
}

/**
 * Get all books metadata
 */
export async function getBooks(): Promise<Book[]> {
  const repo = getRepository();
  return repo.getBooks();
}

/**
 * Get a specific book by name/abbreviation
 */
export async function getBook(bookName: string): Promise<Book | null> {
  const repo = getRepository();
  return repo.getBook(bookName);
}
