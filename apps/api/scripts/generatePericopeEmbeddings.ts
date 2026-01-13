/**
 * Generate full_text embeddings for pericopes.
 *
 * Usage:
 *   npx tsx apps/api/scripts/generatePericopeEmbeddings.ts [--start N] [--limit N] [--force]
 */

import "dotenv/config";

import { supabase } from "../src/db";
import { generateEmbeddingsBatch } from "../src/bible/semanticSearch";
import { ENV } from "../src/env";

const BATCH_SIZE = 20;
const EMBEDDING_TYPE = "full_text";
const MODEL_VERSION = "text-embedding-3-small";
const PAGE_SIZE = 1000;
const MAX_FULL_TEXT_CHARS = 7000;
const MAX_EMBEDDING_CHARS = 8000;

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
};

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const truncateText = (text: string, limit: number) => {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
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

const fetchPericopes = async (): Promise<PericopeRow[]> => {
  const rows: PericopeRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pericopes")
      .select(
        "id, title, title_generated, subtitle, full_text, summary, themes, archetypes, shadows, key_figures",
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

const fetchExistingEmbeddings = async (): Promise<Set<number>> => {
  const existing = new Set<number>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pericope_embeddings")
      .select("pericope_id")
      .eq("embedding_type", EMBEDDING_TYPE)
      .order("pericope_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data) break;
    if (data.length === 0) break;
    for (const row of data) {
      existing.add(row.pericope_id as number);
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return existing;
};

const buildEmbeddingText = (row: PericopeRow): string => {
  const title =
    row.title_generated && row.title_generated.trim().length > 0
      ? row.title_generated.trim()
      : row.title;
  const fullText = truncateText(row.full_text, MAX_FULL_TEXT_CHARS);
  const parts = [
    title,
    row.subtitle,
    row.summary,
    fullText,
    row.themes?.length ? `Themes: ${row.themes.join(", ")}` : "",
    row.archetypes?.length ? `Archetypes: ${row.archetypes.join(", ")}` : "",
    row.shadows?.length ? `Shadows: ${row.shadows.join(", ")}` : "",
    row.key_figures?.length ? `Key Figures: ${row.key_figures.join(", ")}` : "",
  ];
  const combined = parts
    .filter((part) => part && part.trim().length > 0)
    .join("\n\n");
  return truncateText(combined, MAX_EMBEDDING_CHARS);
};

async function generatePericopeEmbeddings() {
  if (!ENV.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const startIndex = getNumberArg("--start") ?? 0;
  const limit = getNumberArg("--limit") ?? 0;
  const force = process.argv.includes("--force");

  const pericopes = await fetchPericopes();
  const existing = force ? new Set<number>() : await fetchExistingEmbeddings();
  const pending = pericopes.filter((pericope) => !existing.has(pericope.id));
  const target =
    limit > 0
      ? pending.slice(startIndex, startIndex + limit)
      : pending.slice(startIndex);

  if (target.length === 0) {
    console.log("All pericopes already have embeddings.");
    return;
  }

  console.log(`Generating embeddings for ${target.length} pericopes...`);

  for (let i = 0; i < target.length; i += BATCH_SIZE) {
    const batch = target.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((row) => buildEmbeddingText(row));

    const embeddings = await generateEmbeddingsBatch(inputs);

    const rows = batch.map((row, index) => ({
      pericope_id: row.id,
      embedding_type: EMBEDDING_TYPE,
      embedding: JSON.stringify(embeddings[index]),
      token_count: estimateTokens(buildEmbeddingText(row)),
      model_version: MODEL_VERSION,
    }));

    const { error } = await supabase.from("pericope_embeddings").insert(rows);

    if (error) {
      console.error(`Insert failed for batch starting ${batch[0].id}:`, error);
    } else {
      console.log(
        `Inserted embeddings for ${batch.length} pericopes (up to id ${batch[batch.length - 1].id})`,
      );
    }
  }
}

generatePericopeEmbeddings().catch((error) => {
  console.error(error);
  process.exit(1);
});
