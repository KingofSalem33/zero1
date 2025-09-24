import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ENV } from "./env";
import projectsRouter from "./routes/projects";
import { runModel } from "./ai/runModel";
import { toolSpecs, toolMap } from "./ai/tools";

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

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "api",
    version: "0.1.0",
  });
});

// AI Chat endpoint with tools
app.post("/api/chat", express.json(), async (req, res) => {
  try {
    const { messages, message } = req.body;

    if (!messages && !message) {
      return res.status(400).json({
        error: "Either 'messages' array or single 'message' string is required",
      });
    }

    // Handle single message or messages array
    let conversationMessages;
    if (message && typeof message === "string") {
      conversationMessages = [
        {
          role: "system",
          content:
            "You are a helpful AI assistant. You can call tools to search the web, fetch content from URLs, or perform calculations. Always cite any URLs you used in your response.",
        },
        {
          role: "user",
          content: message,
        },
      ];
    } else if (Array.isArray(messages)) {
      // Add system message if not present
      conversationMessages = messages;
      if (!messages.some((msg) => msg.role === "system")) {
        conversationMessages = [
          {
            role: "system",
            content:
              "You are a helpful AI assistant. You can call tools to search the web, fetch content from URLs, or perform calculations. Always cite any URLs you used in your response.",
          },
          ...messages,
        ];
      }
    } else {
      return res.status(400).json({
        error: "Invalid message format",
      });
    }

    const result = await runModel(conversationMessages, {
      toolSpecs,
      toolMap,
    });

    return res.json({
      ok: true,
      response: result.text,
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
