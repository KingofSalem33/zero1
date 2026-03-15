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

const PERICOPE_SELECT =
  "id, title, title_generated, subtitle, range_start_id, range_end_id, source, pericope_type, full_text, summary, themes, archetypes, shadows, key_figures, metadata_model, metadata_updated_at, testament";
const VERSE_REF_SELECT = "id, book_abbrev, book_name, chapter, verse";

const formatReference = (verse: PericopeVerseRef) =>
  `${verse.book_name} ${verse.chapter}:${verse.verse}`;

const buildRangeRef = (
  startVerse: PericopeVerseRef,
  endVerse: PericopeVerseRef,
) => `${formatReference(startVerse)} - ${formatReference(endVerse)}`;

const getVerseRefsByIds = async (
  verseIds: number[],
): Promise<Map<number, PericopeVerseRef>> => {
  const refs = new Map<number, PericopeVerseRef>();
  if (verseIds.length === 0) return refs;

  const { data, error } = await supabase
    .from("verses")
    .select(VERSE_REF_SELECT)
    .in("id", Array.from(new Set(verseIds)));

  if (error || !data) return refs;

  (data as PericopeVerseRef[]).forEach((row) => {
    refs.set(row.id, row);
  });

  return refs;
};

const getVerseIdsForPericopes = async (
  pericopeIds: number[],
): Promise<Map<number, number[]>> => {
  const verseIdsByPericope = new Map<number, number[]>();
  if (pericopeIds.length === 0) return verseIdsByPericope;

  const { data, error } = await supabase
    .from("verse_pericope_map")
    .select("pericope_id, verse_id, position_in_pericope")
    .in("pericope_id", Array.from(new Set(pericopeIds)))
    .order("position_in_pericope", { ascending: true });

  if (error || !data) return verseIdsByPericope;

  data.forEach((row) => {
    const verseIds = verseIdsByPericope.get(row.pericope_id) ?? [];
    verseIds.push(row.verse_id);
    verseIdsByPericope.set(row.pericope_id, verseIds);
  });

  return verseIdsByPericope;
};

const hydratePericopeDetails = async (
  records: PericopeRecord[],
): Promise<PericopeDetail[]> => {
  if (records.length === 0) return [];

  const [verseRefsById, verseIdsByPericope] = await Promise.all([
    getVerseRefsByIds(
      records.flatMap((record) => [record.range_start_id, record.range_end_id]),
    ),
    getVerseIdsForPericopes(records.map((record) => record.id)),
  ]);

  const details: PericopeDetail[] = [];
  records.forEach((record) => {
    const startVerse = verseRefsById.get(record.range_start_id);
    const endVerse = verseRefsById.get(record.range_end_id);
    if (!startVerse || !endVerse) return;

    details.push({
      ...record,
      rangeRef: buildRangeRef(startVerse, endVerse),
      verseIds: verseIdsByPericope.get(record.id) ?? [],
      startVerse,
      endVerse,
    });
  });

  return details;
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

export const getPericopesByIds = async (
  pericopeIds: number[],
): Promise<PericopeDetail[]> => {
  const uniqueIds = Array.from(new Set(pericopeIds));
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from("pericopes")
    .select(PERICOPE_SELECT)
    .in("id", uniqueIds);

  if (error || !data) return [];

  const recordsById = new Map<number, PericopeRecord>();
  (data as PericopeRecord[]).forEach((record) => {
    recordsById.set(record.id, record);
  });

  const orderedRecords = uniqueIds
    .map((id) => recordsById.get(id))
    .filter((record): record is PericopeRecord => !!record);

  return hydratePericopeDetails(orderedRecords);
};

export const getPericopeById = async (
  pericopeId: number,
): Promise<PericopeDetail | null> => {
  const [detail] = await getPericopesByIds([pericopeId]);
  return detail ?? null;
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
