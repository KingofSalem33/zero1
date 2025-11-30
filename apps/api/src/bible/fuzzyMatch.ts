/**
 * Fuzzy String Matching Utilities
 *
 * Implements Levenshtein distance for handling common misspellings
 * like "salamon" -> "solomon"
 */

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits required
 * to transform one string into another
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create a 2D array for dynamic programming
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first column (distance from empty string)
  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }

  // Initialize first row (distance from empty string)
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Find fuzzy matches for a query word within a target string
 *
 * Strategy:
 * - Extract words from target string
 * - Calculate distance to each word
 * - Return true if any word is within threshold
 *
 * Threshold rules:
 * - Words 4-5 chars: distance <= 1 (e.g., "god" matches "good")
 * - Words 6-8 chars: distance <= 2 (e.g., "salamon" matches "solomon")
 * - Words 9+ chars: distance <= 3 (e.g., "righteosness" matches "righteousness")
 */
export function fuzzyMatchWord(
  query: string,
  targetText: string,
  maxDistance?: number
): boolean {
  const queryLower = query.toLowerCase();
  const queryLen = queryLower.length;

  // Determine threshold based on word length if not provided
  let threshold = maxDistance;
  if (threshold === undefined) {
    if (queryLen <= 3) {
      threshold = 0; // Too short for fuzzy matching
    } else if (queryLen <= 5) {
      threshold = 1;
    } else if (queryLen <= 8) {
      threshold = 2;
    } else {
      threshold = 3;
    }
  }

  // No fuzzy matching for very short words
  if (threshold === 0) {
    return targetText.toLowerCase().includes(queryLower);
  }

  // Extract words from target text (alphanumeric only)
  const words = targetText.toLowerCase().match(/[a-z]+/g) || [];

  // Check each word for fuzzy match
  for (const word of words) {
    const distance = levenshteinDistance(queryLower, word);
    if (distance <= threshold) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate match score for ranking results
 * Lower score = better match
 *
 * Scoring:
 * - Exact match: 0
 * - Fuzzy match: distance * 10 (e.g., distance 2 = score 20)
 */
export function calculateMatchScore(
  query: string,
  targetText: string
): number {
  const queryLower = query.toLowerCase();
  const targetLower = targetText.toLowerCase();

  // Exact substring match
  if (targetLower.includes(queryLower)) {
    return 0;
  }

  // Find best fuzzy match
  const words = targetLower.match(/[a-z]+/g) || [];
  let minDistance = Infinity;

  for (const word of words) {
    const distance = levenshteinDistance(queryLower, word);
    minDistance = Math.min(minDistance, distance);
  }

  return minDistance * 10;
}
