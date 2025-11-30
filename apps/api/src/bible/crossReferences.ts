import fs from "fs/promises";
import path from "path";
import { VerseRef } from "./types";

/**
 * Comprehensive cross-reference dataset from OpenBible.info (TSK + community votes)
 * ~343,000 cross-references covering 29,335 unique source verses
 *
 * Format: "book chapter:verse" -> [{ book, chapter, verse }, ...]
 * Example: "gn 1:1" -> [{ book: "ps", chapter: 96, verse: 5 }, ...]
 *
 * Data source: https://www.openbible.info/labs/cross-references/
 * Licensed under Creative Commons Attribution License
 */

let crossRefData: Record<string, VerseRef[]> | null = null;

/**
 * Load cross-reference data lazily
 */
async function loadCrossRefData(): Promise<Record<string, VerseRef[]>> {
  if (crossRefData) {
    return crossRefData;
  }

  const dataPath = path.join(
    process.cwd(),
    "src",
    "bible",
    "crossReferencesData.json"
  );

  try {
    const rawData = await fs.readFile(dataPath, "utf-8");
    crossRefData = JSON.parse(rawData);
    console.log(
      `[Cross-References] Loaded ${Object.keys(crossRefData!).length} source verses with cross-references`
    );
    return crossRefData!;
  } catch (error) {
    console.error("[Cross-References] Failed to load data:", error);
    return {};
  }
}

/**
 * Get cross-references for a verse
 */
export async function getCrossReferences(ref: VerseRef): Promise<VerseRef[]> {
  const data = await loadCrossRefData();
  const key = `${ref.book.toLowerCase()} ${ref.chapter}:${ref.verse}`;
  return data[key] || [];
}
