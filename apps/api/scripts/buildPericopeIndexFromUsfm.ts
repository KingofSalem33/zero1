/**
 * Build a pericope index from USFM section headings.
 *
 * Usage:
 *   npx tsx apps/api/scripts/buildPericopeIndexFromUsfm.ts --usfm-dir .tmp/en_ult --output apps/api/data/pericopes/ult_pericopes.json
 */

import fs from "fs";
import path from "path";

type VerseRef = {
  book: string;
  chapter: number;
  verse: number;
};

type PericopeEntry = {
  title: string;
  subtitle?: string;
  reference: {
    start: VerseRef;
    end: VerseRef;
  };
  type?: string;
  themes?: string[];
  keyFigures?: string[];
};

type PendingHeading = {
  title: string | null;
  subtitle?: string;
};

const parseNumber = (value: string): number | null => {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
};

const extractMarkerText = (line: string, marker: string): string => {
  return line.replace(new RegExp(`^\\\\${marker}\\s*`), "").trim();
};

const parseVerseNumber = (line: string): number | null => {
  const match = line.match(/^\\v\s+(\d+)/);
  if (!match) return null;
  return parseNumber(match[1]);
};

const parseChapterNumber = (line: string): number | null => {
  const match = line.match(/^\\c\s+(\d+)/);
  if (!match) return null;
  return parseNumber(match[1]);
};

const getUsfmFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir);
  const usfmFiles = entries.filter((file) =>
    file.toLowerCase().endsWith(".usfm"),
  );
  return usfmFiles.sort((a, b) => {
    const aNum = parseNumber(a.split("-")[0] || "");
    const bNum = parseNumber(b.split("-")[0] || "");
    if (aNum !== null && bNum !== null) return aNum - bNum;
    return a.localeCompare(b);
  });
};

const parseUsfmFile = (filePath: string): PericopeEntry[] => {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  let bookName = "";
  let currentChapter = 0;
  let currentPericope: PericopeEntry | null = null;
  let pendingHeading: PendingHeading | null = null;

  const pericopes: PericopeEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("\\h ")) {
      bookName = extractMarkerText(trimmed, "h");
      continue;
    }

    if (!bookName && trimmed.startsWith("\\toc2 ")) {
      bookName = extractMarkerText(trimmed, "toc2");
      continue;
    }

    const chapter = parseChapterNumber(trimmed);
    if (chapter !== null) {
      currentChapter = chapter;
      continue;
    }

    if (trimmed.startsWith("\\s1")) {
      const heading = extractMarkerText(trimmed, "s1");
      pendingHeading = {
        title: heading.length > 0 ? heading : null,
      };
      continue;
    }

    if (pendingHeading && trimmed.startsWith("\\sr")) {
      const ref = extractMarkerText(trimmed, "sr");
      if (ref.length > 0) {
        pendingHeading.subtitle = ref;
      }
      continue;
    }

    const verseNumber = parseVerseNumber(trimmed);
    if (verseNumber !== null) {
      if (!currentChapter) continue;

      if (pendingHeading || !currentPericope) {
        const title = pendingHeading?.title || "Untitled Section";
        const subtitle = pendingHeading?.subtitle;
        const startRef: VerseRef = {
          book: bookName,
          chapter: currentChapter,
          verse: verseNumber,
        };

        currentPericope = {
          title,
          subtitle,
          reference: {
            start: startRef,
            end: startRef,
          },
        };
        pericopes.push(currentPericope);
        pendingHeading = null;
      }

      if (currentPericope) {
        currentPericope.reference.end = {
          book: bookName,
          chapter: currentChapter,
          verse: verseNumber,
        };
      }
    }
  }

  return pericopes;
};

const getArgValue = (flag: string): string | null => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const usfmDir = getArgValue("--usfm-dir") || ".tmp/en_ult";
const outputFile =
  getArgValue("--output") || "apps/api/data/pericopes/ult_pericopes.json";

if (!fs.existsSync(usfmDir)) {
  console.error(`USFM directory not found: ${usfmDir}`);
  process.exit(1);
}

const files = getUsfmFiles(usfmDir);
const pericopes: PericopeEntry[] = [];

for (const file of files) {
  const filePath = path.join(usfmDir, file);
  pericopes.push(...parseUsfmFile(filePath));
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(pericopes, null, 2));

console.log(`Wrote ${pericopes.length} pericopes to ${outputFile}`);
