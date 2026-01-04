import { Router } from "express";
import { supabase } from "../db";
import { ENV } from "../env";
import { runModel } from "../ai/runModel";
import { SEMANTIC_CONNECTION_V1 } from "../prompts";
import { extractTokenUsage, logTokenUsage } from "../utils/telemetry";

const router = Router();

/**
 * POST /api/semantic-connection/synopsis
 * Generate AI synopsis explaining semantic connections between verses
 * Supports both pairwise (2 verses) and cluster (multiple verses) analysis
 */
router.post("/synopsis", async (req, res) => {
  try {
    const { verseIds, connectionType, similarity, isLLMDiscovered } = req.body;

    // Support legacy format (fromVerseId, toVerseId) for backwards compatibility
    const ids = verseIds || [req.body.fromVerseId, req.body.toVerseId];

    if (!ids || ids.length < 2) {
      return res
        .status(400)
        .json({ error: "At least two verse IDs are required" });
    }

    console.log(
      `[Semantic Connection] Generating synopsis for ${ids.length} verses (${connectionType}, ${similarity})`,
    );

    // Fetch all verses from database
    const { data: verses, error } = await supabase
      .from("verses")
      .select("id, book_name, chapter, verse, text")
      .in("id", ids);

    if (error || !verses || verses.length < 2) {
      console.error("[Semantic Connection] Error fetching verses:", error);
      return res.status(404).json({ error: "Verses not found" });
    }

    // Sort verses by their position in the verseIds array to maintain order
    type VerseType = {
      id: number;
      book_name: string;
      chapter: number;
      verse: number;
      text: string;
    };
    const sortedVerses = ids
      .map((id: number) => verses.find((v: { id: number }) => v.id === id))
      .filter((v: VerseType | undefined): v is VerseType => v !== undefined);

    // Determine connection description
    const connectionDescriptions = {
      GOLD: "lexical connection (same-testament, similar language and concepts)",
      PURPLE:
        "theological connection (cross-testament, expressing the same truth)",
      CYAN: "prophetic connection (Old Testament prophecy pointing to New Testament fulfillment)",
      TYPOLOGY: "typological pattern (shadow → substance)",
      FULFILLMENT: "prophetic fulfillment (prophecy → event)",
      CONTRAST: "theological contrast (inversion or opposition)",
      PROGRESSION: "doctrinal progression (covenant development)",
      PATTERN: "structural pattern (chiastic, numerical, or literary)",
    };

    const connectionDesc =
      connectionDescriptions[
        connectionType as keyof typeof connectionDescriptions
      ] || "semantic connection";

    // Build verse list for prompt
    const verseList = sortedVerses
      .map(
        (v: {
          book_name: string;
          chapter: number;
          verse: number;
          text: string;
        }) => `**${v.book_name} ${v.chapter}:${v.verse}**\n"${v.text}"`,
      )
      .join("\n\n");

    // Generate synopsis using AI
    const prompt =
      sortedVerses.length === 2
        ? `Analyze this ${connectionDesc} between two Bible verses:

${verseList}

These verses have a semantic similarity of ${Math.round(similarity * 100)}%, indicating a ${connectionType === "GOLD" ? "lexical" : connectionType === "PURPLE" ? "theological" : connectionType === "CYAN" ? "prophetic" : isLLMDiscovered ? connectionType.toLowerCase() : "semantic"} connection.

Provide a CONCISE analysis in EXACTLY 34 words or less:
1. What shared themes or concepts connect these verses
2. The theological or spiritual significance of this connection

Be direct and insightful. Focus on the "why" of the connection. Maximum 34 words.`
        : `Analyze this ${connectionDesc} connecting ${sortedVerses.length} Bible verses:

${verseList}

These verses form a connected cluster${similarity ? ` with ${Math.round(similarity * 100)}% similarity` : ""}, indicating a ${connectionType === "GOLD" ? "lexical" : connectionType === "PURPLE" ? "theological" : connectionType === "CYAN" ? "prophetic" : isLLMDiscovered ? connectionType.toLowerCase() : "semantic"} thread.

Provide a CONCISE analysis in EXACTLY 34 words or less:
1. The overarching theme or pattern connecting ALL these verses
2. The theological or spiritual significance of this connection as a whole

Be direct and synthesizing. Maximum 34 words.`;

    const result = await runModel(
      [
        {
          role: "system",
          content: SEMANTIC_CONNECTION_V1.systemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      {
        model: ENV.OPENAI_FAST_MODEL,
        verbosity: "medium",
      },
    );

    const synopsis = result.text || "Unable to generate synopsis.";

    // Log token usage for telemetry
    const tokenUsage = extractTokenUsage(
      result,
      "/api/semantic-connection/synopsis",
      ENV.OPENAI_FAST_MODEL,
      "semantic-connection-v1",
    );
    if (tokenUsage) {
      logTokenUsage(tokenUsage);
    }

    console.log(
      `[Semantic Connection] Synopsis generated for ${sortedVerses.length} verses: ${synopsis.substring(0, 100)}...`,
    );

    return res.json({
      synopsis,
      verses: sortedVerses.map(
        (v: {
          book_name: string;
          chapter: number;
          verse: number;
          text: string;
        }) => ({
          reference: `${v.book_name} ${v.chapter}:${v.verse}`,
          text: v.text,
        }),
      ),
      connectionType,
      similarity,
      verseCount: sortedVerses.length,
    });
  } catch (error) {
    console.error("[Semantic Connection] Error generating synopsis:", error);
    return res.status(500).json({ error: "Failed to generate synopsis" });
  }
});

export default router;
