import { WEB_ENV } from "../lib/env";
const API_URL = WEB_ENV.API_URL;

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

const MAX_ENTRIES = 200;
const TTL_MS = 10 * 60 * 1000; // 10 minutes

const verseTextCache = new Map<string, CacheEntry<string>>();
const crossRefCache = new Map<string, CacheEntry<VerseRef[]>>();

interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

function evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>) {
  if (cache.size >= MAX_ENTRIES) {
    // Delete the oldest entry (first key in insertion order)
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
}

function getValid<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // Move to end (LRU refresh)
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function setEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  evictIfNeeded(cache);
  cache.set(key, { value, timestamp: Date.now() });
}

/**
 * Fetch verse text with caching. Returns the text or null on error.
 */
export async function fetchVerseText(
  reference: string,
  signal?: globalThis.AbortSignal,
): Promise<string | null> {
  const cached = getValid(verseTextCache, reference);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(
      `${API_URL}/api/verse/${encodeURIComponent(reference)}`,
      signal ? { signal } : undefined,
    );
    if (!response.ok) return null;
    const data = await response.json();
    const text: string = data.text;
    setEntry(verseTextCache, reference, text);
    return text;
  } catch {
    return null;
  }
}

/**
 * Fetch cross-references with caching.
 */
export async function fetchCrossReferences(
  reference: string,
  signal?: globalThis.AbortSignal,
): Promise<VerseRef[]> {
  const cached = getValid(crossRefCache, reference);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(
      `${API_URL}/api/verse/${encodeURIComponent(reference)}/cross-references`,
      signal ? { signal } : undefined,
    );
    if (!response.ok) return [];
    const data = await response.json();
    const refs: VerseRef[] = data.crossReferences || [];
    setEntry(crossRefCache, reference, refs);
    return refs;
  } catch {
    return [];
  }
}


