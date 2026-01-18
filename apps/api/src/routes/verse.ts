import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { VerseRef } from "../bible/types";
import { CachedBibleService } from "../bible/CachedBibleService";
import { getCache } from "../infrastructure/cache/cacheInstance";
import { getCrossReferences } from "../bible/crossReferences";
import { getProfiler, profileTime } from "../profiling/requestProfiler";

const router = Router();

// Create cached Bible service instance
const cachedBibleService = new CachedBibleService(getCache(), 3600); // 1 hour TTL

/**
 * Parse a verse reference string like "John 3:16" or "1 Peter 5:7"
 * Returns VerseRef object or null if invalid
 */
function parseReference(reference: string): VerseRef | null {
  // Match patterns like:
  // "John 3:16"
  // "1 Peter 5:7"
  // "Genesis 1:1"
  const match = reference.match(/^([123]?\s*[A-Za-z\s]+)\s+(\d+):(\d+)$/);

  if (!match) {
    return null;
  }

  const book = match[1].trim();
  const chapter = parseInt(match[2], 10);
  const verse = parseInt(match[3], 10);

  if (isNaN(chapter) || isNaN(verse)) {
    return null;
  }

  return { book, chapter, verse };
}

// GET /api/verse/:reference - Get verse text by reference
router.get("/:reference", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("verse_get");
    profiler?.markHandlerStart();

    const { reference } = req.params;

    // Decode URL encoding (spaces become %20)
    const decodedRef = decodeURIComponent(reference);

    // Parse the reference
    const verseRef = parseReference(decodedRef);

    if (!verseRef) {
      return res.status(400).json({
        error: {
          message: `Invalid verse reference format: "${decodedRef}". Expected format: "Book Chapter:Verse" (e.g., "John 3:16")`,
          type: "validation_error",
          code: "invalid_reference",
        },
      });
    }

    // Fetch the verse
    const verse = await profileTime(
      "verse.getVerse",
      () => cachedBibleService.getVerse(verseRef),
      {
        file: "bible/CachedBibleService.ts",
        fn: "getVerse",
        await: "cachedBibleService.getVerse",
      },
    );

    if (!verse) {
      return res.status(404).json({
        error: {
          message: `Verse not found: ${decodedRef}`,
          type: "not_found_error",
          code: "verse_not_found",
        },
      });
    }

    return res.json({
      reference: `${verse.book} ${verse.chapter}:${verse.verse}`,
      text: verse.text,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
    });
  } catch (error) {
    console.error("Get verse error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to get verse",
        type: "internal_server_error",
        code: "get_verse_failed",
      },
    });
  }
});

// GET /api/verse/:reference/cross-references - Get cross-references for a verse
router.get(
  "/:reference/cross-references",
  readOnlyLimiter,
  async (req, res) => {
    try {
      const profiler = getProfiler();
      profiler?.setPipeline("verse_cross_refs");
      profiler?.markHandlerStart();

      const { reference } = req.params;

      // Decode URL encoding (spaces become %20)
      const decodedRef = decodeURIComponent(reference);

      // Parse the reference
      const verseRef = parseReference(decodedRef);

      if (!verseRef) {
        return res.status(400).json({
          error: {
            message: `Invalid verse reference format: "${decodedRef}". Expected format: "Book Chapter:Verse" (e.g., "John 3:16")`,
            type: "validation_error",
            code: "invalid_reference",
          },
        });
      }

      // Get cross-references from OpenBible.info dataset
      const crossRefs = await profileTime(
        "verse.getCrossReferences",
        () => getCrossReferences(verseRef),
        {
          file: "bible/crossReferences.ts",
          fn: "getCrossReferences",
          await: "getCrossReferences",
        },
      );

      // Return the references
      return res.json({
        reference: `${verseRef.book} ${verseRef.chapter}:${verseRef.verse}`,
        crossReferences: crossRefs,
        count: crossRefs.length,
      });
    } catch (error) {
      console.error("Get cross-references error:", error);
      return res.status(500).json({
        error: {
          message: "Failed to get cross-references",
          type: "internal_server_error",
          code: "get_cross_references_failed",
        },
      });
    }
  },
);

export default router;
