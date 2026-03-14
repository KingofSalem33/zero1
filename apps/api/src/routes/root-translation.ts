import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import { ENV } from "../env";
import { runModel, type RunModelResult } from "../ai/runModel";
import { ROOT_TRANSLATION_V2 } from "../prompts";
import { extractTokenUsage, logTokenUsage } from "../utils/telemetry";
import fs from "fs/promises";
import path from "path";
import {
  getProfiler,
  profileSpan,
  profileTime,
} from "../profiling/requestProfiler";
import { buildRootTranslationFallbackText } from "./rootTranslationFallback";

const router = Router();

// Validation schema for root translation request
const rootTranslationRequestSchema = z.object({
  selectedText: z.string().min(1).max(1000),
  maxWords: z.number().min(10).max(200).optional().default(100),
  book: z.string().optional(),
  chapter: z.number().optional(),
  verse: z.number().optional(),
  verses: z.array(z.number().min(1)).optional(),
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

interface StrongsWord {
  text: string;
  strongs?: string; // e.g., "H7225" or "G1722"
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

function extractStrongsWords(verseText: string): StrongsWord[] {
  const words: StrongsWord[] = [];
  const regex = /(\S+?)(?:\[([HG]\d+)\])?(?:\s|$)/g;

  let match;
  while ((match = regex.exec(verseText)) !== null) {
    const text = match[1];
    const strongs = match[2];
    words.push({ text, strongs });
  }

  return words;
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

// "Where Else?" feature temporarily disabled - was causing 30+ second delays
// TODO: Re-enable once database population is complete and optimized

// POST /api/root-translation - Generate translation using Strong's Concordance
router.post("/", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("root_translation");
    profiler?.markHandlerStart();
    const rootTranslationModel =
      ENV.OPENAI_SMART_MODEL || ENV.OPENAI_MODEL_NAME;

    const { selectedText, book, chapter, verse, verses } = await profileTime(
      "root_translation.zod_parse",
      () => rootTranslationRequestSchema.parse(req.body),
      {
        file: "routes/root-translation.ts",
        fn: "rootTranslationRequestSchema.parse",
      },
    );

    console.log("[Root Translation] Request received:", {
      selectedText: selectedText.substring(0, 50),
      book,
      chapter,
      verse,
      verses,
    });

    // For now, we'll need to match the selected text to a Bible verse
    // This is a simplified version - in production you'd want more robust verse detection
    // For the MVP, we'll search through the Bible to find matching text with Strong's numbers

    // Load the lexicon
    const lexicon = await profileTime(
      "root_translation.loadLexicon",
      () => loadLexicon(),
      { file: "routes/root-translation.ts", fn: "loadLexicon" },
    );
    const dataPath = await profileTime(
      "root_translation.findStrongsDataPath",
      () => findStrongsDataPath(),
      { file: "routes/root-translation.ts", fn: "findStrongsDataPath" },
    );

    let verseWithStrongs: string | null = null;

    const verseNumbers =
      Array.isArray(verses) && verses.length ? verses : verse ? [verse] : [];
    const normalizedVerses = Array.from(
      new Set(verseNumbers.filter((num) => Number.isFinite(num) && num > 0)),
    ).sort((a, b) => a - b);

    const verseTexts: Array<{ number: number; text: string }> = [];

    // If book/chapter/verse(s) provided, load directly from Strong's Bible
    if (book && chapter && normalizedVerses.length) {
      const directStart = process.hrtime.bigint();
      try {
        const bookAbbrev = BOOK_TO_ABBREV[book];

        if (bookAbbrev) {
          const bookPath = path.join(dataPath, `${bookAbbrev}.json`);
          const bookData = JSON.parse(
            await profileTime(
              "root_translation.readBookFile",
              () => fs.readFile(bookPath, "utf-8"),
              { file: "routes/root-translation.ts", fn: "fs.readFile" },
            ),
          );
          const chapterKey = `${bookAbbrev}|${chapter}`;

          for (const verseNum of normalizedVerses) {
            const verseKey = `${bookAbbrev}|${chapter}|${verseNum}`;
            const verseData = bookData[bookAbbrev]?.[chapterKey]?.[verseKey];
            if (verseData?.en) {
              verseTexts.push({ number: verseNum, text: verseData.en });
            }
          }

          if (verseTexts.length) {
            verseWithStrongs = verseTexts
              .map((v) => `[${book} ${chapter}:${v.number}] ${v.text}`)
              .join(" ");
            console.log(
              `[Strong's] Loaded verses directly: ${book} ${chapter}:${normalizedVerses.join(",")}`,
            );
          }
        }
      } catch (error) {
        console.error("[Strong's] Error loading verse directly:", error);
        // Fall through to search method
      }
      profileSpan(
        "root_translation.direct_lookup",
        directStart,
        process.hrtime.bigint(),
        { file: "routes/root-translation.ts", fn: "direct_lookup" },
      );
    }

    // Fallback: Search through common books if not found directly
    if (!verseWithStrongs) {
      const fallbackStart = process.hrtime.bigint();
      const commonBooks = ["Jhn", "Gen", "Psa", "Mat", "Rom"];

      for (const bookAbbrev of commonBooks) {
        try {
          const bookPath = path.join(dataPath, `${bookAbbrev}.json`);
          const bookData = JSON.parse(
            await profileTime(
              "root_translation.readBookFile",
              () => fs.readFile(bookPath, "utf-8"),
              { file: "routes/root-translation.ts", fn: "fs.readFile" },
            ),
          );

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
      profileSpan(
        "root_translation.fallback_search",
        fallbackStart,
        process.hrtime.bigint(),
        { file: "routes/root-translation.ts", fn: "fallback_search" },
      );
    }

    if (!verseWithStrongs) {
      // Fallback: just return a generic translation message
      return res.json({
        words: [],
        lostContext:
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
        words: [],
        lostContext: "No Strong's numbers found for this text.",
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
        words: [],
        lostContext: "Strong's definitions not available for this text.",
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

    const wordsSourceText = verseTexts.length
      ? verseTexts.map((v) => v.text).join(" ")
      : verseWithStrongs;
    const wordEntries = extractStrongsWords(wordsSourceText);
    const wordMappings = wordEntries.map((word) => {
      const entry = word.strongs ? lexicon[word.strongs] : undefined;
      return {
        english: word.text,
        original: entry?.Hb_word || entry?.Gk_word || "",
        strongs: word.strongs || null,
        definition: entry?.strongs_def || "",
      };
    });

    let lostContext = "Unable to generate root translation.";
    const lexicalFallbackText = buildRootTranslationFallbackText({
      selectedText,
      language,
      words: wordMappings.map((word) => ({
        english: word.english,
        strongs: word.strongs,
      })),
      definitions: definitions.map(({ number, entry }) => ({
        number,
        transliteration: entry.transliteration || "",
        definition: entry.strongs_def || "",
      })),
    });

    if (!ENV.AI_API_KEY) {
      console.warn(
        "[ROOT] AI API key unavailable; returning lexical fallback summary.",
      );
      lostContext = lexicalFallbackText;
    } else {
      try {
        const result = (await profileTime(
          "root_translation.runModel",
          () =>
            Promise.race([
              runModel(
                [
                  {
                    role: "system",
                    content: ROOT_TRANSLATION_V2.buildSystem(),
                  },
                  {
                    role: "user",
                    content: ROOT_TRANSLATION_V2.buildUser({
                      selectedText,
                      verseWithStrongs,
                      groundingData,
                    }),
                  },
                ],
                {
                  model: rootTranslationModel,
                  verbosity: "medium",
                  promptCacheKey: "root-translation-v2",
                },
              ),
              new Promise((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error("Root translation request timed out after 30s"),
                    ),
                  30000,
                ),
              ),
            ]),
          {
            file: "ai/runModel.ts",
            fn: "runModel",
            await: "client.responses.create",
            model: rootTranslationModel,
          },
        )) as RunModelResult;

        // Log token usage for telemetry
        const tokenUsage = extractTokenUsage(
          result,
          "/api/root-translation",
          rootTranslationModel,
          "root-translation-v2",
        );
        if (tokenUsage) {
          logTokenUsage(tokenUsage);
        }

        lostContext =
          result.text?.replace(/Strong\u2019s/g, "Strong's").trim() ||
          lexicalFallbackText;
      } catch (error) {
        console.warn(
          "[ROOT] Falling back to lexical summary after model failure:",
          error,
        );
        lostContext = lexicalFallbackText;
      }
    }

    console.log("[ROOT] Lost in translation analysis:", lostContext);

    // Return the translation
    return res.json({
      words: wordMappings,
      lostContext,
      language: language,
      strongsUsed: strongsNumbers,
      versesIncluded: verseTexts.length || 1,
      totalWords: lostContext.split(/\s+/).length,
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
