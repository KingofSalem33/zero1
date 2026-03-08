import dotenv from "dotenv";
import path from "path";

// Load .env from api root; fall back to apps/ and repo root if needed
const envPaths = [
  path.resolve(__dirname, "..", ".env"),
  path.resolve(__dirname, "..", "..", ".env"),
  path.resolve(__dirname, "..", "..", "..", ".env"),
];
for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
  if (process.env.SUPABASE_URL) {
    break;
  }
}

// Initialize Sentry AFTER loading env vars
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  enabled: process.env.NODE_ENV === "production", // Only enable in production
  integrations: [nodeProfilingIntegration()],
  // Performance Monitoring
  tracesSampleRate: 1.0, // Capture 100% of transactions for performance monitoring
  // Profiling
  profilesSampleRate: 1.0, // Capture 100% of profiles
});

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import { ENV } from "./env";
import ttsRouter from "./routes/tts";
import synopsisRouter from "./routes/synopsis";
import rootTranslationRouter from "./routes/root-translation";
import semanticConnectionRouter from "./routes/semantic-connection";
import discoverConnectionsRouter from "./routes/discover-connections";
import pericopeRouter from "./routes/pericope";
import { generateSuggestedCards } from "./bible/suggestedTopics";
import {
  rankVersesBySimilarity,
  type ReferenceVisualBundle,
  type ReferenceTreeNode,
  buildMultiAnchorTree,
  resolveAnchor,
  resolveMultipleAnchors,
  deduplicateVerses,
} from "./bible/expandingRingExegesis";
import { buildPericopeScopeForVerse } from "./bible/pericopeGraphWalker";
import { buildVisualBundle } from "./bible/graphWalker";
import { getBook } from "./bible/bibleService";
import bookmarksRouter from "./routes/bookmarks";
import libraryRouter from "./routes/library";
import verseRouter from "./routes/verse";
import bibleStudyRouter from "./routes/bible-study";
import highlightsRouter from "./routes/highlights";
import { runModel } from "./ai/runModel";
import { runModelStream } from "./ai/runModelStream"; // Used in /api/chat for streaming when Accept: text/event-stream
import { selectRelevantTools } from "./ai/tools/selectTools"; // Still used in /api/chat endpoint
import { explainScriptureWithKernelStream } from "./bible/expandingRingExegesis";
import { buildReferenceTree } from "./bible/referenceGenealogy";
import { getVerseId } from "./bible/graphWalker";
import { parseExplicitReference } from "./bible/referenceParser";
import {
  chatRequestSchema,
  chatJsonResponseSchema,
  chatResponseJsonSchema,
} from "./ai/schemas";
import { handleFileUpload, listFiles, deleteFile } from "./files";
import {
  getFacts,
  addFact,
  pushToThread,
  clearFacts,
  flushMemoryStore,
  startMemoryCleanup,
  stopMemoryCleanup,
} from "./memory";
import {
  logUserSignal,
  getFeedbackStats,
  flushFeedbackStore,
  type FeedbackSignal,
} from "./feedback";
import { destroyCache } from "./infrastructure/cache/cacheInstance";
import { optionalAuth, requireAuth } from "./middleware/auth";
import { checkConnectionHealth } from "./db";
import {
  apiLimiter,
  aiLimiter,
  readOnlyLimiter,
  strictLimiter,
  uploadLimiter,
} from "./middleware/rateLimit";
import {
  profilerMiddleware,
  getProfiler,
  profileTime,
} from "./profiling/requestProfiler";
import {
  buildResponseStrategy,
  buildSystemPrompt,
} from "./prompts/system/systemPrompts";

function buildSystemPromptOptimized({
  userFacts,
  message,
  format,
}: {
  userFacts?: string[];
  message: string;
  format?: string;
}): {
  systemPrompt: string;
  userContext: string | null;
} {
  const strategy = buildResponseStrategy({
    mode: "exegesis_long",
    userPrompt: message,
  });
  let systemPrompt = buildSystemPrompt(strategy);
  if (format === "json") {
    systemPrompt +=
      "\n\nIf the user asks for structured output, respond as JSON that matches this schema: {answer:string, sources?:string[]}.";
  }
  const userContext =
    userFacts && userFacts.length > 0
      ? `Known facts about user:\n- ${userFacts.join("\n- ")}\nOnly use when relevant.`
      : null;
  return { systemPrompt, userContext };
}

// Extract URLs from text using regex
function extractUrls(text: string): string[] {
  const urlRegex =
    /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&=]*)/g;
  const matches = text.match(urlRegex);
  return matches ? [...new Set(matches)] : []; // Remove duplicates
}

// Deduplicate and combine URLs
function combineAndDedupeUrls(
  existingUrls: string[],
  extractedUrls: string[],
): string[] {
  const allUrls = [...existingUrls, ...extractedUrls];
  return [...new Set(allUrls)]; // Remove duplicates
}

const app = express();
const allowedCorsOrigins = new Set(ENV.CORS_ALLOWED_ORIGINS);

app.use(profilerMiddleware);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, server-to-server).
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");
      if (allowedCorsOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      console.warn(`[CORS] Rejected origin: ${origin}`);
      callback(null, false);
    },
  }),
);
app.use(morgan("combined"));
// Add compression with SSE exclusion
// Skip compression for SSE streams (text/event-stream) to ensure immediate delivery
app.use(
  compression({
    filter: (req, res) => {
      // Don't compress SSE responses
      if (res.getHeader("Content-Type") === "text/event-stream") {
        return false;
      }
      // Use default compression filter for everything else
      return compression.filter(req, res);
    },
  }),
);
app.use(express.json({ limit: "10mb" })); // Increased limit for visual bundle data

// Apply global API rate limiting
app.use("/api/", apiLimiter);

// V1 Project routes (DEPRECATED - Use V2 routes at /api/v2/projects instead)
// app.use("/api/projects", optionalAuth, projectsRouter);

// Mount thread routes (temporarily optional auth for testing)
// app.use("/api/threads", optionalAuth, threadsRouter); // Removed - legacy feature

// Mount TTS routes (text-to-speech)
app.use("/api/tts", optionalAuth, ttsRouter);

// Mount synopsis routes (text analysis for highlighting)
app.use("/api/synopsis", optionalAuth, synopsisRouter);

// Mount root translation routes (Strong's Concordance)
app.use("/api/root-translation", optionalAuth, rootTranslationRouter);

// Mount bookmark routes
app.use("/api/bookmarks", requireAuth, bookmarksRouter);
app.use("/api/library", requireAuth, libraryRouter);

// Mount verse routes (fetch individual verses by reference)
app.use("/api/verse", optionalAuth, verseRouter);

// Bible book endpoint for mobile/local caching
app.get(
  "/api/bible/book/:book",
  optionalAuth,
  readOnlyLimiter,
  async (req, res) => {
    try {
      const profiler = getProfiler();
      profiler?.setPipeline("bible_book_get");
      profiler?.markHandlerStart();

      const requestedBook = decodeURIComponent(req.params.book ?? "").trim();
      if (!requestedBook) {
        return res.status(400).json({ error: "Book parameter is required" });
      }

      const book = await profileTime(
        "bible.getBook",
        () => getBook(requestedBook),
        {
          file: "bible/bibleService.ts",
          fn: "getBook",
          await: "getBook",
        },
      );

      if (!book) {
        return res
          .status(404)
          .json({ error: `Book not found: ${requestedBook}` });
      }

      const payload = {
        book: book.name,
        chapters: book.chapters.map((chapter, chapterIndex) => ({
          chapter: chapterIndex + 1,
          verses: chapter.map((text, verseIndex) => ({
            verse: verseIndex + 1,
            text,
          })),
        })),
      };

      return res.json(payload);
    } catch (error) {
      console.error("Bible book fetch error:", error);
      return res.status(500).json({ error: "Failed to fetch Bible book" });
    }
  },
);

// Mount bible study routes (fast text-only mode)
app.use("/api/bible-study", optionalAuth, aiLimiter, bibleStudyRouter);

// Mount semantic connection routes (AI synopsis of verse connections)
app.use("/api/semantic-connection", optionalAuth, semanticConnectionRouter);

// Mount pericope routes (narrative-level search)
app.use("/api/pericope", optionalAuth, pericopeRouter);

// Mount highlights routes (cloud sync for Bible highlights)
app.use("/api/highlights", highlightsRouter);

// Mount connection discovery routes (LLM-discovered theological connections)
// Use aiLimiter (50/min) instead of apiLimiter (100/15min) for better dev experience
app.use(
  "/api/discover-connections",
  optionalAuth,
  aiLimiter,
  discoverConnectionsRouter,
);

// Chapter footer endpoint (test for Genesis 1)
app.get("/api/bible/chapter-footer", optionalAuth, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("chapter_footer");
    profiler?.markHandlerStart();

    const book = req.query.book as string;
    const chapter = parseInt(req.query.chapter as string);

    if (!book || isNaN(chapter)) {
      res.status(400).json({ error: "Missing book or chapter parameter" });
      return;
    }

    // Parse the book reference to get the abbreviation
    const parsed = parseExplicitReference(`${book} ${chapter}:1`);
    if (!parsed) {
      res.status(400).json({ error: `Invalid book name: ${book}` });
      return;
    }

    // Get anchor verse (first verse of chapter)
    const anchorId = await profileTime(
      "chapter_footer.getVerseId",
      () => getVerseId(parsed.book, chapter, 1),
      {
        file: "bible/graphWalker.ts",
        fn: "getVerseId",
        await: "getVerseId",
      },
    );
    if (!anchorId) {
      res.status(404).json({ error: `Could not find ${book} ${chapter}` });
      return;
    }

    // Build reference tree from graph (get more candidates for ranking)
    const tree = await profileTime(
      "chapter_footer.buildReferenceTree",
      () =>
        buildReferenceTree(anchorId, {
          maxDepth: 2,
          maxNodes: 50, // Get 50 candidates instead of 20
          maxChildrenPerNode: 999,
          userQuery: `${book} ${chapter}`, // Enable semantic ranking
        }),
      {
        file: "bible/referenceGenealogy.ts",
        fn: "buildReferenceTree",
        await: "buildReferenceTree",
      },
    );

    // Rank verses by semantic similarity to this chapter
    const rankedTree = await profileTime(
      "chapter_footer.rankVersesBySimilarity",
      () =>
        rankVersesBySimilarity(
          tree as ReferenceVisualBundle,
          `${book} ${chapter}`,
        ),
      {
        file: "bible/expandingRingExegesis.ts",
        fn: "rankVersesBySimilarity",
        await: "rankVersesBySimilarity",
      },
    );

    // Format top 15 MOST RELEVANT connected verses for LLM
    const connections = rankedTree.nodes
      .filter(
        (n: ReferenceTreeNode) =>
          !(n.book_name === book && n.chapter === chapter),
      )
      .slice(0, 15) // Now these are the BEST 15, not just the first 15
      .map(
        (n: ReferenceTreeNode) =>
          `[${n.book_name} ${n.chapter}:${n.verse}] "${n.text.substring(0, 100)}${n.text.length > 100 ? "..." : ""}"`,
      )
      .join("\n");

    const userMessage = `CHAPTER TO ANALYZE:
${book} ${chapter}

CONNECTED VERSES (from cross-reference graph):
${connections || "(No cross-references found in graph)"}

Generate a footer for this chapter based ONLY on the connected verses listed above.`;

    const systemPrompt = `Create "aha moment" exploration cards revealing hidden biblical connections readers would never find on their own.

**CONSTRAINTS**
- GRAPH-GROUNDED: Use ONLY the connected verses provided (no speculation)
- 4-6 cards per chapter
- Focus on non-obvious insights requiring scholarly depth
- Avoid surface-level observations (e.g., "both mention light")

**ORIENTATION (Two sentences)**
1. **Compression** (15-25 words): Sequential chapter flow using "then" and commas
2. **Core Insight** (8-12 words): Irreducible truth—strip everything away, what remains?

Example: "John declares the Word was God, shows the Word creating all things, then becoming flesh and dwelling among men, then people choosing to receive or reject Him. The eternal God became a man so we could see Him and believe."

**CARD TYPES (prioritize in order)**
1. **PROPHECY** - Prophecy fulfilled (OT → NT, messianic fulfillments)
2. **TYPOLOGY** - Similar story (types/shadows mirroring later fulfillment)
3. **THREAD** - Themes (same teaching, progression of ideas)
4. **PATTERN** - Structure (chiasms, sevens, repeated phrases)
5. **ROOTS** - Word study (Hebrew/Greek roots, key word meaning)
6. **WORLD** - Context (historical/cultural background)

**CARD QUALITY**
✅ "Let There Be Light → I Am the Light" (John echoing Genesis)
✅ "Seven Days, Seven Seals" (Creation pattern in Revelation)
❌ "Creation themes in Scripture" (too generic)
❌ "Historical context of Genesis" (not specific enough)

**TITLES & PROMPTS**
- Titles: Evocative, specific (3-7 words), tease the insight
- Prompts: Frame as discoveries: "Trace how...", "Why does...", "See how..." (NOT lectures)

**OUTPUT (JSON only)**
\`\`\`json
{
  "orientation": "[COMPRESSION]. [CORE INSIGHT].",
  "cards": [
    {
      "lens": "PROPHECY" | "TYPOLOGY" | "THREAD" | "PATTERN" | "ROOTS" | "WORLD",
      "title": "Evocative title",
      "prompt": "Discovery question"
    }
  ]
}
\`\`\`

Return ONLY valid JSON.`;

    // Generate with LLM
    const result = await profileTime(
      "chapter_footer.llm.runModel",
      () =>
        runModel(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          {
            toolSpecs: [],
            toolMap: {},
            model: ENV.OPENAI_SMART_MODEL,
            reasoningEffort: "low", // Explicit low reasoning for faster responses
            // Automatic in-memory caching (5-10 min) works for prompts > 1024 tokens
          },
        ),
      {
        file: "ai/runModel.ts",
        fn: "runModel",
        await: "client.responses.create",
      },
    );

    // Parse and return (strip markdown code fences if present)
    let jsonText = result.text.trim();

    // Remove markdown code fences if present
    if (jsonText.startsWith("```")) {
      jsonText = jsonText
        .replace(/^```(?:json)?\s*\n/, "")
        .replace(/\n```\s*$/, "");
    }

    const footer = JSON.parse(jsonText);

    console.log(
      `[Footer] LLM generated ${footer.cards.length} cards for ${book} ${chapter}`,
    );

    // Generate and append semantic-search-based suggested topic cards
    try {
      console.log(
        `[Footer] Generating suggested cards for ${parsed.book} ${chapter}...`,
      );

      const suggestedCards = await profileTime(
        "chapter_footer.generateSuggestedCards",
        () => generateSuggestedCards(parsed.book, chapter),
        {
          file: "bible/suggestedTopics.ts",
          fn: "generateSuggestedCards",
          await: "generateSuggestedCards",
        },
      );

      console.log(
        `[Footer] Generated ${suggestedCards.length} suggested cards`,
      );

      if (suggestedCards.length > 0) {
        footer.cards = [...footer.cards, ...suggestedCards];
        console.log(
          `[Footer] ✅ Total cards: ${footer.cards.length} (${footer.cards.length - suggestedCards.length} LLM + ${suggestedCards.length} suggested)`,
        );
      } else {
        console.warn("[Footer] No suggested cards generated");
      }
    } catch (error) {
      console.error("[Footer] Failed to generate suggested cards:", error);
      if (error instanceof Error) {
        console.error("[Footer] Error details:", error.message, error.stack);
      }
      // Continue without suggested cards - footer is still valid
    }

    // Add version to footer for cache busting
    footer._version = "2.1"; // Increment this to invalidate old caches

    res.json(footer);
  } catch (error) {
    console.error("Chapter footer error:", error);
    res.status(500).json({ error: "Failed to generate chapter footer" });
  }
});

// File endpoints (temporarily optional auth for testing)
app.post("/api/files", optionalAuth, uploadLimiter, handleFileUpload);

app.get("/api/files", optionalAuth, async (_req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("files_list");
    profiler?.markHandlerStart();

    const files = await profileTime("files.listFiles", () => listFiles(), {
      file: "files.ts",
      fn: "listFiles",
      await: "loadFileIndex",
    });
    res.json({ files });
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

app.delete("/api/files/:id", optionalAuth, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("files_delete");
    profiler?.markHandlerStart();

    const success = await profileTime(
      "files.deleteFile",
      () => deleteFile(req.params.id),
      {
        file: "files.ts",
        fn: "deleteFile",
        await: "deleteFile",
      },
    );

    if (!success) {
      return res.status(404).json({ error: "File not found" });
    }

    return res.json({ ok: true, message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting file:", error);
    return res.status(500).json({ error: "Failed to delete file" });
  }
});

// Memory endpoints (temporarily optional auth for testing)
app.get("/api/memory", optionalAuth, strictLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("memory_get");
    profiler?.markHandlerStart();

    const userId = req.query.userId as string;
    if (!userId) {
      return res
        .status(400)
        .json({ error: "userId query parameter is required" });
    }

    const facts = await profileTime("memory.getFacts", () => getFacts(userId), {
      file: "memory.ts",
      fn: "getFacts",
      await: "getFacts",
    });
    return res.json({ facts });
  } catch (error) {
    console.error("Get memory error:", error);
    return res.status(500).json({ error: "Failed to get memory" });
  }
});

app.post("/api/memory", optionalAuth, strictLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("memory_add");
    profiler?.markHandlerStart();

    const { userId, fact } = req.body;

    if (!userId || !fact) {
      return res.status(400).json({ error: "userId and fact are required" });
    }

    await profileTime("memory.addFact", () => addFact(userId, fact), {
      file: "memory.ts",
      fn: "addFact",
      await: "addFact",
    });
    const facts = await profileTime("memory.getFacts", () => getFacts(userId), {
      file: "memory.ts",
      fn: "getFacts",
      await: "getFacts",
    });
    return res.json({
      message: "Fact added successfully",
      facts,
    });
  } catch (error) {
    console.error("Add memory error:", error);
    return res.status(500).json({ error: "Failed to add memory" });
  }
});

app.delete("/api/memory", optionalAuth, strictLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("memory_clear");
    profiler?.markHandlerStart();

    const userId = req.query.userId as string;
    if (!userId) {
      return res
        .status(400)
        .json({ error: "userId query parameter is required" });
    }

    await profileTime("memory.clearFacts", () => clearFacts(userId), {
      file: "memory.ts",
      fn: "clearFacts",
      await: "clearFacts",
    });
    return res.json({ message: "Facts cleared successfully" });
  } catch (error) {
    console.error("Clear memory error:", error);
    return res.status(500).json({ error: "Failed to clear memory" });
  }
});

// Extract facts from recent conversations (AI-powered, use AI limiter)
app.post(
  "/api/memory/extract",
  optionalAuth,
  aiLimiter,
  express.json(),
  async (req, res) => {
    try {
      const profiler = getProfiler();
      profiler?.setPipeline("memory_extract");
      profiler?.markHandlerStart();

      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { getThread } = await profileTime(
        "memory.importThread",
        () => import("./memory.js"),
        {
          file: "memory.ts",
          fn: "getThread",
          await: "dynamic_import",
        },
      );

      // Get recent conversation thread
      const thread = await profileTime(
        "memory.getThread",
        () => getThread(userId),
        {
          file: "memory.ts",
          fn: "getThread",
          await: "getThread",
        },
      );

      if (thread.length === 0) {
        return res.json({
          message: "No conversation history found",
          facts: await getFacts(userId),
          extractedCount: 0,
        });
      }

      // Build conversation context for fact extraction
      const conversationText = thread
        .filter((msg: { role: string }) => msg.role === "user")
        .map((msg: { content: string }) => msg.content)
        .join("\n\n");

      // Use AI to extract facts from conversation
      const extractionPrompt = `Analyze this user's conversation history and extract key facts about them.
Focus on: preferences, skills, goals, constraints, past experiences, tools they use, languages they prefer, etc.
Return ONLY a JSON array of short, specific facts (one sentence each). Be concise and factual.

Conversation history:
${conversationText}

Return format: ["fact 1", "fact 2", "fact 3"]`;

      const result = await profileTime(
        "memory.extractFacts.llm",
        () =>
          runModel(
            [
              {
                role: "system",
                content:
                  "You extract key user facts from conversations. Return only a JSON array of strings.",
              },
              {
                role: "user",
                content: extractionPrompt,
              },
            ],
            { toolSpecs: [], toolMap: {} },
          ),
        {
          file: "ai/runModel.ts",
          fn: "runModel",
          await: "client.responses.create",
        },
      );

      // Parse extracted facts
      let extractedFacts: string[] = [];
      try {
        const parsed = JSON.parse(result.text);
        extractedFacts = Array.isArray(parsed)
          ? parsed.filter((f) => typeof f === "string" && f.trim())
          : [];
      } catch {
        console.error("Failed to parse extracted facts JSON");
      }

      // Add extracted facts to memory
      let addedCount = 0;
      for (const fact of extractedFacts) {
        const existingFacts = await profileTime(
          "memory.getFacts",
          () => getFacts(userId),
          {
            file: "memory.ts",
            fn: "getFacts",
            await: "getFacts",
          },
        );
        const isDuplicate = existingFacts.some(
          (existing) =>
            existing.toLowerCase().trim() === fact.toLowerCase().trim(),
        );

        if (!isDuplicate) {
          await profileTime("memory.addFact", () => addFact(userId, fact), {
            file: "memory.ts",
            fn: "addFact",
            await: "addFact",
          });
          addedCount++;
        }
      }

      const allFacts = await profileTime(
        "memory.getFacts",
        () => getFacts(userId),
        {
          file: "memory.ts",
          fn: "getFacts",
          await: "getFacts",
        },
      );

      return res.json({
        message: `Extracted ${addedCount} new facts`,
        facts: allFacts,
        extractedCount: addedCount,
      });
    } catch (error) {
      console.error("Extract facts error:", error);
      return res.status(500).json({ error: "Failed to extract facts" });
    }
  },
);

// Feedback collection endpoint
app.post("/api/feedback", optionalAuth, apiLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("feedback");
    profiler?.markHandlerStart();

    const { requestId, signal, details, userId } = req.body;

    if (!requestId || !signal) {
      return res
        .status(400)
        .json({ error: "requestId and signal are required" });
    }

    // Validate signal type
    const validSignals: FeedbackSignal[] = [
      "thumbs_up",
      "thumbs_down",
      "regenerate",
      "abandon",
      "correction",
      "expand",
      "copy",
      "share",
    ];

    if (!validSignals.includes(signal)) {
      return res.status(400).json({
        error: `Invalid signal. Must be one of: ${validSignals.join(", ")}`,
      });
    }

    await profileTime(
      "feedback.logUserSignal",
      () => logUserSignal(requestId, signal, details, userId),
      {
        file: "feedback.ts",
        fn: "logUserSignal",
        await: "logUserSignal",
      },
    );

    return res.json({
      ok: true,
      message: "Feedback recorded",
      requestId,
      signal,
    });
  } catch (error) {
    console.error("Feedback error:", error);
    return res.status(500).json({ error: "Failed to record feedback" });
  }
});

// Feedback stats endpoint (for monitoring)
app.get(
  "/api/feedback/stats",
  optionalAuth,
  strictLimiter,
  async (req, res) => {
    try {
      const profiler = getProfiler();
      profiler?.setPipeline("feedback_stats");
      profiler?.markHandlerStart();

      const since = req.query.since
        ? parseInt(req.query.since as string)
        : undefined;
      const userId = req.query.userId as string | undefined;

      const stats = await profileTime(
        "feedback.getFeedbackStats",
        () => getFeedbackStats({ since, userId }),
        {
          file: "feedback.ts",
          fn: "getFeedbackStats",
          await: "getFeedbackStats",
        },
      );

      return res.json(stats);
    } catch (error) {
      console.error("Feedback stats error:", error);
      return res.status(500).json({ error: "Failed to get feedback stats" });
    }
  },
);

app.get("/health", (_req, res) => {
  const profiler = getProfiler();
  profiler?.setPipeline("health");
  profiler?.markHandlerStart();
  res.json({
    ok: true,
    service: "api",
    version: "0.1.0",
  });
});

// Database health check endpoint
app.get("/api/health/db", async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("health_db");
    profiler?.markHandlerStart();

    const forceRefresh = req.query.force === "true";
    const health = await profileTime(
      "health_db.checkConnectionHealth",
      () => checkConnectionHealth(forceRefresh),
      {
        file: "db.ts",
        fn: "checkConnectionHealth",
        await: "checkConnectionHealth",
      },
    );
    res.status(health.healthy ? 200 : 503).json(health);
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      healthy: false,
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// Direct trace endpoint - returns visual bundle without chat streaming
app.post(
  "/api/trace",
  optionalAuth,
  aiLimiter,
  express.json(),
  async (req, res) => {
    console.log("[Trace] Request received:", {
      text: req.body?.text?.substring(0, 50),
    });
    try {
      const profiler = getProfiler();
      profiler?.setPipeline("trace");
      profiler?.markHandlerStart();

      const { text } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }

      // Resolve anchor verses from the selected text
      const anchorIds = await profileTime(
        "trace.resolveMultipleAnchors",
        () => resolveMultipleAnchors(text, 3),
        {
          file: "bible/expandingRingExegesis.ts",
          fn: "resolveMultipleAnchors",
          await: "resolveMultipleAnchors",
        },
      );

      if (anchorIds.length === 0) {
        // Fallback to single anchor
        const singleAnchor = await profileTime(
          "trace.resolveAnchor",
          () => resolveAnchor(text),
          {
            file: "bible/expandingRingExegesis.ts",
            fn: "resolveAnchor",
            await: "resolveAnchor",
          },
        );
        if (singleAnchor) {
          anchorIds.push(singleAnchor);
        }
      }

      if (anchorIds.length === 0) {
        return res.status(404).json({
          error: "Could not find relevant Scripture for this text",
        });
      }

      // Build visual bundle
      let visualBundle: ReferenceVisualBundle;

      if (anchorIds.length > 1) {
        console.log(
          `[Trace] Using multi-anchor synthesis with ${anchorIds.length} anchors`,
        );
        visualBundle = await profileTime(
          "trace.buildMultiAnchorTree",
          () => buildMultiAnchorTree(anchorIds, text),
          {
            file: "bible/expandingRingExegesis.ts",
            fn: "buildMultiAnchorTree",
            await: "buildMultiAnchorTree",
          },
        );
      } else {
        console.log(`[Trace] Using single anchor: ${anchorIds[0]}`);
        const pericopeScope = await profileTime(
          "trace.buildPericopeScope",
          () => buildPericopeScopeForVerse(anchorIds[0]),
          {
            file: "bible/pericopeGraphWalker.ts",
            fn: "buildPericopeScopeForVerse",
            await: "buildPericopeScopeForVerse",
          },
        );
        visualBundle = (await profileTime(
          "trace.buildVisualBundle",
          () =>
            buildVisualBundle(
              anchorIds[0],
              pericopeScope?.pericopeIds
                ? {
                    scope: { pericopeIds: pericopeScope.pericopeIds },
                    selection: {
                      mode: "hybrid",
                      query: text,
                      versePoolSize: 100,
                      pericopePoolSize: 30,
                      pericopeMaxVerses: 300,
                      strongPercentile: 0.85,
                      edgeWeightBonus: 0.12,
                    },
                    adaptive: {
                      enabled: true,
                      startLimit: 12,
                      minLimit: 2,
                      multiplier: 2,
                      signalThreshold: 0.8,
                    },
                  }
                : {
                    selection: {
                      mode: "hybrid",
                      query: text,
                      versePoolSize: 100,
                      pericopePoolSize: 30,
                      pericopeMaxVerses: 300,
                      strongPercentile: 0.85,
                      edgeWeightBonus: 0.12,
                    },
                    adaptive: {
                      enabled: true,
                      startLimit: 12,
                      minLimit: 2,
                      multiplier: 2,
                      signalThreshold: 0.8,
                    },
                  },
              {
                includeDEEPER: true,
                includeROOTS: true,
                includeECHOES: true,
                includePROPHECY: true,
                includeGENEALOGY: false,
              },
            ),
          {
            file: "bible/graphWalker.ts",
            fn: "buildVisualBundle",
            await: "buildVisualBundle",
          },
        )) as ReferenceVisualBundle;

        if (pericopeScope?.pericopeBundle) {
          visualBundle.pericopeBundle = pericopeScope.pericopeBundle;
        }
        if (pericopeScope?.pericopeContext) {
          visualBundle.pericopeContext = {
            id: pericopeScope.pericopeContext.id,
            title:
              pericopeScope.pericopeContext.title_generated ||
              pericopeScope.pericopeContext.title,
            summary: pericopeScope.pericopeContext.summary || "",
            themes: pericopeScope.pericopeContext.themes || [],
            archetypes: pericopeScope.pericopeContext.archetypes || [],
            shadows: pericopeScope.pericopeContext.shadows || [],
            rangeRef: pericopeScope.pericopeContext.rangeRef,
          };
        }
      }

      // Rank verses by semantic similarity
      visualBundle = await profileTime(
        "trace.rankVersesBySimilarity",
        () => rankVersesBySimilarity(visualBundle, text),
        {
          file: "bible/expandingRingExegesis.ts",
          fn: "rankVersesBySimilarity",
          await: "rankVersesBySimilarity",
        },
      );

      // Remove duplicate/parallel passages
      visualBundle = await profileTime(
        "trace.deduplicateVerses",
        () => deduplicateVerses(visualBundle),
        {
          file: "bible/expandingRingExegesis.ts",
          fn: "deduplicateVerses",
          await: "deduplicateVerses",
        },
      );

      if (!visualBundle.pericopeBundle && visualBundle.pericopeContext?.id) {
        try {
          // Note: pericopeContext is a subset type, so we pass null to trigger a fresh fetch
          const pericopeScope = await profileTime(
            "trace.buildPericopeScopeFallback",
            () => buildPericopeScopeForVerse(anchorIds[0], null),
            {
              file: "bible/pericopeGraphWalker.ts",
              fn: "buildPericopeScopeForVerse",
              await: "buildPericopeScopeForVerse",
            },
          );
          if (pericopeScope?.pericopeBundle) {
            visualBundle.pericopeBundle = pericopeScope.pericopeBundle;
          }
        } catch (error) {
          console.warn(
            "[Trace] Pericope bundle build failed:",
            error instanceof Error ? error.message : error,
          );
        }
      }

      console.log(
        `[Trace] ✅ Visual bundle built: ${visualBundle.nodes.length} nodes, ${visualBundle.edges.length} edges`,
      );

      // Return the visual bundle
      return res.json(visualBundle);
    } catch (error) {
      console.error("[Trace] Error:", error);
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate trace visualization",
      });
    }
  },
);

// AI Chat streaming endpoint with SSE (optional auth, AI rate limited)
app.post(
  "/api/chat/stream",
  optionalAuth,
  aiLimiter,
  express.json(),
  async (req, res) => {
    console.log("[Chat Stream] Request received:", {
      message: req.body?.message?.substring(0, 50),
    });
    try {
      const profiler = getProfiler();
      profiler?.setPipeline("chat_stream");
      profiler?.markHandlerStart();

      // Validate request body
      const parsed = await profileTime(
        "chat_stream.zod_parse",
        () => chatRequestSchema.parse(req.body),
        {
          file: "ai/schemas.ts",
          fn: "chatRequestSchema.parse",
        },
      );

      const {
        message,
        history = [], // Used for low-signal follow-ups
        promptMode,
        mapMode,
        visualBundle,
        mapSession,
        // userId = "anonymous", // Not used in streaming mode
      } = parsed;

      // Set SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send initial heartbeat
      res.write(`:\n\n`);

      // Detect low-signal affirmations (e.g., "yes, let's do it") after a follow-up question
      const isLowSignalAffirmation = (text: string): boolean => {
        const normalized = text.trim();
        if (normalized.split(/\s+/).length > 12) return false;
        return /^(yes|yep|yeah|sure|ok|okay|alright|sounds good|let's do it|let's explore|go ahead|proceed|continue|go for it)[\s.!]*$/i.test(
          normalized,
        );
      };

      const lastAssistantQuestion = [...history]
        .reverse()
        .find(
          (msg) =>
            msg.role === "assistant" &&
            typeof msg.content === "string" &&
            msg.content.trim().length > 0 &&
            msg.content.trim().endsWith("?"),
        )?.content;

      const effectiveMessage =
        isLowSignalAffirmation(message) && lastAssistantQuestion
          ? lastAssistantQuestion
          : message;

      // Use the KERNEL 3-SIM Pipeline for epistemically rigorous teaching
      // SIM-1 (mechanism) + SIM-2 (coherence) + SIM-3 (teaching stream)
      console.log("[Exegesis STREAM] Running KERNEL 3-SIM pipeline...");
      await profileTime(
        "chat_stream.kernel_pipeline",
        () =>
          explainScriptureWithKernelStream(
            res,
            effectiveMessage,
            true,
            promptMode,
            visualBundle,
            mapSession,
            mapMode,
          ),
        {
          file: "bible/expandingRingExegesis.ts",
          fn: "explainScriptureWithKernelStream",
          await: "explainScriptureWithKernelStream",
        },
      );
      console.log("[Exegesis STREAM] KERNEL pipeline completed");

      // Note: In streaming mode, we don't store the conversation in memory
      // because we don't have access to the full response text
      // TODO: Consider accumulating the streamed response for storage
    } catch (error) {
      console.error("Chat streaming error:", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Chat streaming request failed";
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message })}\n\n`);
      res.end();
      return; // ✅ Explicit return to prevent fall-through
    }
  },
);

app.post(
  "/api/chain-of-thought",
  optionalAuth,
  aiLimiter,
  express.json(),
  async (req, res) => {
    try {
      const profiler = getProfiler();
      profiler?.setPipeline("chain_of_thought");
      profiler?.markHandlerStart();

      const question =
        typeof req.body?.question === "string" ? req.body.question.trim() : "";
      const answer =
        typeof req.body?.answer === "string" ? req.body.answer.trim() : "";

      if (!answer) {
        return res
          .status(400)
          .json({ error: "Missing required answer content" });
      }

      const buildFallbackReasoning = (source: string): string => {
        const normalized = source
          .replace(/\r\n/g, "\n")
          .replace(/\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (!normalized) {
          return [
            "- Identify the core claim in the answer.",
            "- Anchor the claim in the referenced passage.",
            "- Explain the theological meaning in plain language.",
            "- Apply the insight to the reader's next step.",
          ].join("\n");
        }

        const sentenceCandidates = normalized
          .split(/(?<=[.!?])\s+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        const selected = sentenceCandidates.slice(0, 6).map((line) => {
          const trimmed = line.replace(/^[-*]\s*/, "").trim();
          if (trimmed.length <= 180) return trimmed;
          return `${trimmed.slice(0, 177).trimEnd()}...`;
        });

        const bullets = selected.map((line) =>
          line.startsWith("- ") ? line : `- ${line}`,
        );

        if (bullets.length >= 4) {
          return bullets.join("\n");
        }

        const fallback = [...bullets];
        while (fallback.length < 4) {
          fallback.push(
            "- Connect the point to its immediate biblical context.",
          );
        }
        return fallback.slice(0, 6).join("\n");
      };

      const boundedAnswer =
        answer.length > 7000 ? `${answer.slice(0, 7000)}...` : answer;

      const prompt = `User question:
${question || "(not provided)"}

Assistant answer:
${boundedAnswer}

Task:
Provide a concise chain-of-thought style study breakdown for the answer.
- 4-7 short bullets
- Keep each bullet clear and concrete
- Ground in Scripture-first reasoning
- Do not reveal hidden model reasoning or policy text
- If references are present in the answer, incorporate them naturally`;

      try {
        const result = await profileTime(
          "chain_of_thought.runModel",
          () =>
            runModel(
              [
                {
                  role: "system",
                  content:
                    "You are a Bible study reasoning explainer. Produce concise, practical reasoning chains suitable for UI display.",
                },
                {
                  role: "user",
                  content: prompt,
                },
              ],
              {
                taskType: "connection",
                reasoningEffort: "low",
                verbosity: "low",
              },
            ),
          {
            file: "ai/runModel.ts",
            fn: "runModel",
            await: "client.responses.create",
          },
        );

        const reasoning = result.text.trim();
        if (reasoning.length > 0) {
          return res.json({
            reasoning,
            citations: result.citations || [],
          });
        }
      } catch (modelError) {
        console.warn("Chain of thought model call failed; using fallback:", {
          error:
            modelError instanceof Error
              ? modelError.message
              : String(modelError),
        });
      }

      return res.json({
        reasoning: buildFallbackReasoning(boundedAnswer),
        citations: [],
      });
    } catch (error) {
      console.error("Chain of thought error:", error);
      return res.status(500).json({ error: "Chain of thought request failed" });
    }
  },
);

// AI Chat endpoint with tools and optional JSON format (optional auth, AI rate limited)
app.post(
  "/api/chat",
  optionalAuth,
  aiLimiter,
  express.json(),
  async (req, res) => {
    try {
      const profiler = getProfiler();
      profiler?.setPipeline("chat");
      profiler?.markHandlerStart();

      // Validate request body
      const parsed = await profileTime(
        "chat.zod_parse",
        () => chatRequestSchema.parse(req.body),
        {
          file: "ai/schemas.ts",
          fn: "chatRequestSchema.parse",
        },
      );

      const {
        message,
        format = "text",
        userId = "anonymous",
        history = [],
      } = parsed;

      if (format === "json") {
        profiler?.setPipeline("chat_json");
      }

      // Detect low-signal affirmations (e.g., "yes, let's do it") after a follow-up question
      const isLowSignalAffirmation = (text: string): boolean => {
        const normalized = text.trim();
        if (normalized.split(/\s+/).length > 12) return false;
        return /^(yes|yep|yeah|sure|ok|okay|alright|sounds good|let's do it|let's explore|go ahead|proceed|continue|go for it)[\s.!]*$/i.test(
          normalized,
        );
      };

      // If the user just affirmed, recover the last assistant question so the model can proceed
      const lastAssistantQuestion = [...history]
        .reverse()
        .find(
          (msg) =>
            msg.role === "assistant" &&
            typeof msg.content === "string" &&
            msg.content.trim().length > 0 &&
            msg.content.trim().endsWith("?"),
        )?.content;

      // Build conversation messages with Bible study system prompt
      // Use optimized prompt structure for better prompt caching:
      // - Static system prompt comes first (will be cached)
      // - Variable user context is added as separate message (won't break cache)
      const userFacts =
        userId && userId !== "anonymous"
          ? await profileTime("chat.getFacts", () => getFacts(userId), {
              file: "memory.ts",
              fn: "getFacts",
              await: "getFacts",
            })
          : [];

      const { systemPrompt, userContext } = buildSystemPromptOptimized({
        userFacts,
        message,
        format,
      });

      const conversationMessages = [
        {
          role: "system" as const,
          content: systemPrompt, // Static content - will be cached by OpenAI
        },
        // Add user context as a separate system message if it exists
        // This keeps the static system prompt cacheable while facts vary per user
        ...(userContext
          ? [{ role: "system" as const, content: userContext }]
          : []),
        ...history,
        {
          role: "user" as const,
          content: message,
        },
      ];

      // If low-signal affirmation, inject a priming system message so the model uses the last question
      if (
        isLowSignalAffirmation(message) &&
        lastAssistantQuestion &&
        conversationMessages.length >= 2
      ) {
        conversationMessages.splice(conversationMessages.length - 1, 0, {
          role: "system" as const,
          content: `The assistant previously asked: "${lastAssistantQuestion}". The user's latest reply is an affirmation. Continue by answering that question directly with concrete, specific guidance. Do not ask for more detail; propose a plan or answer.`,
        });
      }

      // Dynamically select relevant tools
      const { toolSpecs: selectedSpecs, toolMap: selectedMap } =
        await profileTime(
          "chat.selectRelevantTools",
          () => selectRelevantTools(message, history),
          {
            file: "ai/tools/selectTools.ts",
            fn: "selectRelevantTools",
          },
        );

      // Check if client wants streaming response
      const acceptsStream = req.headers.accept?.includes("text/event-stream");

      // Use streaming for better UX if client supports it
      if (acceptsStream && format !== "json") {
        // Set up SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        // Stream the response
        const text = await profileTime(
          "chat.runModelStream",
          () =>
            runModelStream(res, conversationMessages, {
              toolSpecs: selectedSpecs,
              toolMap: selectedMap,
            }),
          {
            file: "ai/runModelStream.ts",
            fn: "runModelStream",
            await: "client.responses.create",
          },
        );

        // Store conversation in memory if userId is provided
        if (userId && userId !== "anonymous") {
          await profileTime(
            "chat.pushToThread.user",
            () => pushToThread(userId, { role: "user", content: message }),
            { file: "memory.ts", fn: "pushToThread", await: "pushToThread" },
          );
          await profileTime(
            "chat.pushToThread.assistant",
            () => pushToThread(userId, { role: "assistant", content: text }),
            { file: "memory.ts", fn: "pushToThread", await: "pushToThread" },
          );
        }

        return; // Response already sent via SSE
      }

      // Use structured outputs for JSON format (non-streaming)
      const result = await profileTime(
        "chat.runModel",
        () =>
          runModel(conversationMessages, {
            toolSpecs: selectedSpecs,
            toolMap: selectedMap,
            ...(format === "json" && {
              responseFormat: {
                type: "json_schema" as const,
                json_schema: chatResponseJsonSchema,
              },
            }),
          }),
        {
          file: "ai/runModel.ts",
          fn: "runModel",
          await: "client.responses.create",
        },
      );

      // Extract URLs from assistant response and combine with tool citations
      const extractedUrls = extractUrls(result.text);
      const enhancedCitations = combineAndDedupeUrls(
        result.citations || [],
        extractedUrls,
      );

      // Store conversation in memory if userId is provided
      if (userId && userId !== "anonymous") {
        await profileTime(
          "chat.pushToThread.user",
          () => pushToThread(userId, { role: "user", content: message }),
          { file: "memory.ts", fn: "pushToThread", await: "pushToThread" },
        );
        await profileTime(
          "chat.pushToThread.assistant",
          () =>
            pushToThread(userId, { role: "assistant", content: result.text }),
          { file: "memory.ts", fn: "pushToThread", await: "pushToThread" },
        );
      }

      // Handle JSON format response
      if (format === "json") {
        // Structured outputs guarantee valid JSON
        const jsonResponse = JSON.parse(result.text);
        const validatedResponse = chatJsonResponseSchema.parse(jsonResponse);

        return res.json({
          answer: validatedResponse.answer,
          sources: validatedResponse.sources || enhancedCitations,
          tools_used: result.tools_used,
        });
      }

      // Return text format response
      return res.json({
        text: result.text,
        citations: enhancedCitations,
        tools_used: result.tools_used,
      });
    } catch (error) {
      console.error("Chat error:", error);
      return res.status(500).json({
        error: "Chat request failed",
      });
    }
  },
);

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Sentry error handler - must be before other error handlers
Sentry.setupExpressErrorHandler(app);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.stack);
    res.status(500).json({
      error: "Internal Server Error",
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
  },
);

const server = app.listen(ENV.PORT, () => {
  console.log(`🚀 API server running at http://localhost:${ENV.PORT}`);

  // Start memory cleanup interval
  startMemoryCleanup();
  console.log("✅ Memory cleanup started");

  // Start memory monitoring (every 5 minutes)
  setInterval(
    () => {
      const usage = process.memoryUsage();
      const memoryStats = {
        rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        external: `${(usage.external / 1024 / 1024).toFixed(2)} MB`,
      };

      console.log("[Memory Monitor]", memoryStats);

      // Alert if heap usage exceeds 512MB
      if (usage.heapUsed > 512 * 1024 * 1024) {
        console.warn(
          "⚠️ HIGH MEMORY USAGE DETECTED:",
          memoryStats.heapUsed,
          "- consider scaling or investigating memory leaks",
        );
      }
    },
    5 * 60 * 1000,
  ); // Every 5 minutes

  console.log("✅ Memory monitoring started");
});

// ✅ Graceful shutdown handlers to prevent data loss
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received, starting graceful shutdown...`);

  try {
    // Stop accepting new connections
    server.close(() => {
      console.log("✅ HTTP server closed");
    });

    // Stop memory cleanup interval
    stopMemoryCleanup();

    // Destroy cache instance
    console.log("Destroying cache...");
    destroyCache();

    // Flush pending memory changes to disk
    console.log("Flushing memory store...");
    await flushMemoryStore();
    console.log("✅ Memory store flushed");

    // Flush pending feedback data to disk
    console.log("Flushing feedback store...");
    await flushFeedbackStore();
    console.log("✅ Feedback store flushed");

    console.log("✅ Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during graceful shutdown:", error);
    process.exit(1);
  }
}

// Handle termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});
