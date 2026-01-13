/**
 * Enrich pericopes with LLM-generated titles and graph metadata.
 *
 * Usage:
 *   npx tsx apps/api/scripts/enrichPericopeMetadata.ts
 */

import "dotenv/config";

import { supabase } from "../src/db";
import { runModel } from "../src/ai/runModel";
import { ENV } from "../src/env";

type PericopeRow = {
  id: number;
  title: string;
  title_generated: string | null;
  subtitle: string | null;
  full_text: string;
  summary: string | null;
  themes: string[] | null;
  archetypes: string[] | null;
  shadows: string[] | null;
  key_figures: string[] | null;
  range_start_id: number;
  range_end_id: number;
};

type VerseRef = {
  id: number;
  book_name: string;
  chapter: number;
  verse: number;
};

type PericopeMetadata = {
  title: string;
  summary: string;
  themes: string[];
  archetypes: string[];
  shadows: string[];
  key_figures: string[];
};

const MAX_TEXT_CHARS = 1800;
const BATCH_SIZE = 5;
const PAGE_SIZE = 1000;

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const getNumberArg = (flag: string): number | null => {
  const withEquals = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (withEquals) {
    const value = Number.parseInt(withEquals.split("=")[1] ?? "", 10);
    return Number.isFinite(value) ? value : null;
  }
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = Number.parseInt(process.argv[idx + 1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
};

const formatVerseRef = (verse: VerseRef) =>
  `${verse.book_name} ${verse.chapter}:${verse.verse}`;

const buildRangeRef = (start: VerseRef, end: VerseRef) =>
  `${formatVerseRef(start)} - ${formatVerseRef(end)}`;

const fetchPericopes = async (): Promise<PericopeRow[]> => {
  const rows: PericopeRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pericopes")
      .select(
        "id, title, title_generated, subtitle, full_text, summary, themes, archetypes, shadows, key_figures, range_start_id, range_end_id",
      )
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data) {
      throw new Error(
        `Failed to fetch pericopes: ${error?.message || "unknown"}`,
      );
    }

    if (data.length === 0) break;
    rows.push(...(data as PericopeRow[]));

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
};

const fetchVerseRefs = async (
  ids: number[],
): Promise<Map<number, VerseRef>> => {
  const verseMap = new Map<number, VerseRef>();
  for (const chunk of chunkArray(ids, 500)) {
    const { data, error } = await supabase
      .from("verses")
      .select("id, book_name, chapter, verse")
      .in("id", chunk);

    if (error || !data) {
      throw new Error(`Failed to fetch verses: ${error?.message || "unknown"}`);
    }
    for (const row of data as VerseRef[]) {
      verseMap.set(row.id, row);
    }
  }
  return verseMap;
};

const buildPrompt = (
  pericope: PericopeRow,
  rangeRef: string,
): { system: string; user: string } => {
  const text =
    pericope.full_text.length > MAX_TEXT_CHARS
      ? `${pericope.full_text.slice(0, MAX_TEXT_CHARS)}...`
      : pericope.full_text;

  return {
    system:
      "You generate Bible pericope metadata. Use a reverent but accessible tone. Avoid archaic wording. Return only JSON that matches the schema.",
    user: `Pericope range: ${rangeRef}
Source heading: ${pericope.title}
Subtitle: ${pericope.subtitle || "None"}

Text:
${text}

Requirements:
- Title: 4-8 words, clear and inviting, not heavy KJV diction.
- Summary: one sentence, plain but reverent.
- Themes: 3-7 canonical themes.
- Archetypes: 1-4 narrative roles.
- Shadows: 0-3 typological foreshadows only if clear.
- Key figures: 0-6 people or named entities.`,
  };
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    themes: { type: "array", items: { type: "string" }, maxItems: 7 },
    archetypes: { type: "array", items: { type: "string" }, maxItems: 4 },
    shadows: { type: "array", items: { type: "string" }, maxItems: 3 },
    key_figures: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
  required: [
    "title",
    "summary",
    "themes",
    "archetypes",
    "shadows",
    "key_figures",
  ],
};

const parseMetadata = (text: string): PericopeMetadata => {
  const parsed = JSON.parse(text) as PericopeMetadata;
  return parsed;
};

async function enrichPericopes() {
  if (!ENV.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const pericopes = await fetchPericopes();
  const startIndex = getNumberArg("--start") ?? 0;
  const limit = getNumberArg("--limit") ?? 0;

  const windowed =
    limit > 0
      ? pericopes.slice(startIndex, startIndex + limit)
      : pericopes.slice(startIndex);
  const target = windowed.filter(
    (row) =>
      !row.title_generated ||
      !row.summary ||
      !row.themes ||
      !row.archetypes ||
      !row.shadows,
  );

  if (target.length === 0) {
    console.log("No pericopes require enrichment.");
    return;
  }

  const verseIds = Array.from(
    new Set(target.flatMap((row) => [row.range_start_id, row.range_end_id])),
  );
  const verseMap = await fetchVerseRefs(verseIds);

  console.log(
    `Enriching ${target.length} pericopes from window size ${windowed.length}...`,
  );

  for (const batch of chunkArray(target, BATCH_SIZE)) {
    await Promise.all(
      batch.map(async (pericope) => {
        const startVerse = verseMap.get(pericope.range_start_id);
        const endVerse = verseMap.get(pericope.range_end_id);
        if (!startVerse || !endVerse) return;

        const rangeRef = buildRangeRef(startVerse, endVerse);
        const { system, user } = buildPrompt(pericope, rangeRef);

        let metadata: PericopeMetadata;
        try {
          const result = await runModel(
            [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            {
              responseFormat: {
                type: "json_schema",
                json_schema: {
                  name: "pericope_metadata",
                  strict: true,
                  schema: responseSchema,
                },
              },
              verbosity: "medium",
            },
          );
          metadata = parseMetadata(result.text);
        } catch {
          console.error(`Failed to parse metadata for pericope ${pericope.id}`);
          return;
        }

        const { error: updateError } = await supabase
          .from("pericopes")
          .update({
            title_generated: metadata.title,
            summary: metadata.summary,
            themes: metadata.themes,
            archetypes: metadata.archetypes,
            shadows: metadata.shadows,
            key_figures: metadata.key_figures,
            metadata_model: ENV.OPENAI_MODEL_NAME,
            metadata_updated_at: new Date().toISOString(),
          })
          .eq("id", pericope.id);

        if (updateError) {
          console.error(
            `Update failed for pericope ${pericope.id}: ${updateError.message}`,
          );
        } else {
          console.log(`Enriched pericope ${pericope.id} (${rangeRef})`);
        }
      }),
    );
  }
}

enrichPericopes().catch((error) => {
  console.error(error);
  process.exit(1);
});
