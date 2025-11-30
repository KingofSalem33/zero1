import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import { ENV } from "../env";
import OpenAI from "openai";
import { BIBLE_STUDY_IDENTITY } from "../config/prompts";

const router = Router();

// Validation schema for synopsis request
const synopsisRequestSchema = z.object({
  text: z.string().min(1).max(10000), // Max 10k characters for the input text
  maxWords: z.number().min(10).max(200).optional().default(34),
});

// POST /api/synopsis - Generate a concise synopsis of highlighted text
router.post("/", readOnlyLimiter, async (req, res) => {
  try {
    const { text, maxWords } = synopsisRequestSchema.parse(req.body);

    // Check if OpenAI client is available
    if (!ENV.OPENAI_API_KEY) {
      return res.status(503).json({
        error: {
          message: "Synopsis service not configured",
          type: "service_unavailable",
          code: "synopsis_not_configured",
        },
      });
    }

    // Create OpenAI client
    const client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

    // Generate synopsis using GPT-4o-mini with scriptural context
    const response = await Promise.race([
      client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 150,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `${BIBLE_STUDY_IDENTITY}

You are providing brief scriptural insights for highlighted text. Your responses should:
- Be concise (maximum ${maxWords} words)
- Draw from KJV Scripture when relevant
- Explain the significance or key meaning
- Use plain, accessible language
- Focus on what's important or noteworthy from a biblical perspective`,
          },
          {
            role: "user",
            content: `Provide a brief scriptural insight (maximum ${maxWords} words) explaining the significance of this text from a KJV biblical perspective:

"""
${text}
"""

Brief insight (${maxWords} words or less):`,
          },
        ],
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Synopsis request timed out after 15s")),
          15000,
        ),
      ),
    ]);

    // Type assertion - we know the successful result is the completion response
    const completion = response as OpenAI.Chat.Completions.ChatCompletion;

    // Extract the synopsis from the response
    const synopsis =
      completion.choices[0]?.message?.content?.trim() ||
      "Unable to generate synopsis.";

    // Return the synopsis
    return res.json({
      synopsis,
      wordCount: synopsis.split(/\s+/).length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Synopsis validation error:", error.errors);
      return res.status(400).json({
        error: {
          message: "Invalid request parameters",
          type: "invalid_request_error",
          code: "validation_error",
          details: error.errors,
        },
      });
    }

    console.error("Synopsis generation error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to generate synopsis",
        type: "internal_server_error",
        code: "synopsis_generation_failed",
      },
    });
  }
});

export default router;
