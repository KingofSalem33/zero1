import { Router, type Response } from "express";
import { supabase } from "../db";
import { ENV } from "../env";
import { runModel } from "../ai/runModel";
import { runModelStream } from "../ai/runModelStream";
import {
  buildWitnessPacket,
  type WitnessPacketVerse,
} from "../bible/witnessPackets";
import { SEMANTIC_CONNECTION_V2 } from "../prompts";
import { extractTokenUsage, logTokenUsage } from "../utils/telemetry";
import { getProfiler, profileTime } from "../profiling/requestProfiler";

type VerseType = {
  id: number;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  pericopeTitle?: string;
  pericopeType?: string;
  pericopeThemes?: string[];
};

const router = Router();

function buildSemanticWitnessRole(
  index: number,
  total: number,
): WitnessPacketVerse["role"] {
  if (total === 2) {
    return index === 0 ? "lead" : "paired";
  }
  if (index === 0) return "lead";
  if (index < Math.min(total, 4)) return "principal";
  return "supporting";
}

function buildSemanticWitnessRationale(index: number, total: number): string {
  if (total === 2) {
    return index === 0
      ? "Frames the connection"
      : "Confirms or answers the lead witness";
  }
  if (index === 0) {
    return "Lead witness for the active topic";
  }
  if (index < Math.min(total, 4)) {
    return "Core supporting witness for the active topic";
  }
  return "Supporting witness kept in scope for accountability";
}

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

function parseSemanticSynopsis(rawText: string): {
  title: string;
  synopsis: string;
} {
  const titleMatch = rawText.match(/^\s*Title:\s*(.+)$/im);
  const synopsisMatch = rawText.match(/^\s*Synopsis:\s*([\s\S]+)$/im);
  return {
    title: titleMatch?.[1]?.trim() || "",
    synopsis:
      synopsisMatch?.[1]?.trim() ||
      rawText.trim() ||
      "Unable to generate synopsis.",
  };
}

/**
 * POST /api/semantic-connection/synopsis
 * Generate AI synopsis explaining semantic connections between verses
 * Supports both pairwise (2 verses) and cluster (multiple verses) analysis
 */
router.post("/synopsis", async (req, res) => {
  const wantsStream = acceptsEventStream(req.headers.accept);
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("semantic_connection_synopsis");
    profiler?.markHandlerStart();

    const { verseIds, connectionType, similarity, isLLMDiscovered } = req.body;
    const parseReference = (reference: string) => {
      const match = reference.match(/^([123]?\s*[A-Za-z\s]+)\s+(\d+):(\d+)$/);
      if (!match) return null;
      const book = match[1].trim();
      const chapter = Number.parseInt(match[2], 10);
      const verse = Number.parseInt(match[3], 10);
      if (!book || Number.isNaN(chapter) || Number.isNaN(verse)) return null;
      return { book_name: book, chapter, verse };
    };

    const suppliedVerses = Array.isArray(req.body.verses)
      ? req.body.verses
          .filter(
            (verse: unknown) =>
              verse && typeof verse === "object" && !Array.isArray(verse),
          )
          .map(
            (verse: {
              id?: number;
              reference?: string;
              text?: string;
              book_name?: string;
              chapter?: number;
              verse?: number;
              pericopeTitle?: string;
              pericopeType?: string;
              pericopeThemes?: string[];
            }) => {
              const reference =
                typeof verse.reference === "string" ? verse.reference : "";
              const parsed = reference ? parseReference(reference) : null;
              return {
                id: Number(verse.id),
                book_name:
                  typeof verse.book_name === "string"
                    ? verse.book_name
                    : (parsed?.book_name ?? ""),
                chapter: Number.isFinite(verse.chapter)
                  ? Number(verse.chapter)
                  : (parsed?.chapter ?? 0),
                verse: Number.isFinite(verse.verse)
                  ? Number(verse.verse)
                  : (parsed?.verse ?? 0),
                text: typeof verse.text === "string" ? verse.text : "",
                ...(typeof verse.pericopeTitle === "string" &&
                verse.pericopeTitle
                  ? { pericopeTitle: verse.pericopeTitle }
                  : {}),
                ...(typeof verse.pericopeType === "string" && verse.pericopeType
                  ? { pericopeType: verse.pericopeType }
                  : {}),
                ...(Array.isArray(verse.pericopeThemes) &&
                verse.pericopeThemes.length > 0
                  ? {
                      pericopeThemes: verse.pericopeThemes.filter(
                        (t): t is string => typeof t === "string",
                      ),
                    }
                  : {}),
              };
            },
          )
          .filter(
            (verse: {
              id: number;
              book_name: string;
              chapter: number;
              verse: number;
              text: string;
            }) =>
              Number.isFinite(verse.id) &&
              verse.id > 0 &&
              verse.book_name.length > 0 &&
              verse.chapter > 0 &&
              verse.verse > 0 &&
              verse.text.length > 0,
          )
      : [];

    // Support legacy format (fromVerseId, toVerseId) for backwards compatibility
    const rawIds = Array.isArray(verseIds)
      ? verseIds
      : [req.body.fromVerseId, req.body.toVerseId];
    const ids = rawIds
      .map((id: unknown) => Number(id))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    if (ids.length < 2 || ids.length !== rawIds.length) {
      return res
        .status(400)
        .json({ error: "At least two valid verse IDs are required" });
    }

    console.log(
      `[Semantic Connection] Generating synopsis for ${ids.length} verses (${connectionType}, ${similarity})`,
    );

    let sortedVerses: VerseType[] = [];
    if (suppliedVerses.length >= 2) {
      const verseById = new Map(
        suppliedVerses.map((verse: VerseType) => [verse.id, verse]),
      );
      const ordered = ids
        .map((id: number) => verseById.get(id))
        .filter((v): v is VerseType => v !== undefined);
      sortedVerses = ordered.length >= 2 ? ordered : suppliedVerses;
    } else {
      // Fetch all verses from database
      const { data: verses, error } = await profileTime(
        "semantic_connection.fetch_verses",
        () =>
          supabase
            .from("verses")
            .select("id, book_name, chapter, verse, text")
            .in("id", ids),
        {
          file: "routes/semantic-connection.ts",
          fn: "fetch_verses",
          await: "supabase.verses.select",
        },
      );

      if (error || !verses || verses.length < 2) {
        console.error("[Semantic Connection] Error fetching verses:", error);
        return res.status(404).json({ error: "Verses not found" });
      }

      const verseById = new Map(
        verses.map((verse: VerseType) => [verse.id, verse]),
      );
      const missingIds = Array.from(
        new Set(ids.filter((id: number) => !verseById.has(id))),
      );

      if (missingIds.length > 0) {
        console.error(
          `[Semantic Connection] Missing verses for IDs: ${missingIds.join(", ")}`,
        );
        return res.status(404).json({
          error: "Verses not found",
          missingVerseIds: missingIds,
        });
      }

      // Sort verses by their position in the verseIds array to maintain order
      sortedVerses = ids
        .map((id: number) => verseById.get(id))
        .filter((v: VerseType | undefined): v is VerseType => v !== undefined);
    }

    // Determine connection description
    const connectionDescriptions = {
      CROSS_REFERENCE:
        "cross-reference (canonical parallel or contextual link)",
      LEXICON: "lexicon link (shared root or key term)",
      ECHO: "echo (semantic or thematic resonance)",
      FULFILLMENT: "fulfillment (prophetic or covenant link)",
      PATTERN: "pattern (typology, contrast, progression, motif, lineage)",
      // Legacy labels (backwards compatibility)
      GOLD: "lexicon link (shared root or key term)",
      PURPLE: "echo (semantic or thematic resonance)",
      CYAN: "fulfillment (prophetic or covenant link)",
      GENEALOGY: "pattern (typology, contrast, progression, motif, lineage)",
      TYPOLOGY: "pattern (typology, contrast, progression, motif, lineage)",
      CONTRAST: "pattern (typology, contrast, progression, motif, lineage)",
      PROGRESSION: "pattern (typology, contrast, progression, motif, lineage)",
    } as const;

    const connectionDesc =
      connectionDescriptions[
        connectionType as keyof typeof connectionDescriptions
      ] || "semantic connection";

    const connectionToneMap = {
      CROSS_REFERENCE: "cross-reference",
      LEXICON: "lexicon",
      ECHO: "echo",
      FULFILLMENT: "fulfillment",
      PATTERN: "pattern",
      GOLD: "lexicon",
      PURPLE: "echo",
      CYAN: "fulfillment",
      GENEALOGY: "pattern",
      TYPOLOGY: "pattern",
      CONTRAST: "pattern",
      PROGRESSION: "pattern",
    } as const;

    const connectionTone =
      connectionToneMap[connectionType as keyof typeof connectionToneMap] ||
      (isLLMDiscovered ? connectionType.toLowerCase() : "semantic");

    type TopicContextEntry = { label: string; overlap: number | null };

    const rawTopicContext = Array.isArray(req.body.topicContext)
      ? req.body.topicContext
      : [];
    const topicContext: TopicContextEntry[] = rawTopicContext
      .filter(
        (topic: unknown) =>
          topic && typeof topic === "object" && !Array.isArray(topic),
      )
      .map(
        (topic: {
          label?: unknown;
          styleType?: unknown;
          overlap?: unknown;
        }) => {
          const label =
            typeof topic.label === "string"
              ? topic.label
              : typeof topic.styleType === "string"
                ? topic.styleType
                : "Other";
          const overlap =
            typeof topic.overlap === "number" && Number.isFinite(topic.overlap)
              ? topic.overlap
              : null;
          return { label, overlap };
        },
      )
      .slice(0, 6);

    const witnessPacket = buildWitnessPacket(
      sortedVerses.map((verse, index) => ({
        id: verse.id,
        reference: `${verse.book_name} ${verse.chapter}:${verse.verse}`,
        text: verse.text,
        role: buildSemanticWitnessRole(index, sortedVerses.length),
        importance: sortedVerses.length - index,
        rationale: buildSemanticWitnessRationale(index, sortedVerses.length),
        pericopeTitle: verse.pericopeTitle,
        pericopeType: verse.pericopeType,
        pericopeThemes: verse.pericopeThemes,
      })),
      {
        principalCount:
          sortedVerses.length <= 3
            ? sortedVerses.length
            : Math.min(3, sortedVerses.length),
        rosterExcerptChars: 72,
        principalTextChars: 220,
      },
    );

    const compactTopicContext =
      topicContext.length > 0
        ? `Other available lenses for this same connection: ${topicContext
            .slice(0, 3)
            .map(
              (topic: TopicContextEntry) =>
                `${topic.label}${topic.overlap !== null ? ` (${Math.round(topic.overlap * 100)}% overlap)` : ""}`,
            )
            .join(", ")}. Keep this synopsis distinct from those lenses.\n`
        : "";

    const prompt = `Study this ${connectionDesc} using the witness packet below.

CONNECTION:
- Type: ${connectionType}
- Tone: ${connectionTone}
${similarity ? `- Similarity: ${Math.round(similarity * 100)}%\n` : ""}${compactTopicContext}${witnessPacket.summary}

[ALL WITNESSES]
${witnessPacket.roster}

[PRINCIPAL WITNESSES]
${witnessPacket.principalWitnesses}

Instructions:
- Every witness above remains in scope.
- Let the principal witnesses carry the explanation.
- Use the full roster to confirm the connection's breadth and guard against overclaiming.
- Mention narrative section context only if it sharpens the connection.
- Maximum 34 words for the synopsis and 6 words for the title.
- Do not mention verse numbers.

Return exactly two lines:
Title: <6 words or less>
Synopsis: <34 words or less>`;

    let rawText = "";
    if (wantsStream) {
      initializeSseResponse(res);
      rawText = await profileTime(
        "semantic_connection.runModelStream",
        () =>
          runModelStream(
            res,
            [
              {
                role: "system",
                content: SEMANTIC_CONNECTION_V2.buildSystem(),
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            {
              model: ENV.OPENAI_SMART_MODEL,
              verbosity: "low",
              maxOutputTokens: 64,
              keepAlive: true,
              enableValidation: false,
              enableGuardrails: false,
              taskType: "semantic_connection_synopsis",
            },
          ),
        {
          file: "ai/runModelStream.ts",
          fn: "runModelStream",
          await: "client.responses.create",
          model: ENV.OPENAI_SMART_MODEL,
        },
      );
    } else {
      const result = await profileTime(
        "semantic_connection.runModel",
        () =>
          runModel(
            [
              {
                role: "system",
                content: SEMANTIC_CONNECTION_V2.buildSystem(),
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            {
              model: ENV.OPENAI_SMART_MODEL,
              verbosity: "low",
              maxOutputTokens: 64,
            },
          ),
        {
          file: "ai/runModel.ts",
          fn: "runModel",
          await: "client.responses.create",
          model: ENV.OPENAI_SMART_MODEL,
        },
      );

      rawText = result.text || "";

      const tokenUsage = extractTokenUsage(
        result,
        "/api/semantic-connection/synopsis",
        ENV.OPENAI_SMART_MODEL,
        "semantic-connection-v1",
      );
      if (tokenUsage) {
        logTokenUsage(tokenUsage);
      }
    }

    const { title, synopsis } = parseSemanticSynopsis(rawText);

    console.log(
      `[Semantic Connection] Synopsis generated for ${sortedVerses.length} verses: ${synopsis.substring(0, 100)}...`,
    );

    const payload = {
      title,
      synopsis,
      verses: sortedVerses.map(
        (v: {
          id: number;
          book_name: string;
          chapter: number;
          verse: number;
          text: string;
        }) => ({
          id: v.id,
          reference: `${v.book_name} ${v.chapter}:${v.verse}`,
          text: v.text,
        }),
      ),
      connectionType,
      similarity,
      verseCount: sortedVerses.length,
    };

    if (wantsStream) {
      sendSseEvent(res, "done", payload);
      res.end();
      return;
    }

    return res.json(payload);
  } catch (error) {
    console.error("[Semantic Connection] Error generating synopsis:", error);
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
    return res.status(500).json({ error: "Failed to generate synopsis" });
  }
});

/**
 * POST /api/semantic-connection/topic-titles
 * Generate short, reverent titles for each topic family in a connection cluster
 */
router.post("/topic-titles", async (req, res) => {
  try {
    const { topics } = req.body || {};
    const rawTopics = Array.isArray(topics) ? topics : [];

    const parsedTopics = rawTopics
      .filter(
        (topic: unknown) =>
          topic && typeof topic === "object" && !Array.isArray(topic),
      )
      .map((topic: { type?: unknown; verses?: unknown }) => {
        const type =
          typeof topic.type === "string"
            ? topic.type
            : typeof (topic as { styleType?: unknown }).styleType === "string"
              ? (topic as { styleType?: string }).styleType
              : "";
        const verses = Array.isArray(topic.verses)
          ? topic.verses
              .filter(
                (verse: unknown) =>
                  verse && typeof verse === "object" && !Array.isArray(verse),
              )
              .map((verse: { reference?: unknown; text?: unknown }) => ({
                reference:
                  typeof verse.reference === "string" ? verse.reference : "",
                text: typeof verse.text === "string" ? verse.text : "",
              }))
              .filter((verse) => verse.reference && verse.text)
              .slice(0, 4)
          : [];
        return { type, verses };
      })
      .filter(
        (
          topic,
        ): topic is {
          type: string;
          verses: { reference: string; text: string }[];
        } => Boolean(topic.type),
      );

    if (parsedTopics.length === 0) {
      return res.status(400).json({ error: "No topics provided" });
    }

    const topicBlocks = parsedTopics
      .map((topic, idx) => {
        const verseText = topic.verses
          .map((verse) => `- ${verse.reference}: "${verse.text}"`)
          .join("\n");
        return `${idx + 1}) ${topic.type}\n${verseText || "- (no verses supplied)"}`;
      })
      .join("\n\n");

    const prompt = `Create a short title (2-6 words) for each topic below.
Tone: natural and reverent (not academic).
Do not mention verse numbers.
Do not echo the internal type labels or their root words (cross, reference, lexicon, echo, fulfillment, pattern, prophecy, typology, motif, lineage, progression, contrast, parallel, context).
Titles must be complete phrases, not truncated.

Examples of the desired feel (do not copy):
"Testing in the wilderness"
"Hearts turn away again"
"Promise comes to pass"
"Same key word appears"
"Light versus darkness"

Return ONLY JSON in this shape:
{"titles":{"CROSS_REFERENCE":"...", "LEXICON":"...", "ECHO":"...", "FULFILLMENT":"...", "PATTERN":"..."}}

Topics:
${topicBlocks}`;

    const knownKeys = [
      "CROSS_REFERENCE",
      "LEXICON",
      "ECHO",
      "FULFILLMENT",
      "PATTERN",
    ];
    const normalizeKey = (value: string) =>
      value
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z_]/g, "");

    const bannedFragments = [
      "cross",
      "reference",
      "lexicon",
      "echo",
      "fulfillment",
      "fulfilment",
      "pattern",
      "prophecy",
      "prophetic",
      "typology",
      "motif",
      "lineage",
      "progression",
      "contrast",
      "parallel",
      "context",
      "genealogy",
      "deeper",
    ];

    const fallbackTitles: Record<string, string> = {
      CROSS_REFERENCE: "Two witnesses, one story",
      LEXICON: "Same key word appears",
      ECHO: "The scene matches",
      FULFILLMENT: "Promise comes to pass",
      PATTERN: "Hearts turn away again",
    };

    const normalizeTitle = (value: string) =>
      value
        .replace(/\s+/g, " ")
        .replace(/["\u201C\u201D]/g, "")
        .trim();

    const isInvalidTitle = (value?: string) => {
      if (!value) return true;
      const trimmed = normalizeTitle(value);
      if (!trimmed) return true;
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length < 2 || words.length > 6) return true;
      const lower = trimmed.toLowerCase();
      if (/\d+\s*:\s*\d+/.test(lower)) return true;
      if (bannedFragments.some((fragment) => lower.includes(fragment))) {
        return true;
      }
      return false;
    };

    const generateTitles = async (_keys: string[], promptText: string) =>
      profileTime(
        "semantic_connection.topic_titles",
        () =>
          runModel(
            [
              {
                role: "system",
                content:
                  "You generate short, reverent Bible connection titles. Output JSON only.",
              },
              { role: "user", content: promptText },
            ],
            {
              model: ENV.OPENAI_FAST_MODEL,
              verbosity: "low",
            },
          ),
        {
          file: "routes/semantic-connection.ts",
          fn: "topic_titles",
          await: "client.responses.create",
          model: ENV.OPENAI_FAST_MODEL,
        },
      );

    const parseTitlesFromResult = (result: { text: string }) => {
      let titles: Record<string, string> = {};
      try {
        const raw = result.text || "";
        const jsonStart = raw.indexOf("{");
        const jsonEnd = raw.lastIndexOf("}");
        const jsonSlice =
          jsonStart >= 0 && jsonEnd >= 0
            ? raw.slice(jsonStart, jsonEnd + 1)
            : "";
        const parsed = jsonSlice ? JSON.parse(jsonSlice) : {};
        if (parsed && typeof parsed === "object") {
          const candidateTitles =
            typeof (parsed as { titles?: unknown }).titles === "object"
              ? (parsed as { titles?: Record<string, string> }).titles
              : parsed;
          if (candidateTitles && typeof candidateTitles === "object") {
            titles = Object.entries(candidateTitles).reduce(
              (acc, [key, value]) => {
                const normalizedKey = normalizeKey(key);
                if (
                  knownKeys.includes(normalizedKey) &&
                  typeof value === "string" &&
                  value.trim().length > 0
                ) {
                  acc[normalizedKey] = normalizeTitle(value);
                }
                return acc;
              },
              {} as Record<string, string>,
            );
          }
        }
      } catch (error) {
        console.warn(
          "[Semantic Connection] Failed to parse topic titles",
          error,
        );
      }

      if (Object.keys(titles).length === 0 && result.text) {
        result.text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => {
            const match = line.match(/^(?:[-*]\s*)?([A-Za-z_\s]+)\s*:\s*(.+)$/);
            if (!match) return;
            const normalizedKey = normalizeKey(match[1]);
            const value = normalizeTitle(match[2]);
            if (
              knownKeys.includes(normalizedKey) &&
              value &&
              typeof value === "string"
            ) {
              titles[normalizedKey] = value;
            }
          });
      }
      return titles;
    };

    let titles: Record<string, string> = {};
    try {
      const result = await generateTitles(knownKeys, prompt);
      titles = parseTitlesFromResult(result);
    } catch (error) {
      console.warn(
        "[Semantic Connection] Topic titles generation failed",
        error,
      );
    }
    const invalidKeys = knownKeys.filter((key) => isInvalidTitle(titles[key]));

    if (invalidKeys.length > 0) {
      const retryBlocks = parsedTopics
        .filter((topic) => invalidKeys.includes(topic.type))
        .map((topic, idx) => {
          const verseText = topic.verses
            .map((verse) => `- ${verse.reference}: "${verse.text}"`)
            .join("\n");
          return `${idx + 1}) ${topic.type}\n${verseText || "- (no verses supplied)"}`;
        })
        .join("\n\n");

      const retryPrompt = `Regenerate titles ONLY for the listed topics.
Keep 2-6 words, natural and reverent.
Do not mention verse numbers.
Avoid these words: ${bannedFragments.join(", ")}.
Return ONLY JSON in this shape:
{"titles":{${invalidKeys.map((key) => `"${key}":"..."`).join(", ")}}}

Topics:
${retryBlocks}`;

      try {
        const retryResult = await generateTitles(invalidKeys, retryPrompt);
        const retryTitles = parseTitlesFromResult(retryResult);
        titles = { ...titles, ...retryTitles };
      } catch (error) {
        console.warn("[Semantic Connection] Retry topic titles failed", error);
      }
    }

    const finalTitles = knownKeys.reduce<Record<string, string>>((acc, key) => {
      const candidate = titles[key] ?? "";
      acc[key] = isInvalidTitle(candidate)
        ? fallbackTitles[key]
        : normalizeTitle(candidate);
      return acc;
    }, {});

    return res.json({ titles: finalTitles });
  } catch (error) {
    console.error("[Semantic Connection] Topic titles error:", error);
    return res.status(500).json({ error: "Failed to generate topic titles" });
  }
});

export default router;
