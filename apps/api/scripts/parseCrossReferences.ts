import fs from "fs/promises";
import path from "path";

/**
 * Parse OpenBible.info cross-reference format to our internal format
 * Input: "Gen.1.1" -> Output: { book: "gn", chapter: 1, verse: 1 }
 */
function parseVerseRef(ref: string): {
  book: string;
  chapter: number;
  verse: number;
} | null {
  // Format: "Gen.1.1" or "Ps.23.1" or "1Cor.13.4" etc.
  const match = ref.match(/^(\d?[A-Za-z]+)\.(\d+)\.(\d+)$/);
  if (!match) {
    console.warn(`Failed to parse verse ref: ${ref}`);
    return null;
  }

  const [, bookCode, chapterStr, verseStr] = match;

  // Map OpenBible book codes to our abbreviations
  const bookMap: Record<string, string> = {
    Gen: "gn",
    Exod: "ex",
    Lev: "lv",
    Num: "nu",
    Deut: "dt",
    Josh: "jos",
    Judg: "jdg",
    Ruth: "ru",
    "1Sam": "1sa",
    "2Sam": "2sa",
    "1Kgs": "1ki",
    "2Kgs": "2ki",
    "1Chr": "1ch",
    "2Chr": "2ch",
    Ezra: "ezr",
    Neh: "ne",
    Esth: "est",
    Job: "job",
    Ps: "ps",
    Prov: "pr",
    Eccl: "ec",
    Song: "sng",
    Isa: "is",
    Jer: "jer",
    Lam: "lam",
    Ezek: "eze",
    Dan: "da",
    Hos: "ho",
    Joel: "jol",
    Amos: "am",
    Obad: "ob",
    Jonah: "jnh",
    Mic: "mi",
    Nah: "na",
    Hab: "hab",
    Zeph: "zep",
    Hag: "hag",
    Zech: "zec",
    Mal: "mal",
    Matt: "mt",
    Mark: "mk",
    Luke: "lk",
    John: "jn",
    Acts: "ac",
    Rom: "ro",
    "1Cor": "1co",
    "2Cor": "2co",
    Gal: "ga",
    Eph: "eph",
    Phil: "php",
    Col: "col",
    "1Thess": "1th",
    "2Thess": "2th",
    "1Tim": "1ti",
    "2Tim": "2ti",
    Titus: "tit",
    Phlm: "phm",
    Heb: "heb",
    Jas: "jas",
    "1Pet": "1pe",
    "2Pet": "2pe",
    "1John": "1jn",
    "2John": "2jn",
    "3John": "3jn",
    Jude: "jud",
    Rev: "re",
  };

  const abbrev = bookMap[bookCode];
  if (!abbrev) {
    console.warn(`Unknown book code: ${bookCode}`);
    return null;
  }

  return {
    book: abbrev,
    chapter: parseInt(chapterStr, 10),
    verse: parseInt(verseStr, 10),
  };
}

/**
 * Parse verse range like "Prov.8.22-Prov.8.30"
 */
function parseVerseRange(ref: string): {
  book: string;
  chapter: number;
  verse: number;
}[] {
  // Check if it's a range
  if (ref.includes("-")) {
    const [startRef, endRef] = ref.split("-");
    const start = parseVerseRef(startRef);
    const end = parseVerseRef(endRef);

    if (!start || !end) return [];

    // Only handle same-chapter ranges for now
    if (start.book !== end.book || start.chapter !== end.chapter) {
      // Just return both endpoints
      return [start, end];
    }

    // Expand range
    const verses = [];
    for (let v = start.verse; v <= end.verse; v++) {
      verses.push({
        book: start.book,
        chapter: start.chapter,
        verse: v,
      });
    }
    return verses;
  }

  // Single verse
  const parsed = parseVerseRef(ref);
  return parsed ? [parsed] : [];
}

async function main() {
  const inputPath = path.join(
    process.cwd(),
    "data",
    "cross_references.txt"
  );
  const outputPath = path.join(
    process.cwd(),
    "src",
    "bible",
    "crossReferencesData.json"
  );

  console.log("Reading cross-reference file...");
  const content = await fs.readFile(inputPath, "utf-8");
  const lines = content.split("\n");

  // Skip header
  const dataLines = lines.slice(1);

  console.log(`Processing ${dataLines.length} cross-references...`);

  // Build map: "gn 1:1" -> [{ book, chapter, verse }, ...]
  const xrefMap: Record<
    string,
    { book: string; chapter: number; verse: number }[]
  > = {};

  let parsed = 0;
  let skipped = 0;

  for (const line of dataLines) {
    if (!line.trim()) continue;

    const parts = line.split("\t");
    if (parts.length < 3) continue;

    const [fromRef, toRef, votesStr] = parts;
    const votes = parseInt(votesStr, 10);

    // Skip negative-voted references (likely bad cross-refs)
    if (votes < 0) {
      skipped++;
      continue;
    }

    // Parse source verse
    const fromVerses = parseVerseRange(fromRef);
    if (fromVerses.length === 0) continue;

    // Parse target verse(s)
    const toVerses = parseVerseRange(toRef);
    if (toVerses.length === 0) continue;

    // Add to map
    for (const from of fromVerses) {
      const key = `${from.book} ${from.chapter}:${from.verse}`;

      if (!xrefMap[key]) {
        xrefMap[key] = [];
      }

      for (const to of toVerses) {
        // Avoid self-references
        if (
          from.book === to.book &&
          from.chapter === to.chapter &&
          from.verse === to.verse
        ) {
          continue;
        }

        // Check for duplicates
        const exists = xrefMap[key].some(
          (x) =>
            x.book === to.book &&
            x.chapter === to.chapter &&
            x.verse === to.verse
        );

        if (!exists) {
          xrefMap[key].push(to);
        }
      }
    }

    parsed++;
    if (parsed % 10000 === 0) {
      console.log(`Processed ${parsed} references...`);
    }
  }

  console.log(`\nParsing complete:`);
  console.log(`  - Parsed: ${parsed}`);
  console.log(`  - Skipped (negative votes): ${skipped}`);
  console.log(`  - Unique source verses: ${Object.keys(xrefMap).length}`);

  // Write JSON output
  console.log(`\nWriting to ${outputPath}...`);
  await fs.writeFile(outputPath, JSON.stringify(xrefMap, null, 2));

  console.log("Done!");
}

main().catch(console.error);
