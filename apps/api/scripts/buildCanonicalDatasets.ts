/**
 * Build canonical JSON datasets for citations, prophecies, genealogies.
 *
 * - Citations/prophecies are inferred from OpenBible cross-references (votes).
 * - Genealogies are inferred from KJV text patterns ("begat", "son of").
 */

import { config } from "dotenv";
config();

import fs from "fs";
import path from "path";
import https from "https";
import { BOOK_NAMES } from "../src/bible/bookNames";

type Reference = {
  book: string;
  chapter: number;
  verse: number;
  endVerse?: number;
};

type CitationEntry = {
  ot: Reference;
  nt: Reference;
  quote_type?: string;
  votes?: number;
};

type ProphecyEntry = {
  prophecy: Reference;
  fulfillment: Reference;
  prophecy_type?: string;
  votes?: number;
};

type GenealogyEntry = {
  ancestor: Reference;
  descendant: Reference;
  relationship: string;
};

const OUT_DIR = path.join(process.cwd(), "data", "canonical");
const CROSSREF_URL =
  "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/sources/extras/cross_references.txt";

const CITATION_TARGET = 2000;
const PROPHECY_TARGET = 1200;
const MIN_VOTES = 30;

const getNumberFlag = (name: string): number | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  const value = Number.parseInt(arg.slice(prefix.length), 10);
  return Number.isFinite(value) ? value : undefined;
};

const citationsTarget = getNumberFlag("citations-limit") ?? CITATION_TARGET;
const propheciesTarget = getNumberFlag("prophecies-limit") ?? PROPHECY_TARGET;
const minVotes = getNumberFlag("min-votes") ?? MIN_VOTES;
const crossRefPath = process.argv.find((value) =>
  value.startsWith("--crossrefs="),
);

const OPENBIBLE_BOOKS: Record<string, string> = {
  Gen: "Genesis",
  Exod: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deut: "Deuteronomy",
  Josh: "Joshua",
  Judg: "Judges",
  Ruth: "Ruth",
  "1Sam": "1 Samuel",
  "2Sam": "2 Samuel",
  "1Kgs": "1 Kings",
  "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles",
  "2Chr": "2 Chronicles",
  Ezra: "Ezra",
  Neh: "Nehemiah",
  Esth: "Esther",
  Job: "Job",
  Ps: "Psalms",
  Prov: "Proverbs",
  Eccl: "Ecclesiastes",
  Song: "Song of Solomon",
  Isa: "Isaiah",
  Jer: "Jeremiah",
  Lam: "Lamentations",
  Ezek: "Ezekiel",
  Dan: "Daniel",
  Hos: "Hosea",
  Joel: "Joel",
  Amos: "Amos",
  Obad: "Obadiah",
  Jonah: "Jonah",
  Mic: "Micah",
  Nah: "Nahum",
  Hab: "Habakkuk",
  Zeph: "Zephaniah",
  Hag: "Haggai",
  Zech: "Zechariah",
  Mal: "Malachi",
  Matt: "Matthew",
  Mark: "Mark",
  Luke: "Luke",
  John: "John",
  Acts: "Acts",
  Rom: "Romans",
  "1Cor": "1 Corinthians",
  "2Cor": "2 Corinthians",
  Gal: "Galatians",
  Eph: "Ephesians",
  Phil: "Philippians",
  Col: "Colossians",
  "1Thess": "1 Thessalonians",
  "2Thess": "2 Thessalonians",
  "1Tim": "1 Timothy",
  "2Tim": "2 Timothy",
  Titus: "Titus",
  Philem: "Philemon",
  Heb: "Hebrews",
  Jas: "James",
  "1Pet": "1 Peter",
  "2Pet": "2 Peter",
  "1John": "1 John",
  "2John": "2 John",
  "3John": "3 John",
  Jude: "Jude",
  Rev: "Revelation",
};

const OT_BOOKS = new Set([
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
]);

const NT_BOOKS = new Set(
  Object.values(BOOK_NAMES).filter((name) => !OT_BOOKS.has(name)),
);

const PROPHETIC_BOOKS = new Set([
  "Isaiah",
  "Jeremiah",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Psalms",
]);

const fetchText = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      })
      .on("error", reject);
  });

const parseOpenBibleRef = (raw: string): Reference | null => {
  const parts = raw.split("-");
  const start = parseSingleRef(parts[0]);
  if (!start) return null;
  if (parts.length === 1) return start;
  const end = parseSingleRef(parts[1]);
  if (
    end &&
    end.book === start.book &&
    end.chapter === start.chapter &&
    end.verse >= start.verse
  ) {
    return { ...start, endVerse: end.verse };
  }
  return start;
};

const parseSingleRef = (raw: string): Reference | null => {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  const bookKey = match[1];
  const book = OPENBIBLE_BOOKS[bookKey];
  if (!book) return null;
  const chapter = Number.parseInt(match[2], 10);
  const verse = Number.parseInt(match[3], 10);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
  return { book, chapter, verse };
};

const refKey = (ref: Reference): string =>
  `${ref.book}|${ref.chapter}|${ref.verse}|${ref.endVerse ?? ""}`;

const getTestament = (book: string): "OT" | "NT" | "OTHER" => {
  if (OT_BOOKS.has(book)) return "OT";
  if (NT_BOOKS.has(book)) return "NT";
  return "OTHER";
};

const ensureOutDir = () => {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
};

const writeJson = (name: string, data: unknown) => {
  ensureOutDir();
  const outPath = path.join(OUT_DIR, name);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`[Canonical] Wrote ${outPath}`);
};

const loadCrossRefs = async (): Promise<
  Array<{ from: Reference; to: Reference; votes: number }>
> => {
  const fileArg = crossRefPath?.split("=")[1];
  const raw = fileArg
    ? fs.readFileSync(fileArg, "utf-8")
    : await fetchText(CROSSREF_URL);

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const rows: Array<{ from: Reference; to: Reference; votes: number }> = [];

  for (const line of lines) {
    if (line.startsWith("From Verse")) continue;
    const [fromRaw, toRaw, votesRaw] = line.split("\t");
    if (!fromRaw || !toRaw || !votesRaw) continue;
    const votes = Number.parseInt(votesRaw, 10);
    if (!Number.isFinite(votes)) continue;
    if (votes < minVotes) continue;

    const from = parseOpenBibleRef(fromRaw);
    const to = parseOpenBibleRef(toRaw);
    if (!from || !to) continue;
    rows.push({ from, to, votes });
  }

  console.log(`[Canonical] Parsed ${rows.length} cross-ref rows`);
  return rows;
};

const buildCitationsAndProphecies = async () => {
  const crossRefs = await loadCrossRefs();

  const citationPairs: CitationEntry[] = [];
  const prophecyPairs: ProphecyEntry[] = [];
  const citationSeen = new Set<string>();
  const prophecySeen = new Set<string>();

  for (const row of crossRefs) {
    const fromTestament = getTestament(row.from.book);
    const toTestament = getTestament(row.to.book);
    if (
      (fromTestament === "OT" && toTestament === "NT") ||
      (fromTestament === "NT" && toTestament === "OT")
    ) {
      const ot = fromTestament === "OT" ? row.from : row.to;
      const nt = fromTestament === "NT" ? row.from : row.to;
      const key = `${refKey(ot)}=>${refKey(nt)}`;
      if (!citationSeen.has(key)) {
        citationSeen.add(key);
        citationPairs.push({
          ot,
          nt,
          quote_type: "inferred",
          votes: row.votes,
        });
      }

      if (PROPHETIC_BOOKS.has(ot.book)) {
        const prophecyKey = `${refKey(ot)}=>${refKey(nt)}`;
        if (!prophecySeen.has(prophecyKey)) {
          prophecySeen.add(prophecyKey);
          const prophecyType =
            ot.book === "Isaiah" || ot.book === "Psalms"
              ? "messianic"
              : "prophetic";
          prophecyPairs.push({
            prophecy: ot,
            fulfillment: nt,
            prophecy_type: prophecyType,
            votes: row.votes,
          });
        }
      }
    }
  }

  citationPairs.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  prophecyPairs.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));

  const citations = citationPairs.slice(0, citationsTarget).map((entry) => ({
    ot: entry.ot,
    nt: entry.nt,
    quote_type: entry.quote_type,
  }));
  const prophecies = prophecyPairs.slice(0, propheciesTarget).map((entry) => ({
    prophecy: entry.prophecy,
    fulfillment: entry.fulfillment,
    prophecy_type: entry.prophecy_type,
  }));

  writeJson("citations.json", citations);
  writeJson("prophecies.json", prophecies);

  console.log(
    `[Canonical] Citations: ${citations.length}, Prophecies: ${prophecies.length}`,
  );
};

type KjvBook = {
  abbrev: string;
  chapters: string[][];
  name: string;
};

const loadKjv = (): KjvBook[] => {
  const filePath = path.join(process.cwd(), "data", "kjv.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as KjvBook[];
};

const buildGenealogies = () => {
  const kjv = loadKjv();
  const namePairs: Array<{
    parent: string;
    child: string;
    ref: Reference;
  }> = [];

  const nameSet = new Set<string>();
  const begatRegex = /([A-Z][a-zA-Z-]+)\s+begat\s+([A-Z][a-zA-Z-]+)/g;
  const sonOfRegex = /son of ([A-Z][a-zA-Z-]+)/gi;

  kjv.forEach((book) => {
    const bookName = BOOK_NAMES[book.abbrev];
    if (!bookName) return;
    book.chapters.forEach((verses, chapterIndex) => {
      const chapter = chapterIndex + 1;
      verses.forEach((text, verseIndex) => {
        const verse = verseIndex + 1;
        if (!text) return;

        const begatMatches = text.matchAll(begatRegex);
        for (const match of begatMatches) {
          const parent = match[1];
          const child = match[2];
          if (!parent || !child) continue;
          namePairs.push({
            parent,
            child,
            ref: { book: bookName, chapter, verse },
          });
          nameSet.add(parent.toLowerCase());
          nameSet.add(child.toLowerCase());
        }

        const sonMatches = Array.from(text.matchAll(sonOfRegex)).map(
          (match) => match[1],
        );
        if (sonMatches.length >= 2) {
          const cleaned = sonMatches.map((name) => name.trim()).filter(Boolean);
          if (cleaned.length >= 2) {
            if (text.includes("Jesus") && cleaned[0]) {
              namePairs.push({
                parent: "Jesus",
                child: cleaned[0],
                ref: { book: bookName, chapter, verse },
              });
              nameSet.add("jesus");
              nameSet.add(cleaned[0].toLowerCase());
            }
            for (let i = 0; i < cleaned.length - 1; i += 1) {
              namePairs.push({
                parent: cleaned[i],
                child: cleaned[i + 1],
                ref: { book: bookName, chapter, verse },
              });
              nameSet.add(cleaned[i].toLowerCase());
              nameSet.add(cleaned[i + 1].toLowerCase());
            }
          }
        }
      });
    });
  });

  const nameFirstRef = new Map<string, Reference>();
  kjv.forEach((book) => {
    const bookName = BOOK_NAMES[book.abbrev];
    if (!bookName) return;
    book.chapters.forEach((verses, chapterIndex) => {
      const chapter = chapterIndex + 1;
      verses.forEach((text, verseIndex) => {
        const verse = verseIndex + 1;
        if (!text) return;
        const tokens = text.match(/[A-Za-z-]+/g) || [];
        tokens.forEach((token) => {
          const key = token.toLowerCase();
          if (!nameSet.has(key)) return;
          if (!nameFirstRef.has(key)) {
            nameFirstRef.set(key, { book: bookName, chapter, verse });
          }
        });
      });
    });
  });

  const edges: GenealogyEntry[] = [];
  const seen = new Set<string>();

  for (const pair of namePairs) {
    const parentRef = nameFirstRef.get(pair.parent.toLowerCase()) ?? pair.ref;
    const childRef = nameFirstRef.get(pair.child.toLowerCase()) ?? pair.ref;
    const key = `${refKey(parentRef)}=>${refKey(childRef)}`;
    if (
      parentRef.book === childRef.book &&
      parentRef.chapter === childRef.chapter &&
      parentRef.verse === childRef.verse
    ) {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      ancestor: parentRef,
      descendant: childRef,
      relationship: "father",
    });
  }

  writeJson("genealogies.json", edges);
  console.log(`[Canonical] Genealogies: ${edges.length}`);
};

async function main() {
  console.log("=".repeat(60));
  console.log("Build Canonical Datasets");
  console.log("=".repeat(60));
  console.log(`Min votes: ${minVotes}`);
  console.log(`Citations target: ${citationsTarget}`);
  console.log(`Prophecies target: ${propheciesTarget}`);
  console.log();

  await buildCitationsAndProphecies();
  buildGenealogies();
}

main().catch((error) => {
  console.error("Dataset build failed:", error);
  process.exit(1);
});
