import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { getVerse } from "../bible/bibleService";
import { VerseRef } from "../bible/types";

const router = Router();

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
    const verse = await getVerse(verseRef);

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

export default router;
