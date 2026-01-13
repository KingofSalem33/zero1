/**
 * Purge pericopes and related data for a given source.
 *
 * Usage:
 *   npx tsx apps/api/scripts/purgePericopesBySource.ts --source=SIL_AI
 */

import "dotenv/config";

import { supabase } from "../src/db";

const getArgValue = (flag: string): string | null => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const source =
  getArgValue("--source") ||
  process.argv.find((arg) => arg.startsWith("--source="))?.split("=")[1];

if (!source) {
  console.error("Missing --source parameter");
  process.exit(1);
}

const fetchPericopeIds = async (): Promise<number[]> => {
  const { count, error: countError } = await supabase
    .from("pericopes")
    .select("id", { count: "exact", head: true })
    .eq("source", source);

  if (countError || !count) return [];

  const ids: number[] = [];
  const batchSize = 1000;
  for (let offset = 0; offset < count; offset += batchSize) {
    const { data, error } = await supabase
      .from("pericopes")
      .select("id")
      .eq("source", source)
      .order("id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error || !data) break;
    ids.push(...data.map((row) => row.id as number));
  }

  return ids;
};

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

async function purgePericopes() {
  const ids = await fetchPericopeIds();
  if (ids.length === 0) {
    console.log(`No pericopes found for source ${source}`);
    return;
  }

  for (const chunk of chunkArray(ids, 500)) {
    await supabase
      .from("pericope_connections")
      .delete()
      .or(
        `source_pericope_id.in.(${chunk.join(",")}),target_pericope_id.in.(${chunk.join(",")})`,
      );

    await supabase
      .from("pericope_embeddings")
      .delete()
      .in("pericope_id", chunk);
  }

  const { error: mapError } = await supabase
    .from("verse_pericope_map")
    .delete()
    .eq("source", source);
  if (mapError) {
    console.error(`Failed to delete verse mapping: ${mapError.message}`);
  }

  for (const chunk of chunkArray(ids, 500)) {
    await supabase.from("pericopes").delete().in("id", chunk);
  }

  console.log(`Purged ${ids.length} pericopes for source ${source}`);
}

purgePericopes().catch((error) => {
  console.error(error);
  process.exit(1);
});
