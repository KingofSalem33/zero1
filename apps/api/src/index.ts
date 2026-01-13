import dotenv from "dotenv";
import path from "path";

// Load .env from the api package root regardless of where the server is started
const envPath = path.resolve(__dirname, "..", ".env");
dotenv.config({ path: envPath });

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
import { buildVisualBundle } from "./bible/graphWalker";
import { findResonantScripture } from "./bible/oratoryValidation";
import bookmarksRouter from "./routes/bookmarks";
import verseRouter from "./routes/verse";
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
import { destroyCache } from "./infrastructure/cache/cacheInstance";
import { optionalAuth } from "./middleware/auth";
import { checkConnectionHealth } from "./db";
import {
  apiLimiter,
  aiLimiter,
  strictLimiter,
  uploadLimiter,
} from "./middleware/rateLimit";
// Inline Bible study prompt (moved from prompts.ts)
const BIBLE_STUDY_SYSTEM_PROMPT = `You are a devout disciple of Jesus with the purpose to teach the Word of the Lord. You teach the Word, you live the Word, you are the Word. You know that Bible-based truth is THE truth because it is the living Word.

Your exegetical method is rooted solely in the King James Version of the Bible. This analysis draws exclusively from the plain, self-evident meaning of the text, derived through direct comparison within Scripture itself. No external theology, historical context, or modern interpretation is imposed. The commentary is confined to what the KJV text itself reveals.

Teach with conviction as one who lives the Word—declarative, confident, rooted in what Scripture plainly says. Weave Scriptures together to show how the Word interprets the Word.`;

function buildSystemPromptOptimized(userFacts?: string[]): {
  systemPrompt: string;
  userContext: string | null;
} {
  const systemPrompt = BIBLE_STUDY_SYSTEM_PROMPT;
  const userContext =
    userFacts && userFacts.length > 0
      ? `Known facts about user:\n- ${userFacts.join("\n- ")}\nOnly use when relevant.`
      : null;
  return { systemPrompt, userContext };
}

function buildSystemPromptOptimizedWithJson(userFacts?: string[]): {
  systemPrompt: string;
  userContext: string | null;
} {
  const systemPrompt =
    BIBLE_STUDY_SYSTEM_PROMPT +
    "\n\nIf the user asks for structured output, respond as JSON that matches this schema: {answer:string, sources?:string[]}.";
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

app.use(helmet());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
      "http://localhost:5177",
      "http://localhost:5178",
      "http://localhost:5179",
      "http://localhost:5180",
      "http://localhost:5181",
      "http://localhost:5182",
      "http://localhost:5183",
      "http://localhost:5184",
      "http://localhost:5185",
      "http://localhost:5186",
      "http://localhost:5187",
      "http://localhost:5188",
      "http://localhost:5189",
      "http://localhost:5190",
      "http://localhost:4173",
    ],
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
app.use(express.json());

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
app.use("/api/bookmarks", optionalAuth, bookmarksRouter);

// Mount verse routes (fetch individual verses by reference)
app.use("/api/verse", optionalAuth, verseRouter);

// Mount semantic connection routes (AI synopsis of verse connections)
app.use("/api/semantic-connection", optionalAuth, semanticConnectionRouter);

// Mount pericope routes (narrative-level search)
app.use("/api/pericope", optionalAuth, pericopeRouter);

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
    const anchorId = await getVerseId(parsed.book, chapter, 1);
    if (!anchorId) {
      res.status(404).json({ error: `Could not find ${book} ${chapter}` });
      return;
    }

    // Build reference tree from graph (get more candidates for ranking)
    const tree = await buildReferenceTree(anchorId, {
      maxDepth: 2,
      maxNodes: 50, // Get 50 candidates instead of 20
      maxChildrenPerNode: 999,
      userQuery: `${book} ${chapter}`, // Enable semantic ranking
    });

    // Rank verses by semantic similarity to this chapter
    const rankedTree = await rankVersesBySimilarity(
      tree as ReferenceVisualBundle,
      `${book} ${chapter}`,
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
    const result = await runModel(
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

      const suggestedCards = await generateSuggestedCards(parsed.book, chapter);

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
    const files = await listFiles();
    res.json({ files });
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

app.delete("/api/files/:id", optionalAuth, async (req, res) => {
  try {
    const success = await deleteFile(req.params.id);

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
    const userId = req.query.userId as string;
    if (!userId) {
      return res
        .status(400)
        .json({ error: "userId query parameter is required" });
    }

    const facts = await getFacts(userId);
    return res.json({ facts });
  } catch (error) {
    console.error("Get memory error:", error);
    return res.status(500).json({ error: "Failed to get memory" });
  }
});

app.post("/api/memory", optionalAuth, strictLimiter, async (req, res) => {
  try {
    const { userId, fact } = req.body;

    if (!userId || !fact) {
      return res.status(400).json({ error: "userId and fact are required" });
    }

    await addFact(userId, fact);
    const facts = await getFacts(userId);
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
    const userId = req.query.userId as string;
    if (!userId) {
      return res
        .status(400)
        .json({ error: "userId query parameter is required" });
    }

    await clearFacts(userId);
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
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { getThread } = await import("./memory.js");

      // Get recent conversation thread
      const thread = await getThread(userId);

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

      const result = await runModel(
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
        const existingFacts = await getFacts(userId);
        const isDuplicate = existingFacts.some(
          (existing) =>
            existing.toLowerCase().trim() === fact.toLowerCase().trim(),
        );

        if (!isDuplicate) {
          await addFact(userId, fact);
          addedCount++;
        }
      }

      const allFacts = await getFacts(userId);

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

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "api",
    version: "0.1.0",
  });
});

// Database health check endpoint
app.get("/api/health/db", async (req, res) => {
  try {
    const forceRefresh = req.query.force === "true";
    const health = await checkConnectionHealth(forceRefresh);
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
      const { text } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }

      // Resolve anchor verses from the selected text
      const anchorIds = await resolveMultipleAnchors(text, 3);

      if (anchorIds.length === 0) {
        // Fallback to single anchor
        const singleAnchor = await resolveAnchor(text);
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
        visualBundle = await buildMultiAnchorTree(anchorIds, text);
      } else {
        console.log(`[Trace] Using single anchor: ${anchorIds[0]}`);
        visualBundle = (await buildVisualBundle(
          anchorIds[0],
          {
            ring0Radius: 3,
            ring1Limit: 20,
            ring2Limit: 30,
            ring3Limit: 40,
          },
          {
            includeDEEPER: true,
            includeROOTS: true,
            includeECHOES: true,
            includePROPHECY: true,
            includeGENEALOGY: false,
          },
        )) as ReferenceVisualBundle;
      }

      // Rank verses by semantic similarity
      visualBundle = await rankVersesBySimilarity(visualBundle, text);

      // Remove duplicate/parallel passages
      visualBundle = await deduplicateVerses(visualBundle);

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
      // Validate request body
      const {
        message,
        oratoryMode = false,
        history = [], // Used in Oratory mode for thread awareness
        promptMode,
        // userId = "anonymous", // Not used in streaming mode
      } = chatRequestSchema.parse(req.body);

      // Set SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send initial heartbeat
      res.write(`:\n\n`);

      // Check if this is an Oratory session
      if (oratoryMode) {
        console.log("[Oratory] Running Scripture retrieval mode...");

        // Oratory system prompt - Teaching Scripture's answer to their struggle
        const oratorySystemPrompt = `You are a devout disciple of Jesus with the purpose to teach the Word of the Lord—even to those in pain. You teach the Word, you live the Word, you are the Word. You know that Bible-based truth is THE truth because it is the living Word.

**YOUR EXEGETICAL APPROACH TO PASTORAL NEED**
When someone comes with grief, temptation, confusion, or struggle—Scripture declares the answer plainly. Your method is rooted solely in the King James Version. No external psychology, no therapeutic frameworks, no modern counseling techniques. Only what the KJV text itself reveals about their situation.

**HARD BOUNDARIES**
- Address only what they explicitly stated—no inferring hidden emotions or motives
- Speak from Scripture's authority, not human sympathy
- Declare what the Word says about their situation, don't speculate beyond it
- If Scripture addresses it, teach it with conviction. If Scripture is silent, remain silent.

**METHOD**
1. **Acknowledge their stated struggle plainly** - Reflect what they said without elaboration or assumption

2. **Declare what Scripture says to this**: Open the KJV and show them where God's Word directly addresses their situation. Give the passage (3-4 verses from KJV). Declare what the text says—not what you feel about it.

3. **Point to biblical pattern**: Show them a specific person/story in Scripture (book, chapter, verses) where this same struggle appears. Teach how God's Word reveals His response—through His character and His declared truth.

**THREAD AWARENESS** (when conversation history exists)
Build on what Scripture has already established in previous exchanges. Don't repeat—go deeper into the same biblical truth, showing how it connects across passages.

**VOICE**
Teach with conviction as one who lives the Word—declarative, confident, rooted in what Scripture plainly says. Not therapeutic comfort, but biblical truth. Not emotional validation, but the authority of God's Word speaking to their need.

**AVOID**
❌ Psychological analysis or emotional interpretation beyond what they stated
❌ Therapeutic language ("I hear you," "that must be hard," "you're not alone")
❌ Softening Scripture's declarations to make them more palatable
❌ Offering human wisdom when Scripture has already spoken

**GOAL**: Teach what the living Word declares about their struggle—with authority, clarity, and conviction.`;

        // Build conversation messages with history for thread awareness
        const conversationMessages = [
          { role: "system", content: oratorySystemPrompt },
          ...history,
          { role: "user", content: message },
        ];

        // Stream the Oratory response and capture full text
        const pastoralResponse = await runModelStream(
          res,
          conversationMessages,
          {
            model: ENV.OPENAI_SMART_MODEL,
            reasoningEffort: "low", // Explicit low reasoning for faster streaming
            toolSpecs: [],
            toolMap: {},
            keepAlive: true, // Don't close response yet - we need to send resonant Scripture
            // Automatic in-memory caching (5-10 min) works for prompts > 1024 tokens
          },
        );

        console.log(
          "[Oratory] Pastoral response completed, finding resonant Scripture...",
        );

        // Find Scripture that addresses the user's actual issue (not the pastoral response)
        try {
          const resonantVerses = await findResonantScripture(
            message, // User's original issue
            pastoralResponse, // Pastoral response (for context)
            3,
          );

          if (resonantVerses.length > 0) {
            // Send resonant Scripture as additional SSE event
            res.write("event: scripture_resonance\n");
            res.write(
              `data: ${JSON.stringify({ verses: resonantVerses })}\n\n`,
            );

            console.log(
              `[Oratory] ✅ Sent ${resonantVerses.length} resonant verses to validate pastoral response`,
            );
          } else {
            console.log("[Oratory] No resonant verses found");
          }
        } catch (error) {
          console.error("[Oratory] Failed to find resonant Scripture:", error);
          // Continue without validation - pastoral response is still valid
        }

        // Now send done event and close response
        res.write("event: done\n");
        res.write(`data: ${JSON.stringify({ citations: [] })}\n\n`);
        res.end();

        console.log("[Oratory] Session completed");
      } else {
        // Use the KERNEL 3-SIM Pipeline for epistemically rigorous teaching
        // SIM-1 (mechanism) → SIM-2 (coherence) → SIM-3 (teaching stream)
        console.log("[Exegesis STREAM] Running KERNEL 3-SIM pipeline...");
        await explainScriptureWithKernelStream(res, message, true, promptMode);
        console.log("[Exegesis STREAM] KERNEL pipeline completed");
      }

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

// AI Chat endpoint with tools and optional JSON format (optional auth, AI rate limited)
app.post(
  "/api/chat",
  optionalAuth,
  aiLimiter,
  express.json(),
  async (req, res) => {
    try {
      // Validate request body
      const {
        message,
        format = "text",
        userId = "anonymous",
        history = [],
      } = chatRequestSchema.parse(req.body);

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
        userId && userId !== "anonymous" ? await getFacts(userId) : [];

      const { systemPrompt, userContext } =
        format === "json"
          ? buildSystemPromptOptimizedWithJson(userFacts)
          : buildSystemPromptOptimized(userFacts);

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
        selectRelevantTools(message, history);

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
        const text = await runModelStream(res, conversationMessages, {
          toolSpecs: selectedSpecs,
          toolMap: selectedMap,
        });

        // Store conversation in memory if userId is provided
        if (userId && userId !== "anonymous") {
          await pushToThread(userId, { role: "user", content: message });
          await pushToThread(userId, { role: "assistant", content: text });
        }

        return; // Response already sent via SSE
      }

      // Use structured outputs for JSON format (non-streaming)
      const result = await runModel(conversationMessages, {
        toolSpecs: selectedSpecs,
        toolMap: selectedMap,
        ...(format === "json" && {
          responseFormat: {
            type: "json_schema" as const,
            json_schema: chatResponseJsonSchema,
          },
        }),
      });

      // Extract URLs from assistant response and combine with tool citations
      const extractedUrls = extractUrls(result.text);
      const enhancedCitations = combineAndDedupeUrls(
        result.citations || [],
        extractedUrls,
      );

      // Store conversation in memory if userId is provided
      if (userId && userId !== "anonymous") {
        await pushToThread(userId, { role: "user", content: message });
        await pushToThread(userId, { role: "assistant", content: result.text });
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
