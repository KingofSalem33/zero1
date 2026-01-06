import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import { ENV } from "../env";
import { runModel, type RunModelResult } from "../ai/runModel";
import { SYNOPSIS_V1 } from "../prompts";
import { extractTokenUsage, logTokenUsage } from "../utils/telemetry";

const router = Router();

const formatVerseReference = (
  book: string,
  chapter: number,
  verses: number[],
): string => {
  const normalized = Array.from(new Set(verses)).sort((a, b) => a - b);
  if (!normalized.length) {
    return `${book} ${chapter}`;
  }
  const isContiguous = normalized.every(
    (num, index) => index === 0 || num === normalized[index - 1] + 1,
  );
  if (isContiguous) {
    return `${book} ${chapter}:${normalized[0]}-${normalized[normalized.length - 1]}`;
  }
  return `${book} ${chapter}:${normalized.join(",")}`;
};

// Validation schema for synopsis request
const synopsisRequestSchema = z.object({
  text: z.string().min(1).max(10000), // Max 10k characters for the input text
  maxWords: z.number().min(10).max(200).optional().default(34),
  book: z.string().optional(),
  chapter: z.number().optional(),
  verse: z.number().optional(),
  verses: z.array(z.number().min(1)).optional(),
});

// POST /api/synopsis - Generate a concise synopsis of highlighted text
router.post("/", readOnlyLimiter, async (req, res) => {
  try {
    const { text, maxWords, book, chapter, verse, verses } =
      synopsisRequestSchema.parse(req.body);

    // Check if OpenAI client is available
    if (!ENV.OPENAI_API_KEY) {
      return res.status(503).json({
        error: {
          message: "Synopsis service not configured",
          type: "service_unavailable",
          code: "synopsis_not_configured",
        },
      });
    }

    // Generate synopsis using GPT-5-nano with scriptural context
    const result = (await Promise.race([
      runModel(
        [
          {
            role: "system",
            content: SYNOPSIS_V1.buildSystem({ maxWords }),
          },
          {
            role: "user",
            content: SYNOPSIS_V1.buildUser(text, maxWords),
          },
        ],
        {
          model: ENV.OPENAI_FAST_MODEL,
          verbosity: "medium",
        },
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Synopsis request timed out after 15s")),
          15000,
        ),
      ),
    ])) as RunModelResult;

    // Extract the synopsis from the response
    const synopsis = result.text || "Unable to generate synopsis.";

    // Log token usage for telemetry
    const tokenUsage = extractTokenUsage(
      result,
      "/api/synopsis",
      ENV.OPENAI_FAST_MODEL,
      "synopsis-v1",
    );
    if (tokenUsage) {
      logTokenUsage(tokenUsage);
    }

    const normalizedVerses = Array.isArray(verses)
      ? Array.from(
          new Set(verses.filter((num) => Number.isFinite(num) && num > 0)),
        ).sort((a, b) => a - b)
      : [];
    const cleanBook = typeof book === "string" ? book.trim() : "";
    const resolvedChapter = Number.isFinite(chapter) ? (chapter as number) : 0;
    const hasBookChapter = cleanBook.length > 0 && resolvedChapter > 0;
    const resolvedVerse =
      Number.isFinite(verse) && verse > 0
        ? verse
        : normalizedVerses.length === 1
          ? normalizedVerses[0]
          : undefined;

    const versePayload =
      hasBookChapter && resolvedVerse
        ? {
            book: cleanBook,
            chapter: resolvedChapter,
            verse: resolvedVerse,
            reference: `${cleanBook} ${resolvedChapter}:${resolvedVerse}`,
          }
        : undefined;

    const versesPayload =
      hasBookChapter && normalizedVerses.length > 1
        ? {
            book: cleanBook,
            chapter: resolvedChapter,
            verses: normalizedVerses,
            reference: formatVerseReference(
              cleanBook,
              resolvedChapter,
              normalizedVerses,
            ),
          }
        : undefined;

    // Return the synopsis
    return res.json({
      synopsis,
      wordCount: synopsis.split(/\s+/).length,
      ...(versePayload ? { verse: versePayload } : {}),
      ...(versesPayload ? { verses: versesPayload } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Synopsis validation error:", error.errors);
      return res.status(400).json({
        error: {
          message: "Invalid request parameters",
          type: "invalid_request_error",
          code: "validation_error",
          details: error.errors,
        },
      });
    }

    console.error("Synopsis generation error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to generate synopsis",
        type: "internal_server_error",
        code: "synopsis_generation_failed",
      },
    });
  }
});

export default router;
