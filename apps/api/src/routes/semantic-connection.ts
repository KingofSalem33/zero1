import { Router } from "express";
import { supabase } from "../db";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/semantic-connection/synopsis
 * Generate AI synopsis explaining why two verses are semantically connected
 */
router.post("/synopsis", async (req, res) => {
  try {
    const { fromVerseId, toVerseId, connectionType, similarity } = req.body;

    if (!fromVerseId || !toVerseId) {
      return res
        .status(400)
        .json({ error: "fromVerseId and toVerseId are required" });
    }

    console.log(
      `[Semantic Connection] Generating synopsis for ${fromVerseId} → ${toVerseId} (${connectionType}, ${similarity})`,
    );

    // Fetch both verses from database
    const { data: verses, error } = await supabase
      .from("verses")
      .select("id, book_name, chapter, verse, text")
      .in("id", [fromVerseId, toVerseId]);

    if (error || !verses || verses.length !== 2) {
      console.error("[Semantic Connection] Error fetching verses:", error);
      return res.status(404).json({ error: "Verses not found" });
    }

    const fromVerse = verses.find((v) => v.id === fromVerseId);
    const toVerse = verses.find((v) => v.id === toVerseId);

    if (!fromVerse || !toVerse) {
      return res.status(404).json({ error: "Verses not found" });
    }

    // Determine connection description
    const connectionDescriptions = {
      GOLD: "lexical connection (same-testament, similar language and concepts)",
      PURPLE:
        "theological connection (cross-testament, expressing the same truth)",
      CYAN: "prophetic connection (Old Testament prophecy pointing to New Testament fulfillment)",
    };

    const connectionDesc =
      connectionDescriptions[
        connectionType as keyof typeof connectionDescriptions
      ] || "semantic connection";

    // Generate synopsis using AI
    const prompt = `Analyze this ${connectionDesc} between two Bible verses:

**${fromVerse.book_name} ${fromVerse.chapter}:${fromVerse.verse}**
"${fromVerse.text}"

**${toVerse.book_name} ${toVerse.chapter}:${toVerse.verse}**
"${toVerse.text}"

These verses have a semantic similarity of ${Math.round(similarity * 100)}%, indicating a ${connectionType === "GOLD" ? "lexical" : connectionType === "PURPLE" ? "theological" : "prophetic"} connection.

Provide a brief (2-3 sentences) analysis of:
1. What shared themes or concepts connect these verses
2. The theological or spiritual significance of this connection

Be concise and insightful. Focus on the "why" of the connection rather than just describing what each verse says.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a biblical scholar analyzing semantic connections between verses. Provide clear, concise insights into shared themes and theological significance.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const synopsis =
      completion.choices[0]?.message?.content || "Unable to generate synopsis.";

    console.log(
      `[Semantic Connection] Synopsis generated: ${synopsis.substring(0, 100)}...`,
    );

    res.json({
      synopsis,
      fromVerse: {
        reference: `${fromVerse.book_name} ${fromVerse.chapter}:${fromVerse.verse}`,
        text: fromVerse.text,
      },
      toVerse: {
        reference: `${toVerse.book_name} ${toVerse.chapter}:${toVerse.verse}`,
        text: toVerse.text,
      },
      connectionType,
      similarity,
    });
  } catch (error) {
    console.error("[Semantic Connection] Error generating synopsis:", error);
    res.status(500).json({ error: "Failed to generate synopsis" });
  }
});

export default router;
