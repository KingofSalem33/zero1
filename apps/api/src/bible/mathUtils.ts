/**
 * Shared math utilities for the Bible graph system.
 *
 * Consolidates duplicated implementations of cosine similarity,
 * percentile, and clamping functions.
 */

/**
 * Cosine similarity between two embedding vectors.
 * Returns 0 for zero-length or zero-norm vectors (prevents NaN).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Compute a percentile value from a sorted array.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const idx = (values.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return values[lower];
  const weight = idx - lower;
  return values[lower] + (values[upper] - values[lower]) * weight;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Database Verse shape (matches the `verses` table).
 * Used across graphEngine, graphWalker, and other graph modules.
 */
export interface DbVerse {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  similarity?: number;
}
