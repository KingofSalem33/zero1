import { Router, type Response } from "express";
import { createHash } from "crypto";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import { ENV } from "../env";
import { runModel, type RunModelResult } from "../ai/runModel";
import { runModelStream } from "../ai/runModelStream";
import { SYNOPSIS_V1 } from "../prompts";
import { extractTokenUsage, logTokenUsage } from "../utils/telemetry";
import { getProfiler, profileTime } from "../profiling/requestProfiler";
import { getCache } from "../infrastructure/cache/cacheInstance";
import { supabase } from "../db";

const router = Router();
const SYNOPSIS_INPUT_CHAR_LIMIT = 2200;
const SYNOPSIS_TIMEOUT_MS = 30000;
const SYNOPSIS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
const SYNOPSIS_CACHE_PREFIX = "synopsis:v1";
const synopsisCache = getCache();
const synopsisInFlight = new Map<string, Promise<SynopsisResponsePayload>>();

const clampSynopsisInput = (
  text: string,
  charLimit: number = SYNOPSIS_INPUT_CHAR_LIMIT,
): string => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= charLimit) return cleaned;

  // Preserve both opening and closing context for long highlights.
  const headSize = Math.floor(charLimit * 0.65);
  const tailSize = Math.max(120, charLimit - headSize - 7);
  const head = cleaned.slice(0, headSize).trim();
  const tail = cleaned.slice(-tailSize).trim();
  return `${head} [...] ${tail}`;
};

type VersePayload = {
  book: string;
  chapter: number;
  verse: number;
  reference: string;
};

type VersesPayload = {
  book: string;
  chapter: number;
  verses: number[];
  reference: string;
};

type SynopsisResponsePayload = {
  synopsis: string;
  wordCount: number;
  verse?: VersePayload;
  verses?: VersesPayload;
};

const toStableTextFingerprint = (text: string): string =>
  createHash("sha256")
    .update(text.replace(/\s+/g, " ").trim().toLowerCase())
    .digest("hex")
    .slice(0, 20);

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

const toReferenceSignature = ({
  cleanBook,
  resolvedChapter,
  resolvedVerse,
  normalizedVerses,
}: {
  cleanBook: string;
  resolvedChapter: number;
  resolvedVerse?: number;
  normalizedVerses: number[];
}): string => {
  if (!cleanBook || resolvedChapter <= 0) return "none";
  if (normalizedVerses.length > 1) {
    return `${cleanBook.toLowerCase()}|${resolvedChapter}|${normalizedVerses.join(",")}`;
  }
  if (resolvedVerse && resolvedVerse > 0) {
    return `${cleanBook.toLowerCase()}|${resolvedChapter}|${resolvedVerse}`;
  }
  return `${cleanBook.toLowerCase()}|${resolvedChapter}`;
};

const buildSynopsisCacheKey = ({
  synopsisModel,
  maxWords,
  synopsisInput,
  cleanBook,
  resolvedChapter,
  resolvedVerse,
  normalizedVerses,
}: {
  synopsisModel: string;
  maxWords: number;
  synopsisInput: string;
  cleanBook: string;
  resolvedChapter: number;
  resolvedVerse?: number;
  normalizedVerses: number[];
}): string => {
  const promptVersion = SYNOPSIS_V1.version ?? "unknown";
  const textFingerprint = toStableTextFingerprint(synopsisInput);
  const referenceSignature = toReferenceSignature({
    cleanBook,
    resolvedChapter,
    resolvedVerse,
    normalizedVerses,
  });
  return [
    SYNOPSIS_CACHE_PREFIX,
    `p${promptVersion}`,
    `m${synopsisModel}`,
    `w${maxWords}`,
    `r${referenceSignature}`,
    `t${textFingerprint}`,
  ].join(":");
};

const buildSynopsisPayload = ({
  synopsis,
  cleanBook,
  resolvedChapter,
  resolvedVerse,
  normalizedVerses,
}: {
  synopsis: string;
  cleanBook: string;
  resolvedChapter: number;
  resolvedVerse?: number;
  normalizedVerses: number[];
}): SynopsisResponsePayload => {
  const versePayload: VersePayload | undefined =
    cleanBook && resolvedChapter > 0 && resolvedVerse
      ? {
          book: cleanBook,
          chapter: resolvedChapter,
          verse: resolvedVerse,
          reference: `${cleanBook} ${resolvedChapter}:${resolvedVerse}`,
        }
      : undefined;

  const versesPayload: VersesPayload | undefined =
    cleanBook && resolvedChapter > 0 && normalizedVerses.length > 1
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

  return {
    synopsis,
    wordCount: synopsis.split(/\s+/).length,
    ...(versePayload ? { verse: versePayload } : {}),
    ...(versesPayload ? { verses: versesPayload } : {}),
  };
};

const acceptsEventStream = (acceptHeader?: string): boolean =>
  typeof acceptHeader === "string" &&
  acceptHeader.includes("text/event-stream");

const initializeSseResponse = (res: Response): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
};

const sendSseEvent = (res: Response, event: string, data: unknown): void => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof (res as Response & { flush?: () => void }).flush === "function") {
    (res as Response & { flush?: () => void }).flush?.();
  }
};

const finalizeSynopsisText = (rawText: string, maxWords: number): string => {
  let synopsis =
    typeof rawText === "string" && rawText.trim().length > 0
      ? rawText.trim()
      : "Unable to generate synopsis.";
  const words = synopsis.split(/\s+/);
  if (words.length <= maxWords) {
    return synopsis;
  }

  const truncated = words.slice(0, maxWords).join(" ");
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("? "),
    truncated.lastIndexOf("! "),
  );
  if (lastSentenceEnd > truncated.length * 0.4) {
    return truncated.substring(0, lastSentenceEnd + 1).trim();
  }

  synopsis = truncated.trim();
  if (!synopsis.endsWith(".")) synopsis += ".";
  return synopsis;
};

// Validation schema for synopsis request
const synopsisRequestSchema = z.object({
  text: z.string().min(1).max(10000), // Max 10k characters for the input text
  maxWords: z.number().min(10).max(200).optional().default(34),
  book: z.string().optional(),
  chapter: z.number().optional(),
  verse: z.number().optional(),
  verses: z.array(z.number().min(1)).optional(),
  pericopeTitle: z.string().optional(),
  pericopeType: z.string().optional(),
  pericopeThemes: z.array(z.string()).optional(),
});

// POST /api/synopsis - Generate a concise synopsis of highlighted text
router.post("/", readOnlyLimiter, async (req, res) => {
  const wantsStream = acceptsEventStream(req.headers.accept);
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("synopsis");
    profiler?.markHandlerStart();

    const {
      text,
      maxWords,
      book,
      chapter,
      verse,
      verses,
      pericopeTitle: clientPericopeTitle,
      pericopeType: clientPericopeType,
      pericopeThemes: clientPericopeThemes,
    } = await profileTime(
      "synopsis.zod_parse",
      () => synopsisRequestSchema.parse(req.body),
      { file: "routes/synopsis.ts", fn: "synopsisRequestSchema.parse" },
    );
    const synopsisInput = clampSynopsisInput(text);

    // Check if OpenAI client is available
    if (!ENV.AI_API_KEY) {
      return res.status(503).json({
        error: {
          message: "Synopsis service not configured",
          type: "service_unavailable",
          code: "synopsis_not_configured",
        },
      });
    }

    const normalizedVerses = Array.isArray(verses)
      ? Array.from(
          new Set(verses.filter((num) => Number.isFinite(num) && num > 0)),
        ).sort((a, b) => a - b)
      : [];
    const cleanBook = typeof book === "string" ? book.trim() : "";
    const resolvedChapter = Number.isFinite(chapter) ? (chapter as number) : 0;
    const parsedVerse =
      typeof verse === "number" && Number.isFinite(verse) ? verse : undefined;
    const resolvedVerse =
      typeof parsedVerse === "number" && parsedVerse > 0
        ? parsedVerse
        : normalizedVerses.length === 1
          ? normalizedVerses[0]
          : undefined;

    // Synopsis favors responsiveness and answer quality over lowest-cost tier.
    const synopsisTimeoutMs = SYNOPSIS_TIMEOUT_MS;
    const synopsisModel = ENV.OPENAI_SMART_MODEL || ENV.OPENAI_MODEL_NAME;
    const cacheKey = buildSynopsisCacheKey({
      synopsisModel,
      maxWords,
      synopsisInput,
      cleanBook,
      resolvedChapter,
      resolvedVerse,
      normalizedVerses,
    });

    const cached = await profileTime(
      "synopsis.cache_get",
      () => synopsisCache.get<SynopsisResponsePayload>(cacheKey),
      {
        file: "infrastructure/cache/cacheInstance.ts",
        fn: "getCache",
        await: "cache.get",
      },
    );
    if (cached) {
      if (wantsStream) {
        initializeSseResponse(res);
        sendSseEvent(res, "content", { delta: cached.synopsis });
        sendSseEvent(res, "done", cached);
        res.end();
        return;
      }
      return res.json(cached);
    }

    const sharedInFlight = synopsisInFlight.get(cacheKey);
    if (sharedInFlight) {
      const sharedPayload = await sharedInFlight;
      if (wantsStream) {
        initializeSseResponse(res);
        sendSseEvent(res, "content", { delta: sharedPayload.synopsis });
        sendSseEvent(res, "done", sharedPayload);
        res.end();
        return;
      }
      return res.json(sharedPayload);
    }

    // Resolve pericope context: use client-supplied data, or look up server-side
    let pericopeContext = "";
    if (clientPericopeTitle) {
      const parts = [
        `Narrative section: "${clientPericopeTitle}"`,
        clientPericopeType ? `(${clientPericopeType})` : "",
        clientPericopeThemes?.length
          ? `— themes: ${clientPericopeThemes.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      pericopeContext = parts;
    } else if (resolvedVerse && cleanBook && resolvedChapter) {
      // Server-side lookup: find the pericope for this verse
      try {
        const { data: verseRow } = await supabase
          .from("verses")
          .select("id")
          .eq("book_name", cleanBook)
          .eq("chapter", resolvedChapter)
          .eq("verse", resolvedVerse)
          .limit(1)
          .single();
        if (verseRow?.id) {
          const { data: mapRow } = await supabase
            .from("verse_pericope_map")
            .select("pericope_id")
            .eq("verse_id", verseRow.id)
            .eq("source", "SIL_AI")
            .limit(1)
            .single();
          if (mapRow?.pericope_id) {
            const { data: pericope } = await supabase
              .from("pericopes")
              .select("title, title_generated, pericope_type, themes")
              .eq("id", mapRow.pericope_id)
              .single();
            if (pericope) {
              const title = pericope.title_generated || pericope.title;
              const parts = [
                title ? `Narrative section: "${title}"` : "",
                pericope.pericope_type ? `(${pericope.pericope_type})` : "",
                Array.isArray(pericope.themes) && pericope.themes.length > 0
                  ? `— themes: ${pericope.themes.join(", ")}`
                  : "",
              ]
                .filter(Boolean)
                .join(" ");
              pericopeContext = parts;
            }
          }
        }
      } catch {
        // Pericope lookup is best-effort — don't fail the synopsis
      }
    }

    const pericopeEnrichedInput = pericopeContext
      ? `${synopsisInput}\n\n[Context: ${pericopeContext}. Use this narrative context to ground your insight in the broader story if it deepens understanding — do not reference it unless it adds genuine value.]`
      : synopsisInput;

    const generationPromise = (async (): Promise<SynopsisResponsePayload> => {
      let synopsis = "Unable to generate synopsis.";
      if (wantsStream) {
        initializeSseResponse(res);
        const streamedText = await profileTime(
          "synopsis.runModelStream",
          () =>
            runModelStream(
              res,
              [
                {
                  role: "system",
                  content: SYNOPSIS_V1.buildSystem({ maxWords }),
                },
                {
                  role: "user",
                  content: SYNOPSIS_V1.buildUser(
                    pericopeEnrichedInput,
                    maxWords,
                  ),
                },
              ],
              {
                model: synopsisModel,
                maxOutputTokens: Math.min(256, Math.max(80, maxWords * 4)),
                taskType: "synopsis",
                verbosity: "low",
                promptCacheKey: `synopsis-v${SYNOPSIS_V1.version}`,
                keepAlive: true,
                enableValidation: false,
                enableGuardrails: false,
              },
            ),
          {
            file: "ai/runModelStream.ts",
            fn: "runModelStream",
            await: "client.responses.create",
            model: synopsisModel,
          },
        );
        synopsis = finalizeSynopsisText(streamedText, maxWords);
      } else {
        const result = (await profileTime(
          "synopsis.runModel",
          () =>
            Promise.race([
              runModel(
                [
                  {
                    role: "system",
                    content: SYNOPSIS_V1.buildSystem({ maxWords }),
                  },
                  {
                    role: "user",
                    content: SYNOPSIS_V1.buildUser(
                      pericopeEnrichedInput,
                      maxWords,
                    ),
                  },
                ],
                {
                  model: synopsisModel,
                  taskType: "synopsis",
                  verbosity: "low",
                  promptCacheKey: `synopsis-v${SYNOPSIS_V1.version}`,
                },
              ),
              new Promise((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Synopsis request timed out after ${Math.round(synopsisTimeoutMs / 1000)}s`,
                      ),
                    ),
                  synopsisTimeoutMs,
                ),
              ),
            ]),
          {
            file: "ai/runModel.ts",
            fn: "runModel",
            await: "client.responses.create",
            model: synopsisModel,
          },
        )) as RunModelResult;

        synopsis = finalizeSynopsisText(result.text, maxWords);

        const tokenUsage = extractTokenUsage(
          result,
          "/api/synopsis",
          synopsisModel,
          "synopsis-v1",
        );
        if (tokenUsage) {
          logTokenUsage(tokenUsage);
        }
      }

      const payload = buildSynopsisPayload({
        synopsis,
        cleanBook,
        resolvedChapter,
        resolvedVerse,
        normalizedVerses,
      });

      await profileTime(
        "synopsis.cache_set",
        () => synopsisCache.set(cacheKey, payload, SYNOPSIS_CACHE_TTL_SECONDS),
        {
          file: "infrastructure/cache/cacheInstance.ts",
          fn: "getCache",
          await: "cache.set",
        },
      );

      return payload;
    })();

    synopsisInFlight.set(cacheKey, generationPromise);
    try {
      const payload = await generationPromise;
      if (wantsStream) {
        sendSseEvent(res, "done", payload);
        res.end();
        return;
      }
      return res.json(payload);
    } finally {
      synopsisInFlight.delete(cacheKey);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Synopsis validation error:", error.errors);
      if (wantsStream && (res.headersSent || res.writableEnded)) {
        if (!res.writableEnded) {
          sendSseEvent(res, "error", { message: "Invalid request parameters" });
          res.end();
        }
        return;
      }
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
    if (wantsStream && (res.headersSent || res.writableEnded)) {
      if (!res.writableEnded) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Failed to generate synopsis";
        sendSseEvent(res, "error", { message });
        res.end();
      }
      return;
    }
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
