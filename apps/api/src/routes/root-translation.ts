import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import { ENV } from "../env";
import OpenAI from "openai";
import { BIBLE_STUDY_IDENTITY } from "../config/prompts";
import fs from "fs/promises";
import path from "path";

const router = Router();

// Validation schema for root translation request
const rootTranslationRequestSchema = z.object({
  selectedText: z.string().min(1).max(1000),
  maxWords: z.number().min(10).max(200).optional().default(100),
  book: z.string().optional(),
  chapter: z.number().optional(),
  verse: z.number().optional(),
});

interface StrongsLexiconEntry {
  Hb_word?: string;
  Gk_word?: string;
  transliteration: string;
  strongs_def: string;
  part_of_speech: string;
  root_word: string;
  occurrences: string;
  outline_usage: string;
}

// Mapping from full book names to abbreviations
const BOOK_TO_ABBREV: Record<string, string> = {
  Genesis: "Gen",
  Exodus: "Exo",
  Leviticus: "Lev",
  Numbers: "Num",
  Deuteronomy: "Deu",
  Joshua: "Jos",
  Judges: "Jdg",
  Ruth: "Rth",
  "1 Samuel": "1Sa",
  "2 Samuel": "2Sa",
  "1 Kings": "1Ki",
  "2 Kings": "2Ki",
  "1 Chronicles": "1Ch",
  "2 Chronicles": "2Ch",
  Ezra: "Ezr",
  Nehemiah: "Neh",
  Esther: "Est",
  Job: "Job",
  Psalms: "Psa",
  Proverbs: "Pro",
  Ecclesiastes: "Ecc",
  "Song of Solomon": "Sng",
  Isaiah: "Isa",
  Jeremiah: "Jer",
  Lamentations: "Lam",
  Ezekiel: "Eze",
  Daniel: "Dan",
  Hosea: "Hos",
  Joel: "Joe",
  Amos: "Amo",
  Obadiah: "Oba",
  Jonah: "Jon",
  Micah: "Mic",
  Nahum: "Nah",
  Habakkuk: "Hab",
  Zephaniah: "Zep",
  Haggai: "Hag",
  Zechariah: "Zec",
  Malachi: "Mal",
  Matthew: "Mat",
  Mark: "Mar",
  Luke: "Luk",
  John: "Jhn",
  Acts: "Act",
  Romans: "Rom",
  "1 Corinthians": "1Co",
  "2 Corinthians": "2Co",
  Galatians: "Gal",
  Ephesians: "Eph",
  Philippians: "Phl",
  Colossians: "Col",
  "1 Thessalonians": "1Th",
  "2 Thessalonians": "2Th",
  "1 Timothy": "1Ti",
  "2 Timothy": "2Ti",
  Titus: "Tit",
  Philemon: "Phm",
  Hebrews: "Heb",
  James: "Jas",
  "1 Peter": "1Pe",
  "2 Peter": "2Pe",
  "1 John": "1Jo",
  "2 John": "2Jo",
  "3 John": "3Jo",
  Jude: "Jde",
  Revelation: "Rev",
};

// Cache the lexicon in memory to avoid repeated file reads
let lexiconCache: Record<string, StrongsLexiconEntry> | null = null;
let strongsDataPath: string | null = null;

// Find the Strong's data directory (try multiple possible locations in monorepo)
async function findStrongsDataPath(): Promise<string> {
  if (strongsDataPath) {
    return strongsDataPath;
  }

  const possiblePaths = [
    path.join(process.cwd(), "public", "bible", "strongs"),
    path.join(process.cwd(), "..", "..", "public", "bible", "strongs"),
    path.join(__dirname, "..", "..", "..", "..", "public", "bible", "strongs"),
  ];

  for (const testPath of possiblePaths) {
    try {
      await fs.access(path.join(testPath, "lexicon.json"));
      strongsDataPath = testPath;
      console.log(`[Strong's] Found data directory at: ${testPath}`);
      return testPath;
    } catch {
      continue;
    }
  }

  throw new Error("Strong's Concordance data directory not found");
}

async function loadLexicon(): Promise<Record<string, StrongsLexiconEntry>> {
  if (lexiconCache) {
    return lexiconCache;
  }

  try {
    const dataPath = await findStrongsDataPath();
    const lexiconPath = path.join(dataPath, "lexicon.json");
    const data = await fs.readFile(lexiconPath, "utf-8");
    lexiconCache = JSON.parse(data);
    return lexiconCache!;
  } catch (error) {
    console.error("Failed to load Strong's lexicon:", error);
    throw new Error("Could not load Strong's Concordance data");
  }
}

function extractStrongsNumbers(text: string): string[] {
  const regex = /\[([HG]\d+)\]/g;
  const numbers = new Set<string>();

  let match;
  while ((match = regex.exec(text)) !== null) {
    numbers.add(match[1]);
  }

  return Array.from(numbers);
}

function detectLanguage(
  strongsNumbers: string[],
): "Hebrew" | "Greek" | "mixed" {
  const hasHebrew = strongsNumbers.some((num) => num.startsWith("H"));
  const hasGreek = strongsNumbers.some((num) => num.startsWith("G"));

  if (hasHebrew && hasGreek) return "mixed";
  if (hasHebrew) return "Hebrew";
  return "Greek";
}

function stripStrongsNumbers(text: string): string {
  return text.replace(/\[([HG]\d+)\]/g, "");
}

// POST /api/root-translation - Generate translation using Strong's Concordance
router.post("/", readOnlyLimiter, async (req, res) => {
  try {
    const { selectedText, book, chapter, verse } =
      rootTranslationRequestSchema.parse(req.body);

    console.log("[Root Translation] Request received:", {
      selectedText: selectedText.substring(0, 50),
      book,
      chapter,
      verse,
    });

    // Check if OpenAI client is available
    if (!ENV.OPENAI_API_KEY) {
      return res.status(503).json({
        error: {
          message: "Root translation service not configured",
          type: "service_unavailable",
          code: "root_translation_not_configured",
        },
      });
    }

    // For now, we'll need to match the selected text to a Bible verse
    // This is a simplified version - in production you'd want more robust verse detection
    // For the MVP, we'll search through the Bible to find matching text with Strong's numbers

    // Load the lexicon
    const lexicon = await loadLexicon();
    const dataPath = await findStrongsDataPath();

    let verseWithStrongs: string | null = null;

    // If book/chapter/verse provided, load directly from Strong's Bible
    if (book && chapter && verse) {
      try {
        const bookAbbrev = BOOK_TO_ABBREV[book];

        if (bookAbbrev) {
          const bookPath = path.join(dataPath, `${bookAbbrev}.json`);
          const bookData = JSON.parse(await fs.readFile(bookPath, "utf-8"));
          const chapterKey = `${bookAbbrev}|${chapter}`;
          const verseKey = `${bookAbbrev}|${chapter}|${verse}`;

          const verseData = bookData[bookAbbrev]?.[chapterKey]?.[verseKey];
          if (verseData?.en) {
            verseWithStrongs = verseData.en;
            console.log(
              `[Strong's] Loaded verse directly: ${book} ${chapter}:${verse}`,
            );
          }
        }
      } catch (error) {
        console.error("[Strong's] Error loading verse directly:", error);
        // Fall through to search method
      }
    }

    // Fallback: Search through common books if not found directly
    if (!verseWithStrongs) {
      const commonBooks = ["Jhn", "Gen", "Psa", "Mat", "Rom"];

      for (const bookAbbrev of commonBooks) {
        try {
          const bookPath = path.join(dataPath, `${bookAbbrev}.json`);
          const bookData = JSON.parse(await fs.readFile(bookPath, "utf-8"));

          // Search through chapters and verses
          const book = bookData[bookAbbrev];
          if (!book) continue;

          for (const chapterKey of Object.keys(book)) {
            const chapter = book[chapterKey];
            for (const verseKey of Object.keys(chapter)) {
              const verse = chapter[verseKey];
              if (verse.en) {
                const cleanVerse = stripStrongsNumbers(verse.en);
                // Check if selected text is in this verse
                if (
                  cleanVerse.includes(selectedText) ||
                  selectedText.includes(cleanVerse.substring(0, 30))
                ) {
                  verseWithStrongs = verse.en;
                  // matchedBook = bookAbbrev; // Not currently used
                  break;
                }
              }
            }
            if (verseWithStrongs) break;
          }
          if (verseWithStrongs) break;
        } catch {
          // Book file doesn't exist or can't be read, continue to next
          continue;
        }
      }
    }

    if (!verseWithStrongs) {
      // Fallback: just return a generic translation message
      return res.json({
        translation:
          "Root translation is available for Bible text from the Bible Reader. Please select text directly from the Bible to see the original Hebrew or Greek meanings.",
        language: "unknown",
        strongsUsed: [],
      });
    }

    // Extract Strong's numbers from the matched verse
    const strongsNumbers = extractStrongsNumbers(verseWithStrongs);
    const language = detectLanguage(strongsNumbers);

    if (strongsNumbers.length === 0) {
      return res.json({
        translation: "No Strong's numbers found for this text.",
        language: "unknown",
        strongsUsed: [],
      });
    }

    // Get definitions for each Strong's number
    const definitions: Array<{ number: string; entry: StrongsLexiconEntry }> =
      [];
    for (const num of strongsNumbers) {
      if (lexicon[num]) {
        definitions.push({ number: num, entry: lexicon[num] });
      }
    }

    if (definitions.length === 0) {
      return res.json({
        translation: "Strong's definitions not available for this text.",
        language: language,
        strongsUsed: strongsNumbers,
      });
    }

    // Build grounding data for LLM
    const groundingData = definitions
      .map(({ number, entry }) => {
        const originalWord = entry.Hb_word || entry.Gk_word || "";
        return `${number}: "${originalWord}" (${entry.transliteration})
- Definition: ${entry.strongs_def}
- Part of speech: ${entry.part_of_speech}
- Usage: ${entry.outline_usage.substring(0, 200)}...`;
      })
      .join("\n\n");

    // Create OpenAI client
    const client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

    // Generate translation using GPT-4o-mini with Strong's Concordance grounding
    const response = await Promise.race([
      client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 250,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `${BIBLE_STUDY_IDENTITY}

You are providing ROOT translations using Strong's Concordance.

Output your response in this EXACT format:

ROOTS:
- [Word]: [what this word reveals - concise insight, not just definition]
- [Word]: [what this word reveals]
(continue for key words)

PLAIN:
[One sentence plain-language paraphrase synthesizing the insights]

Rules:
- Focus on what each word REVEALS (implications, nuances, depth), not just dictionary meanings
- Use ONLY the Strong's data provided - do not invent meanings
- Keep each insight to one phrase (10-15 words max)
- Make insights read like illumination, not inspection
- Plain meaning should flow naturally and synthesize the root insights
- Use accessible language while being accurate`,
          },
          {
            role: "user",
            content: `Using ONLY the Strong's Concordance data below, provide ROOT translation insight:

Selected text: "${selectedText}"

Verse with Strong's numbers: ${verseWithStrongs}

Strong's Concordance Data:
${groundingData}

Generate the response in the format specified (ROOTS: then PLAIN:):`,
          },
        ],
      }),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(new Error("Root translation request timed out after 20s")),
          20000,
        ),
      ),
    ]);

    // Type assertion - we know the successful result is the completion response
    const completion = response as OpenAI.Chat.Completions.ChatCompletion;

    // Extract the translation from the response
    const translation =
      completion.choices[0]?.message?.content?.trim() ||
      "Unable to generate root translation.";

    // Return the translation
    return res.json({
      translation,
      language: language,
      strongsUsed: strongsNumbers,
      versesIncluded: 1,
      totalWords: translation.split(/\s+/).length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Root translation validation error:", error.errors);
      return res.status(400).json({
        error: {
          message: "Invalid request parameters",
          type: "invalid_request_error",
          code: "validation_error",
          details: error.errors,
        },
      });
    }

    console.error("Root translation generation error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to generate root translation",
        type: "internal_server_error",
        code: "root_translation_failed",
      },
    });
  }
});

export default router;
