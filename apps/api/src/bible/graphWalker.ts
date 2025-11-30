/**
 * Graph Walker: Budgeted BFS for Expanding Ring Architecture
 *
 * This module walks the Bible cross-reference graph using breadth-first search
 * with hard caps to prevent data explosion.
 *
 * Architecture:
 * - Ring 0: Anchor verse ± 3 verses (immediate context)
 * - Ring 1: Direct cross-references (max 20)
 * - Ring 2: References of references (max 30)
 * - Ring 3: Deep thematic links (max 40)
 */

import { supabase } from "../db";

export interface Verse {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface ContextBundle {
  anchor: Verse;
  ring0: Verse[]; // Surrounding passage (±3 verses)
  ring1: Verse[]; // Direct cross-refs
  ring2: Verse[]; // Refs of refs
  ring3: Verse[]; // Deep links
}

export interface RingConfig {
  ring0Radius: number; // How many verses before/after anchor (default: 3)
  ring1Limit: number;  // Max direct refs (default: 20)
  ring2Limit: number;  // Max secondary refs (default: 30)
  ring3Limit: number;  // Max tertiary refs (default: 40)
}

const DEFAULT_CONFIG: RingConfig = {
  ring0Radius: 3,
  ring1Limit: 20,
  ring2Limit: 30,
  ring3Limit: 40,
};

/**
 * Build context bundle using budgeted BFS graph traversal
 */
export async function buildContextBundle(
  anchorId: number,
  config: Partial<RingConfig> = {}
): Promise<ContextBundle> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  console.log(`[Graph Walker] Building context bundle for verse ID ${anchorId}`);
  console.log(`[Graph Walker] Config:`, cfg);

  // ========================================
  // RING 0: Anchor + Surrounding Context
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 0 (±${cfg.ring0Radius} verses)...`);

  const { data: ring0Data, error: ring0Error } = await supabase
    .from("verses")
    .select("*")
    .gte("id", anchorId - cfg.ring0Radius)
    .lte("id", anchorId + cfg.ring0Radius)
    .order("id", { ascending: true });

  if (ring0Error) {
    console.error("[Graph Walker] Ring 0 fetch failed:", ring0Error);
    throw new Error(`Failed to fetch Ring 0: ${ring0Error.message}`);
  }

  const ring0 = ring0Data as Verse[];
  const anchor = ring0.find((v) => v.id === anchorId);

  if (!anchor) {
    throw new Error(`Anchor verse ID ${anchorId} not found`);
  }

  console.log(`[Graph Walker] Ring 0: ${ring0.length} verses`);
  console.log(`[Graph Walker] Anchor: ${anchor.book_name} ${anchor.chapter}:${anchor.verse}`);

  // Extract IDs for next layer
  const ring0Ids = ring0.map((v) => v.id);

  // ========================================
  // RING 1: Direct Cross-References
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 1 (max ${cfg.ring1Limit})...`);

  const ring1Ids = await fetchLayer(ring0Ids, cfg.ring1Limit, new Set());
  const ring1 = await hydrateVerses(ring1Ids);

  console.log(`[Graph Walker] Ring 1: ${ring1.length} verses`);

  // ========================================
  // RING 2: References of References
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 2 (max ${cfg.ring2Limit})...`);

  const excludeSet = new Set([...ring0Ids, ...ring1Ids]);
  const ring2IdsRaw = await fetchLayer(ring1Ids, cfg.ring2Limit, excludeSet);
  const ring2Ids = ring2IdsRaw.filter((id) => !excludeSet.has(id));
  const ring2 = await hydrateVerses(ring2Ids);

  console.log(`[Graph Walker] Ring 2: ${ring2.length} verses`);

  // ========================================
  // RING 3: Deep Thematic Links
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 3 (max ${cfg.ring3Limit})...`);

  excludeSet.add(...ring2Ids);
  const ring3IdsRaw = await fetchLayer(ring2Ids, cfg.ring3Limit, excludeSet);
  const ring3Ids = ring3IdsRaw.filter((id) => !excludeSet.has(id));
  const ring3 = await hydrateVerses(ring3Ids);

  console.log(`[Graph Walker] Ring 3: ${ring3.length} verses`);

  // ========================================
  // Summary
  // ========================================
  const totalVerses = ring0.length + ring1.length + ring2.length + ring3.length;
  console.log(`[Graph Walker] Bundle complete: ${totalVerses} total verses`);
  console.log(`[Graph Walker] Breakdown: R0=${ring0.length}, R1=${ring1.length}, R2=${ring2.length}, R3=${ring3.length}`);

  return {
    anchor,
    ring0,
    ring1,
    ring2,
    ring3,
  };
}

/**
 * Fetch next layer of cross-references with budgeting
 *
 * Strategy:
 * - Get all outgoing cross-refs from source IDs
 * - Group by target verse
 * - Sort by "relevance" (how many sources point to each target)
 * - Take top N (limit)
 * - Exclude already-seen vertices
 */
async function fetchLayer(
  sourceIds: number[],
  limit: number,
  excludeSet: Set<number>
): Promise<number[]> {
  if (sourceIds.length === 0) {
    return [];
  }

  console.log(`[Graph Walker]   Fetching refs from ${sourceIds.length} source vertices...`);

  // Query: Get all cross-refs from source IDs, grouped by target
  const { data, error } = await supabase
    .from("cross_references")
    .select("to_verse_id")
    .in("from_verse_id", sourceIds);

  if (error) {
    console.error("[Graph Walker]   Error fetching layer:", error);
    return [];
  }

  if (!data || data.length === 0) {
    console.log(`[Graph Walker]   No cross-references found`);
    return [];
  }

  // Count frequency of each target (relevance scoring)
  const frequencyMap = new Map<number, number>();
  for (const row of data) {
    const toId = row.to_verse_id;

    // Skip if already seen
    if (excludeSet.has(toId)) {
      continue;
    }

    frequencyMap.set(toId, (frequencyMap.get(toId) || 0) + 1);
  }

  // Sort by frequency (descending) and take top N
  const sortedTargets = Array.from(frequencyMap.entries())
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .slice(0, limit)
    .map(([id, _count]) => id);

  console.log(`[Graph Walker]   Found ${data.length} total refs, returning top ${sortedTargets.length}`);

  return sortedTargets;
}

/**
 * Hydrate verse IDs into full Verse objects
 */
async function hydrateVerses(ids: number[]): Promise<Verse[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("verses")
    .select("*")
    .in("id", ids);

  if (error) {
    console.error("[Graph Walker] Error hydrating verses:", error);
    return [];
  }

  return (data as Verse[]) || [];
}

/**
 * Get verse ID by reference (book, chapter, verse)
 */
export async function getVerseId(
  book: string,
  chapter: number,
  verse: number
): Promise<number | null> {
  console.log(`[Graph Walker] getVerseId: book="${book}", ch=${chapter}, v=${verse}`);

  const { data, error } = await supabase
    .from("verses")
    .select("id")
    .eq("book_abbrev", book.toLowerCase())
    .eq("chapter", chapter)
    .eq("verse", verse)
    .single();

  if (error) {
    console.error(`[Graph Walker] getVerseId ERROR:`, error);
    return null;
  }

  if (!data) {
    console.error(`[Graph Walker] getVerseId: No data returned for ${book} ${chapter}:${verse}`);
    return null;
  }

  console.log(`[Graph Walker] getVerseId: Found ID ${data.id} for ${book} ${chapter}:${verse}`);
  return data.id;
}

/**
 * Format verse reference as string
 */
export function formatVerseRef(verse: Verse): string {
  return `${verse.book_name} ${verse.chapter}:${verse.verse}`;
}

/**
 * Format verse with text
 */
export function formatVerse(verse: Verse): string {
  return `[${formatVerseRef(verse)}] ${verse.text}`;
}
