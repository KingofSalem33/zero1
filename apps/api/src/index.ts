import dotenv from "dotenv";
import path from "path";

// Load .env from the api package root regardless of where the server is started
const envPath = path.resolve(__dirname, "..", ".env");
dotenv.config({ path: envPath });
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ENV } from "./env";
import threadsRouter from "./routes/threads";
import ttsRouter from "./routes/tts";
import synopsisRouter from "./routes/synopsis";
import bookmarksRouter from "./routes/bookmarks";
import { runModel } from "./ai/runModel";
// import { runModelStream } from "./ai/runModelStream"; // Disabled in /api/chat/stream - using Expanding Ring instead
import { selectRelevantTools } from "./ai/tools/selectTools"; // Still used in /api/chat endpoint
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
import { optionalAuth } from "./middleware/auth";
import { checkConnectionHealth } from "./db";
import {
  apiLimiter,
  aiLimiter,
  strictLimiter,
  uploadLimiter,
} from "./middleware/rateLimit";
import { buildSystemPrompt, buildSystemPromptWithJson } from "./config/prompts";

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
app.use(express.json());

// Apply global API rate limiting
app.use("/api/", apiLimiter);

// V1 Project routes (DEPRECATED - Use V2 routes at /api/v2/projects instead)
// app.use("/api/projects", optionalAuth, projectsRouter);

// Mount thread routes (temporarily optional auth for testing)
app.use("/api/threads", optionalAuth, threadsRouter);

// Mount TTS routes (text-to-speech)
app.use("/api/tts", optionalAuth, ttsRouter);

// Mount synopsis routes (text analysis)
app.use("/api/synopsis", optionalAuth, synopsisRouter);

// Mount bookmark routes
app.use("/api/bookmarks", optionalAuth, bookmarksRouter);

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
        userId = "anonymous",
        // history = [], // Not used in Expanding Ring mode
      } = chatRequestSchema.parse(req.body);

      // Set SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Helper to send SSE event (copied from runModelStream)
      const sendEvent = (event: string, data: unknown) => {
        const eventStr = `event: ${event}\n`;
        const dataStr =
          typeof data === "string"
            ? `data: ${data}\n\n`
            : `data: ${JSON.stringify(data)}\n\n`;
        console.log(
          `[SSE] Sending event: ${event}, data: ${typeof data === "string" ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100)}...`,
        );
        res.write(eventStr);
        res.write(dataStr);
      };

      // Send initial heartbeat (copied from runModelStream)
      res.write(`:\n\n`);

      // Use the Expanding Ring exegesis pipeline
      // NOTE: Requires Supabase database to be populated first!
      // Database is now populated with 31,100 verses and 210,330 cross-references ✓
      // ENABLED: Using Expanding Ring graph-based approach
      console.log("[Exegesis] Running Expanding Ring pipeline...");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { explainScripture } = require("./bible/expandingRingExegesis");
      const exegesisResult = await explainScripture(message);
      console.log(
        "[Exegesis] Got result, length:",
        exegesisResult.answer.length,
      );
      console.log("[Exegesis] Context stats:", exegesisResult.contextStats);

      // Send answer as content in sentence-based chunks for better performance
      console.log("[SSE] Sending content in sentence chunks");
      // Split into sentences (periods, question marks, exclamation points followed by space or end)
      const sentences = exegesisResult.answer.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        sendEvent("content", { delta: sentence + " " });
      }

      // Send done event with context metadata
      sendEvent("done", {
        citations: [],
        anchor: exegesisResult.anchor,
        contextStats: exegesisResult.contextStats,
      });
      console.log("[SSE] Ending response");
      res.end();

      // Store in memory
      if (userId && userId !== "anonymous") {
        await pushToThread(userId, { role: "user", content: message });
        await pushToThread(userId, {
          role: "assistant",
          content: exegesisResult.answer,
        });
      }
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
      const userFacts =
        userId && userId !== "anonymous" ? await getFacts(userId) : [];
      const systemMessage =
        format === "json"
          ? buildSystemPromptWithJson(userFacts)
          : buildSystemPrompt(userFacts);

      const conversationMessages = [
        {
          role: "system" as const,
          content: systemMessage,
        },
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

      // Use structured outputs for JSON format
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
