import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import { ENV } from "../env";
import OpenAI from "openai";

const router = Router();

// Validation schema for TTS request
const ttsRequestSchema = z.object({
  text: z.string().min(1).max(4096), // OpenAI TTS has 4096 character limit
  voice: z
    .enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"])
    .optional()
    .default("onyx"),
  model: z.enum(["tts-1", "tts-1-hd"]).optional().default("tts-1"),
  speed: z.number().min(0.25).max(4.0).optional().default(1.0),
});

// POST /api/tts - Generate speech from text
router.post("/", readOnlyLimiter, async (req, res) => {
  try {
    console.log("TTS request body:", JSON.stringify(req.body, null, 2));
    const { text, voice, model, speed } = ttsRequestSchema.parse(req.body);

    // Check if OpenAI client is available
    if (!ENV.OPENAI_API_KEY) {
      return res.status(503).json({
        error: {
          message: "Text-to-speech service not configured",
          type: "service_unavailable",
          code: "tts_not_configured",
        },
      });
    }

    // Create OpenAI client for TTS
    const client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

    console.log("Calling OpenAI TTS API...");

    // Generate speech with timeout
    const mp3Result = await Promise.race([
      client.audio.speech.create({
        model,
        voice,
        input: text,
        speed,
        response_format: "mp3",
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("TTS request timed out after 30s")),
          30000,
        ),
      ),
    ]);

    // Type assertion - we know the successful result is the speech response
    const mp3 = mp3Result as Awaited<
      ReturnType<typeof client.audio.speech.create>
    >;

    console.log("TTS API call successful");

    // Convert response to buffer
    const buffer = Buffer.from(await mp3.arrayBuffer());

    // Set headers for audio streaming
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    // Send audio
    return res.send(buffer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(
        "TTS validation error:",
        JSON.stringify(error.errors, null, 2),
      );
      return res.status(400).json({
        error: {
          message: "Invalid request parameters",
          type: "invalid_request_error",
          code: "validation_error",
          details: error.errors,
        },
      });
    }

    console.error("TTS generation error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to generate speech",
        type: "internal_server_error",
        code: "tts_generation_failed",
      },
    });
  }
});

export default router;
