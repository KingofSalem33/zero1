import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ENV } from "./env";
import projectsRouter from "./routes/projects";
import { runModel } from "./ai/runModel";
import { toolSpecs, toolMap } from "./ai/tools";
import { chatRequestSchema, chatJsonResponseSchema } from "./ai/schemas";
import { handleFileUpload } from "./files";
import { getFacts, addFact, pushToThread, clearFacts } from "./memory";

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

// File upload endpoint
app.post("/api/files", handleFileUpload);

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
    res.json({ facts });
  } catch (error) {
    console.error("Get memory error:", error);
    res.status(500).json({ error: "Failed to get memory" });
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
    res.json({
      message: "Fact added successfully",
      facts,
    });
  } catch (error) {
    console.error("Add memory error:", error);
    res.status(500).json({ error: "Failed to add memory" });
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
    res.json({ message: "Facts cleared successfully" });
  } catch (error) {
    console.error("Clear memory error:", error);
    res.status(500).json({ error: "Failed to clear memory" });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "api",
    version: "0.1.0",
  });
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
      "You are a helpful AI assistant. You can call the `web_search` tool to find current information, fetch content from URLs, perform calculations, and search through uploaded files. Use `file_search` when the user references 'the doc', 'uploaded files', or asks questions about previously uploaded content. Always include source URLs in your final answer.";

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
        role: "system",
        content: systemMessage,
      },
      ...history,
      {
        role: "user",
        content: message,
      },
    ];

    const result = await runModel(conversationMessages, {
      toolSpecs,
      toolMap,
    });

    // Store conversation in memory if userId is provided
    if (userId && userId !== "anonymous") {
      await pushToThread(userId, { role: "user", content: message });
      await pushToThread(userId, { role: "assistant", content: result.text });
    }

    // Handle JSON format response
    if (format === "json") {
      try {
        // Try to parse the response as JSON
        const jsonResponse = JSON.parse(result.text);
        const validatedResponse = chatJsonResponseSchema.parse(jsonResponse);

        return res.json({
          answer: validatedResponse.answer,
          sources: validatedResponse.sources || result.citations,
        });
      } catch {
        console.log(
          "Initial JSON parsing failed, asking model to return valid JSON",
        );

        // If parsing fails, ask the model to return valid JSON only
        const retryMessages = [
          ...conversationMessages,
          {
            role: "assistant",
            content: result.text,
          },
          {
            role: "user",
            content: "Return valid JSON only.",
          },
        ];

        const retryResult = await runModel(retryMessages, {
          toolSpecs,
          toolMap,
        });

        try {
          const jsonResponse = JSON.parse(retryResult.text);
          const validatedResponse = chatJsonResponseSchema.parse(jsonResponse);

          return res.json({
            answer: validatedResponse.answer,
            sources: validatedResponse.sources || retryResult.citations,
          });
        } catch (retryError) {
          console.error("JSON retry failed:", retryError);
          // Fallback to structured response
          return res.json({
            answer: result.text,
            sources: result.citations,
          });
        }
      }
    }

    // Return text format response
    return res.json({
      text: result.text,
      citations: result.citations,
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
