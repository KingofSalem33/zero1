import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { ENV } from "./env";
import { makeOpenAI } from "./ai";
import projectsRouter, { orchestrator } from "./routes/projects";

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
      "http://localhost:4173",
    ],
  }),
);
app.use(morgan("combined"));
app.use(express.json());

// Rate limiting for AI routes
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests, please try again later." },
});
app.use("/api/ai", aiLimiter);

// Mount project routes
app.use("/api/projects", projectsRouter);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "api",
    version: "0.1.0",
  });
});

app.get("/api/hello", (_req, res) => {
  res.json({
    message: "Hello from API",
  });
});

app.post("/api/ai/complete", express.json(), async (req, res) => {
  try {
    const client = makeOpenAI();
    if (!client)
      return res.status(503).json({ error: "OPENAI_API_KEY not set" });

    const userPrompt = (req.body?.prompt ?? "").toString();
    if (!userPrompt || userPrompt.length < 5) {
      return res
        .status(400)
        .json({ error: "Prompt must be at least 5 characters long" });
    }
    if (userPrompt.length > 2000) {
      return res
        .status(400)
        .json({ error: "Prompt must be 2000 characters or less" });
    }

    const result = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a concise, helpful assistant." },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });

    const text = result.choices?.[0]?.message?.content ?? "";
    res.json({ ok: true, text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI request failed" });
  }
});

app.post("/api/ai/clarify", express.json(), async (req, res) => {
  try {
    const client = makeOpenAI();
    if (!client) return res.status(503).json({ error: "AI not configured" });

    const thought = (req.body?.thinking ?? "").toString();
    const projectId = (req.body?.projectId ?? "").toString();

    if (!thought || thought.length < 5) {
      return res
        .status(400)
        .json({ error: "Thinking input must be at least 5 characters long" });
    }
    if (thought.length > 2000) {
      return res
        .status(400)
        .json({ error: "Thinking input must be 2000 characters or less" });
    }

    const result = await client.chat.completions.create({
      model: ENV.OPENAI_MODEL_NAME,
      messages: [
        {
          role: "system",
          content:
            "You are a domain expert. Read the messy idea, reflect it back clearly, and ask 1-2 clarifying questions.",
        },
        { role: "user", content: thought },
      ],
      temperature: 0.4,
      max_tokens: 200,
    });

    const text = result.choices?.[0]?.message?.content ?? "";

    // Save to project history if projectId provided
    if (projectId && text) {
      orchestrator.addHistoryEntry(projectId, thought, text);
    }

    res.json({ ok: true, clarifications: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI request failed" });
  }
});

app.get("/api/prompts/seed", async (_req, res) => {
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const promptsPath = join(__dirname, "../seed/prompts.json");
    const promptsData = await readFile(promptsPath, "utf-8");
    const prompts = JSON.parse(promptsData);
    res.json({ ok: true, prompts });
  } catch (err) {
    console.error("Error loading seed prompts:", err);
    res.status(500).json({ error: "Failed to load seed prompts" });
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
