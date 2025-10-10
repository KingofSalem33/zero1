import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ENV } from "./env";
import projectsRouter from "./routes/projects";
import threadsRouter from "./routes/threads";
import artifactsRouter from "./routes/artifacts";
import artifactActionsRouter from "./routes/artifact-actions";
import checkpointsRouter from "./routes/checkpoints";
import { runModel } from "./ai/runModel";
import { runModelStream } from "./ai/runModelStream";
import { selectRelevantTools } from "./ai/tools/selectTools";
import {
  chatRequestSchema,
  chatJsonResponseSchema,
  chatResponseJsonSchema,
} from "./ai/schemas";
import { handleFileUpload } from "./files";
import { getFacts, addFact, pushToThread, clearFacts } from "./memory";

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
      "http://localhost:4173",
    ],
  }),
);
app.use(morgan("combined"));
app.use(express.json());

// Mount project routes
app.use("/api/projects", projectsRouter);

// Mount thread routes
app.use("/api/threads", threadsRouter);

// Mount artifact routes
app.use("/api/artifacts", artifactsRouter);
app.use("/api/artifact-actions", artifactActionsRouter);

// Mount checkpoint routes
app.use("/api/checkpoints", checkpointsRouter);

// File endpoints
app.post("/api/files", handleFileUpload);

app.get("/api/files", async (req, res) => {
  try {
    const { listFiles } = await import("./files");
    const files = await listFiles();
    res.json({ files });
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

app.delete("/api/files/:id", async (req, res) => {
  try {
    const { deleteFile } = await import("./files");
    const success = await deleteFile(req.params.id);

    if (!success) {
      return res.status(404).json({ error: "File not found" });
    }

    res.json({ ok: true, message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// Memory endpoints
app.get("/api/memory", async (req, res) => {
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

app.post("/api/memory", async (req, res) => {
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

app.delete("/api/memory", async (req, res) => {
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

// Extract facts from recent conversations
app.post("/api/memory/extract", express.json(), async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const { getThread } = await import("./memory");

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
      .filter((msg) => msg.role === "user")
      .map((msg) => msg.content)
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
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "api",
    version: "0.1.0",
  });
});

// AI Chat streaming endpoint with SSE
app.post("/api/chat/stream", express.json(), async (req, res) => {
  try {
    // Validate request body
    const {
      message,
      userId = "anonymous",
      history = [],
    } = chatRequestSchema.parse(req.body);

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Build conversation messages
    let systemMessage =
      "You are a helpful AI assistant. You can call the `web_search` tool to find current information, fetch content from URLs, perform calculations, and search through uploaded files. Use `file_search` when the user references 'the doc', 'uploaded files', or asks questions about previously uploaded content. When you use the web, include 2-5 source links at the end. Always include source URLs in your final answer.";

    // Add known facts about the user if available
    if (userId && userId !== "anonymous") {
      const userFacts = await getFacts(userId);
      if (userFacts.length > 0) {
        systemMessage +=
          "\n\nKnown facts about user:\n- " +
          userFacts.join("\n- ") +
          "\nOnly use when relevant.";
      }
    }

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

    // Dynamically select relevant tools
    const { toolSpecs: selectedSpecs, toolMap: selectedMap } =
      selectRelevantTools(message, history);

    // Run streaming model with selected tools
    await runModelStream(res, conversationMessages, {
      toolSpecs: selectedSpecs,
      toolMap: selectedMap,
    });

    // Store conversation in memory if userId is provided
    if (userId && userId !== "anonymous") {
      await pushToThread(userId, { role: "user", content: message });
      // Note: We don't have the full response here, would need to capture it during streaming
    }
  } catch (error) {
    console.error("Chat streaming error:", error);
    res.write(`event: error\n`);
    res.write(
      `data: ${JSON.stringify({ error: "Chat streaming request failed" })}\n\n`,
    );
    res.end();
  }
});

// AI Chat endpoint with tools and optional JSON format
app.post("/api/chat", express.json(), async (req, res) => {
  try {
    // Validate request body
    const {
      message,
      format = "text",
      userId = "anonymous",
      history = [],
    } = chatRequestSchema.parse(req.body);

    // Build conversation messages
    let systemMessage =
      "You are a helpful AI assistant. You can call the `web_search` tool to find current information, fetch content from URLs, perform calculations, and search through uploaded files. Use `file_search` when the user references 'the doc', 'uploaded files', or asks questions about previously uploaded content. When you use the web, include 2-5 source links at the end. Always include source URLs in your final answer.";

    // Add known facts about the user if available
    if (userId && userId !== "anonymous") {
      const userFacts = await getFacts(userId);
      if (userFacts.length > 0) {
        systemMessage +=
          "\n\nKnown facts about user:\n- " +
          userFacts.join("\n- ") +
          "\nOnly use when relevant.";
      }
    }

    // Add JSON formatting instruction if needed
    if (format === "json") {
      systemMessage +=
        "\n\nIf the user asks for structured output, respond as JSON that matches this schema: {answer:string, sources?:string[]}";
    }

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
});

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

app.listen(ENV.PORT, () => {
  console.log(`🚀 API server running at http://localhost:${ENV.PORT}`);
});
