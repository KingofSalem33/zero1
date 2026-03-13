/**
 * Pericope Search and Lookup
 *
 * Provides narrative-level lookup helpers and semantic search.
 */

import { supabase } from "../db";
import { makeEmbeddingClient } from "../ai";
import { ENV } from "../env";

const EMBEDDING_MODEL = ENV.EMBEDDING_MODEL_NAME || "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

export type PericopeRecord = {
  id: number;
  title: string;
  title_generated: string | null;
  subtitle: string | null;
  range_start_id: number;
  range_end_id: number;
  source: string;
  pericope_type: string | null;
  full_text: string;
  summary: string | null;
  themes: string[] | null;
  archetypes: string[] | null;
  shadows: string[] | null;
  key_figures: string[] | null;
  metadata_model: string | null;
  metadata_updated_at: string | null;
  testament: "OT" | "NT" | null;
};

export type PericopeVerseRef = {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
};

export type PericopeDetail = PericopeRecord & {
  rangeRef: string;
  verseIds: number[];
  startVerse: PericopeVerseRef;
  endVerse: PericopeVerseRef;
};

export type PericopeSearchResult = {
  id: number;
  title: string;
  similarity: number;
  rangeRef: string;
};

const formatReference = (verse: PericopeVerseRef) =>
  `${verse.book_name} ${verse.chapter}:${verse.verse}`;

const buildRangeRef = (
  startVerse: PericopeVerseRef,
  endVerse: PericopeVerseRef,
) => `${formatReference(startVerse)} - ${formatReference(endVerse)}`;

const getVerseById = async (id: number): Promise<PericopeVerseRef | null> => {
  const { data, error } = await supabase
    .from("verses")
    .select("id, book_abbrev, book_name, chapter, verse")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as PericopeVerseRef;
};

const getVerseIdsForPericope = async (
  pericopeId: number,
): Promise<number[]> => {
  const { data, error } = await supabase
    .from("verse_pericope_map")
    .select("verse_id, position_in_pericope")
    .eq("pericope_id", pericopeId)
    .order("position_in_pericope", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => row.verse_id);
};

export const buildPericopeContextBlock = (pericope: PericopeDetail): string => {
  const displayTitle =
    pericope.title_generated && pericope.title_generated.trim().length > 0
      ? pericope.title_generated.trim()
      : pericope.title;
  const summary =
    pericope.summary && pericope.summary.trim().length > 0
      ? pericope.summary.trim()
      : pericope.full_text.trim().slice(0, 420) +
        (pericope.full_text.length > 420 ? "..." : "");
  const themes =
    pericope.themes && pericope.themes.length > 0
      ? `Themes: ${pericope.themes.join(", ")}`
      : "";
  const archetypes =
    pericope.archetypes && pericope.archetypes.length > 0
      ? `Archetypes: ${pericope.archetypes.join(", ")}`
      : "";
  const shadows =
    pericope.shadows && pericope.shadows.length > 0
      ? `Shadows: ${pericope.shadows.join(", ")}`
      : "";

  return `[THE ANCHOR - WITH NARRATIVE CONTEXT]

Pericope: ${displayTitle} (${pericope.rangeRef})
${themes}
${archetypes}
${shadows}
Context: ${summary}`;
};

export const getPericopeById = async (
  pericopeId: number,
): Promise<PericopeDetail | null> => {
  const { data, error } = await supabase
    .from("pericopes")
    .select("*")
    .eq("id", pericopeId)
    .single();

  if (error || !data) return null;

  const record = data as PericopeRecord;
  const [startVerse, endVerse] = await Promise.all([
    getVerseById(record.range_start_id),
    getVerseById(record.range_end_id),
  ]);

  if (!startVerse || !endVerse) return null;

  const verseIds = await getVerseIdsForPericope(record.id);
  const rangeRef = buildRangeRef(startVerse, endVerse);

  return {
    ...record,
    rangeRef,
    verseIds,
    startVerse,
    endVerse,
  };
};

export const getPericopeForVerse = async (
  verseId: number,
  source: string = "SIL_AI",
): Promise<PericopeDetail | null> => {
  const { data, error } = await supabase
    .from("verse_pericope_map")
    .select("pericope_id")
    .eq("verse_id", verseId)
    .eq("source", source)
    .limit(1)
    .single();

  if (error || !data) return null;
  return getPericopeById(data.pericope_id);
};

export const searchPericopesByQuery = async (
  query: string,
  {
    limit = 5,
    similarityThreshold = 0.5,
    embeddingType = "full_text",
  }: {
    limit?: number;
    similarityThreshold?: number;
    embeddingType?: string;
  } = {},
): Promise<PericopeSearchResult[]> => {
  if (!ENV.EMBEDDING_API_KEY || !ENV.EMBEDDING_MODEL_NAME) {
    throw new Error("Embedding provider not configured");
  }

  const client = makeEmbeddingClient();
  if (!client) {
    throw new Error("Embedding client not configured");
  }

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const queryEmbedding = response.data[0].embedding;

  const { data, error } = await supabase.rpc("search_pericopes_by_embedding", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: similarityThreshold,
    match_count: limit,
    embedding_type_filter: embeddingType,
  });

  if (error) {
    throw new Error(`Pericope search failed: ${error.message}`);
  }

  return (
    data?.map(
      (row: {
        pericope_id: number;
        title: string;
        similarity: number;
        range_ref: string;
      }) => ({
        id: row.pericope_id,
        title: row.title,
        similarity: row.similarity,
        rangeRef: row.range_ref,
      }),
    ) || []
  );
};
