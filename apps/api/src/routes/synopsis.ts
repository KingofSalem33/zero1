import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import { ENV } from "../env";
import { runModel, type RunModelResult } from "../ai/runModel";
import { SYNOPSIS_V1 } from "../prompts";
import { extractTokenUsage, logTokenUsage } from "../utils/telemetry";

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

    // Generate synopsis using GPT-5-nano with scriptural context
    const result = (await Promise.race([
      runModel(
        [
          {
            role: "system",
            content: SYNOPSIS_V1.buildSystem({ maxWords }),
          },
          {
            role: "user",
            content: SYNOPSIS_V1.buildUser(text, maxWords),
          },
        ],
        {
          model: "gpt-4o-mini",
          verbosity: "medium",
        },
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Synopsis request timed out after 15s")),
          15000,
        ),
      ),
    ])) as RunModelResult;

    // Extract the synopsis from the response
    const synopsis = result.text || "Unable to generate synopsis.";

    // Log token usage for telemetry
    const tokenUsage = extractTokenUsage(
      result,
      "/api/synopsis",
      "gpt-4o-mini",
      "synopsis-v1",
    );
    if (tokenUsage) {
      logTokenUsage(tokenUsage);
    }

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
