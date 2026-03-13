import { ICache } from "../core/interfaces";
import { Verse, VerseRef } from "./types";
import * as BibleService from "./bibleService";

/**
 * Cached wrapper around BibleService
 * Provides fast verse lookups with automatic cache management
 */
export class CachedBibleService {
  constructor(
    private cache: ICache,
    private cacheTTL = 3600, // 1 hour default
  ) {}

  /**
   * Get a single verse by reference (with caching)
   */
  async getVerse(ref: VerseRef): Promise<Verse | null> {
    const cacheKey = this.makeVerseKey(ref);

    // Try cache first
    const cached = await this.cache.get<Verse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from service
    const verse = await BibleService.getVerse(ref);

    // Cache the result (even null results to avoid repeated lookups)
    if (verse) {
      await this.cache.set(cacheKey, verse, this.cacheTTL);
    }

    return verse;
  }

  /**
   * Get multiple verses by references (with caching)
   */
  async getVerses(refs: VerseRef[]): Promise<Verse[]> {
    const cacheKeys = refs.map((ref) => this.makeVerseKey(ref));

    // Try to get all from cache
    const cached = await this.cache.mget<Verse>(cacheKeys);

    const result: Verse[] = [];
    const missedRefs: VerseRef[] = [];
    const missedIndices: number[] = [];

    // Identify cache misses
    cached.forEach((verse, i) => {
      if (verse) {
        result[i] = verse;
      } else {
        missedRefs.push(refs[i]);
        missedIndices.push(i);
      }
    });

    // Fetch missed verses
    if (missedRefs.length > 0) {
      const missedVerses = await BibleService.getVerses(missedRefs);

      // Cache and insert results
      const cacheEntries = missedVerses.map((verse, i) => ({
        key: cacheKeys[missedIndices[i]],
        value: verse,
        ttl: this.cacheTTL,
      }));

      await this.cache.mset(cacheEntries);

      // Insert into result array
      missedVerses.forEach((verse, i) => {
        result[missedIndices[i]] = verse;
      });
    }

    return result.filter((v) => v !== null && v !== undefined);
  }

  /**
   * Search for verses by keywords
   */
  async searchVerses(keywords: string[], maxResults = 50): Promise<Verse[]> {
    const cacheKey = `search:${keywords.join(",")}:${maxResults}`;

    const cached = await this.cache.get<Verse[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const verses = await BibleService.searchVerses(keywords, maxResults);

    if (verses.length > 0) {
      await this.cache.set(cacheKey, verses, this.cacheTTL / 2); // Shorter TTL for searches
    }

    return verses;
  }

  /**
   * Get a range of verses
   */
  async getVerseRange(
    book: string,
    chapter: number,
    verseStart: number,
    verseEnd: number,
  ): Promise<Verse[]> {
    const cacheKey = `range:${book.toLowerCase()}:${chapter}:${verseStart}-${verseEnd}`;

    const cached = await this.cache.get<Verse[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const verses = await BibleService.getVerseRange(
      book,
      chapter,
      verseStart,
      verseEnd,
    );

    if (verses.length > 0) {
      await this.cache.set(cacheKey, verses, this.cacheTTL);
    }

    return verses;
  }

  /**
   * Generate cache key for verse reference
   */
  private makeVerseKey(ref: VerseRef): string {
    return `verse:${ref.book.toLowerCase()}:${ref.chapter}:${ref.verse}`;
  }

  /**
   * Clear all cached verses
   */
  async clearCache(): Promise<void> {
    await this.cache.flush();
  }
}
