/**
 * Suggested Topics Generator
 *
 * Provides intelligent next-step explorations after a teaching:
 * 1. Whole-chapter semantic analysis - Find thematically related chapters
 * 2. Cross-testament golden threads - Connect OT prophecy with NT fulfillment
 */

import { supabase } from "../db";
import { makeOpenAI } from "../ai";
import { ENV } from "../env";
import {
  getTestament,
  OLD_TESTAMENT_BOOKS,
  NEW_TESTAMENT_BOOKS,
} from "./testamentUtil";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

// Verse search result from RPC function
interface VerseSearchResult {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  similarity: number;
}

// Footer card format - matches ChapterFooter.tsx interface
interface FooterCard {
  lens:
    | "PROPHECY"
    | "TYPOLOGY"
    | "THREAD"
    | "PATTERN"
    | "ROOTS"
    | "WORLD"
    | "EXPLORE"
    | "GOLDEN";
  title: string;
  prompt: string;
}

/**
 * Find semantically similar chapters to a given anchor verse
 *
 * Enhancement #5: Whole-Chapter Semantic Analysis
 * Uses fast approach: generate chapter summary query, use vector search on verses,
 * then group results by chapter.
 */
export async function findSimilarChapters(
  anchorBookAbbrev: string,
  anchorChapter: number,
  limit: number = 3,
): Promise<FooterCard[]> {
  console.log(
    `[Suggested Topics] Finding chapters similar to ${anchorBookAbbrev} ${anchorChapter}`,
  );

  const startTime = Date.now();

  // Get a summary of the anchor chapter to use as search query
  const { data: anchorVerses, error: anchorError } = await supabase
    .from("verses")
    .select("text")
    .eq("book_abbrev", anchorBookAbbrev)
    .eq("chapter", anchorChapter)
    .limit(5); // First 5 verses for summary

  if (anchorError || !anchorVerses || anchorVerses.length === 0) {
    console.warn("[Suggested Topics] Could not load anchor chapter");
    return [];
  }

  // Create a search query from the anchor chapter
  const chapterSummary = anchorVerses
    .map((v) => v.text)
    .join(" ")
    .substring(0, 500);

  // Use existing vector search to find similar verses (faster than chapter-by-chapter)
  if (!ENV.AI_API_KEY) {
    console.warn("[Suggested Topics] No OpenAI API key");
    return [];
  }

  try {
    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI client not configured");
    }
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: chapterSummary,
      ...(ENV.AI_PROVIDER === "groq"
        ? {}
        : { dimensions: EMBEDDING_DIMENSIONS }),
    });

    const queryEmbedding = response.data[0].embedding;

    // Search for similar verses using vector search (much faster than comparing all chapters)
    const { data: similarVerses, error: searchError } = await supabase.rpc(
      "search_verses_by_embedding",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_limit: 50, // Get more verses to ensure we have multiple chapters
        similarity_threshold: 0.5,
      },
    );

    if (searchError || !similarVerses) {
      console.error("[Suggested Topics] Vector search failed:", searchError);
      return [];
    }

    // Group results by chapter and aggregate similarity scores
    const chapterScores = new Map<
      string,
      {
        book: string;
        bookName: string;
        chapter: number;
        totalSimilarity: number;
        verseCount: number;
      }
    >();

    for (const verse of similarVerses) {
      // Skip verses from the same chapter
      if (
        verse.book_abbrev === anchorBookAbbrev &&
        verse.chapter === anchorChapter
      ) {
        continue;
      }

      const key = `${verse.book_abbrev}|${verse.chapter}`;
      const existing = chapterScores.get(key);

      if (existing) {
        existing.totalSimilarity += verse.similarity;
        existing.verseCount++;
      } else {
        chapterScores.set(key, {
          book: verse.book_abbrev,
          bookName: verse.book_name,
          chapter: verse.chapter,
          totalSimilarity: verse.similarity,
          verseCount: 1,
        });
      }
    }

    // Calculate average similarity per chapter and sort
    const scoredChapters = Array.from(chapterScores.values())
      .map((ch) => ({
        ...ch,
        avgSimilarity: ch.totalSimilarity / ch.verseCount,
      }))
      .sort((a, b) => b.avgSimilarity - a.avgSimilarity)
      .slice(0, limit);

    const elapsed = Date.now() - startTime;
    console.log(
      `[Suggested Topics] Found ${scoredChapters.length} similar chapters in ${elapsed}ms`,
    );

    // Convert to footer card format
    const cards: FooterCard[] = scoredChapters.map((ch) => ({
      lens: "EXPLORE" as const,
      title: `${ch.bookName} ${ch.chapter}`,
      prompt: `Explore ${ch.bookName} ${ch.chapter} - a thematically connected chapter`,
    }));

    return cards;
  } catch (error) {
    console.error("[Suggested Topics] Failed to find similar chapters:", error);
    return [];
  }
}

/**
 * Find cross-testament connections (golden threads)
 *
 * Enhancement #7: Cross-Testament Golden Thread Cards
 * Uses fast approach: vector search limited to opposite testament
 */
export async function findGoldenThreads(
  anchorBookAbbrev: string,
  anchorChapter: number,
  limit: number = 2,
): Promise<FooterCard[]> {
  console.log(
    `[Suggested Topics] Finding golden threads for ${anchorBookAbbrev} ${anchorChapter}`,
  );

  const startTime = Date.now();
  const anchorTestament = getTestament(anchorBookAbbrev);
  const targetTestament = anchorTestament === "OT" ? "NT" : "OT";

  console.log(
    `[Suggested Topics] Looking for ${targetTestament} connections to ${anchorTestament} passage`,
  );

  // Get a summary of the anchor chapter to use as search query
  const { data: anchorVerses, error: anchorError } = await supabase
    .from("verses")
    .select("text")
    .eq("book_abbrev", anchorBookAbbrev)
    .eq("chapter", anchorChapter)
    .limit(5); // First 5 verses for summary

  if (anchorError || !anchorVerses || anchorVerses.length === 0) {
    console.warn("[Suggested Topics] Could not load anchor chapter");
    return [];
  }

  // Create a search query from the anchor chapter
  const chapterSummary = anchorVerses
    .map((v) => v.text)
    .join(" ")
    .substring(0, 500);

  if (!ENV.AI_API_KEY) {
    console.warn("[Suggested Topics] No OpenAI API key");
    return [];
  }

  try {
    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI client not configured");
    }
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: chapterSummary,
      ...(ENV.AI_PROVIDER === "groq"
        ? {}
        : { dimensions: EMBEDDING_DIMENSIONS }),
    });

    const queryEmbedding = response.data[0].embedding;

    // Search for similar verses, but ONLY in the opposite testament
    const targetBooks =
      targetTestament === "OT" ? OLD_TESTAMENT_BOOKS : NEW_TESTAMENT_BOOKS;

    const { data: allVerses, error: searchError } = await supabase.rpc(
      "search_verses_by_embedding",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_limit: 50,
        similarity_threshold: 0.45, // Slightly lower threshold for cross-testament
      },
    );

    if (searchError || !allVerses) {
      console.error("[Suggested Topics] Vector search failed:", searchError);
      return [];
    }

    // Filter to only target testament
    const similarVerses = allVerses.filter((v: VerseSearchResult) =>
      targetBooks.has(v.book_abbrev),
    );

    // Group results by chapter
    const chapterScores = new Map<
      string,
      {
        book: string;
        bookName: string;
        chapter: number;
        totalSimilarity: number;
        verseCount: number;
      }
    >();

    for (const verse of similarVerses) {
      const key = `${verse.book_abbrev}|${verse.chapter}`;
      const existing = chapterScores.get(key);

      if (existing) {
        existing.totalSimilarity += verse.similarity;
        existing.verseCount++;
      } else {
        chapterScores.set(key, {
          book: verse.book_abbrev,
          bookName: verse.book_name,
          chapter: verse.chapter,
          totalSimilarity: verse.similarity,
          verseCount: 1,
        });
      }
    }

    // Calculate average similarity per chapter and sort
    const scoredChapters = Array.from(chapterScores.values())
      .map((ch) => ({
        ...ch,
        avgSimilarity: ch.totalSimilarity / ch.verseCount,
      }))
      .sort((a, b) => b.avgSimilarity - a.avgSimilarity)
      .slice(0, limit);

    const elapsed = Date.now() - startTime;
    console.log(
      `[Suggested Topics] Found ${scoredChapters.length} golden threads in ${elapsed}ms`,
    );

    // Convert to footer card format with golden thread prompts
    const cards: FooterCard[] = scoredChapters.map((ch) => {
      const prompt =
        anchorTestament === "OT"
          ? `Trace how ${ch.bookName} ${ch.chapter} fulfills or echoes themes from this chapter`
          : `Discover how this chapter connects to its ${targetTestament} foundation in ${ch.bookName} ${ch.chapter}`;

      return {
        lens: "GOLDEN" as const,
        title: `${ch.bookName} ${ch.chapter}`,
        prompt,
      };
    });

    return cards;
  } catch (error) {
    console.error("[Suggested Topics] Failed to find golden threads:", error);
    return [];
  }
}

/**
 * Generate suggested topic cards for chapter footer
 * Returns footer-compatible cards that can be merged with LLM-generated cards
 */
export async function generateSuggestedCards(
  anchorBookAbbrev: string,
  anchorChapter: number,
): Promise<FooterCard[]> {
  console.log(
    `[Suggested Topics] Generating footer cards for ${anchorBookAbbrev} ${anchorChapter}`,
  );

  const startTime = Date.now();

  // Run both types of suggestions in parallel
  const [exploreCards, goldenCards] = await Promise.all([
    findSimilarChapters(anchorBookAbbrev, anchorChapter, 1), // Just 1 explore card
    findGoldenThreads(anchorBookAbbrev, anchorChapter, 2), // 2 golden thread cards
  ]);

  // Golden threads first, then explore cards
  const allCards = [...goldenCards, ...exploreCards];

  const elapsed = Date.now() - startTime;
  console.log(
    `[Suggested Topics] ✅ Generated ${allCards.length} footer cards in ${elapsed}ms`,
  );

  return allCards;
}
