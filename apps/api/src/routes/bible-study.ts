import { Router } from "express";
import { runModelStream } from "../ai/runModelStream";
import { ENV } from "../env";
import { resolveAnchor } from "../bible/expandingRingExegesis";
import { buildLightContext, type Verse } from "../bible/graphEngine";
import {
  buildResponseStrategy,
  buildSystemPrompt,
} from "../prompts/system/systemPrompts";
import { getProfiler, profileTime } from "../profiling/requestProfiler";

const router = Router();

const ANCHOR_NOT_FOUND_MESSAGE =
  "I could not find specific KJV verses matching your question. Please try rephrasing with more specific biblical terms or include a verse reference (e.g., 'John 3:16').";

const formatReference = (verse: Verse): string =>
  `${verse.book_name} ${verse.chapter}:${verse.verse}`;

const formatVerseLine = (verse: Verse): string =>
  `[${formatReference(verse)}] ${verse.text}`;

const buildLightUserMessage = (
  userPrompt: string,
  context: Awaited<ReturnType<typeof buildLightContext>>,
  priorExchange?: { user?: string; assistant?: string },
): string => {
  const ring0Lines = context.ring0.map(formatVerseLine).join("\n");
  const connectionLines = context.connections.map(formatVerseLine).join("\n");

  const priorBlock =
    priorExchange && (priorExchange.user || priorExchange.assistant)
      ? `PREVIOUS QUESTION: "${priorExchange.user ?? ""}"
PREVIOUS RESPONSE (for continuity): ${priorExchange.assistant ?? ""}

`
      : "";

  return `${priorBlock}USER QUESTION: "${userPrompt}"

ANCHOR:
${formatVerseLine(context.anchor)}

CONTEXT (Ring 0):
${ring0Lines || "(No context verses found)"}

CONNECTIONS (Ring 1):
${connectionLines || "(No connections found)"}

GUIDANCE:
- Use ONLY the verses listed above.
- Cite verses inline using (Book Ch:v) immediately after quotes.
- If the verses do not answer the question, say so plainly.`;
};

router.post("/", async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("bible_study");
    profiler?.markHandlerStart();

    const message =
      typeof req.body?.message === "string"
        ? req.body.message
        : typeof req.body?.prompt === "string"
          ? req.body.prompt
          : typeof req.body?.text === "string"
            ? req.body.text
            : "";

    const rawHistory = Array.isArray(req.body?.history)
      ? (req.body.history as Array<{ role?: unknown; content?: unknown }>)
      : [];
    const extractHistoryText = (entry?: {
      role?: unknown;
      content?: unknown;
    }) => (typeof entry?.content === "string" ? entry.content.trim() : "");
    const lastAssistant = [...rawHistory]
      .reverse()
      .find((entry) => entry.role === "assistant");
    const lastUser = [...rawHistory]
      .reverse()
      .find((entry) => entry.role === "user");
    const truncate = (value: string, limit: number) =>
      value.length > limit ? `${value.slice(0, limit).trim()}…` : value;
    const priorExchange = {
      user: truncate(extractHistoryText(lastUser), 280),
      assistant: truncate(extractHistoryText(lastAssistant), 1200),
    };

    if (!message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Initial heartbeat
    res.write(`:\n\n`);

    const anchorId = await profileTime(
      "bible_study.resolve_anchor",
      () => resolveAnchor(message),
      {
        file: "bible/expandingRingExegesis.ts",
        fn: "resolveAnchor",
        await: "resolveAnchor",
      },
    );

    if (!anchorId) {
      res.write(`event: content\n`);
      res.write(
        `data: ${JSON.stringify({ delta: ANCHOR_NOT_FOUND_MESSAGE })}\n\n`,
      );
      res.write(`event: done\n`);
      res.write(`data: ${JSON.stringify({ citations: [] })}\n\n`);
      res.end();
      return;
    }

    const context = await profileTime(
      "bible_study.buildLightContext",
      () =>
        buildLightContext(anchorId, message, {
          ring0Radius: 3,
          limit: 7,
        }),
      {
        file: "bible/graphEngine.ts",
        fn: "buildLightContext",
        await: "buildLightContext",
      },
    );

    // Stream verses being explored to the client
    const allVerses = [
      context.anchor,
      ...context.ring0,
      ...context.connections,
    ];
    for (const verse of allVerses) {
      res.write(`event: verse_search\n`);
      res.write(
        `data: ${JSON.stringify({ verse: formatReference(verse) })}\n\n`,
      );
    }

    const anchorRef = formatReference(context.anchor);
    const strategy = buildResponseStrategy({
      mode: "go_deeper_short",
      userPrompt: message,
      anchorRef,
    });
    const systemPrompt = buildSystemPrompt(strategy);
    const userMessage = buildLightUserMessage(message, context, priorExchange);

    await runModelStream(
      res,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      {
        model: ENV.OPENAI_FAST_MODEL,
        keepAlive: true,
        taskType: "bible_study",
      },
    );

    const citationSet = new Set<string>();
    [context.anchor, ...context.ring0, ...context.connections].forEach(
      (verse) => citationSet.add(formatReference(verse)),
    );

    res.write(`event: done\n`);
    res.write(
      `data: ${JSON.stringify({
        citations: Array.from(citationSet),
        suggestTrace: context.metadata.suggestTrace,
        connectionCount: context.metadata.totalConnectionsFound,
        anchorId: context.anchor.id,
      })}\n\n`,
    );
    res.end();
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Bible study request failed";
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message })}\n\n`);
    res.end();
    return;
  }
});

export default router;
