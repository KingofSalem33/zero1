/**
 * Build literary_structures.json by scraping chiasm pages from Chiasmus Exchange.
 *
 * Source: https://www.chiasmusxchange.com (WordPress API)
 *
 * Usage:
 *   npx ts-node scripts/buildLiteraryStructures.ts
 *   npx ts-node scripts/buildLiteraryStructures.ts --limit=200
 *   npx ts-node scripts/buildLiteraryStructures.ts --output=path/to/file.json
 *   npx ts-node scripts/buildLiteraryStructures.ts --reset
 */

import { config } from "dotenv";
config();

import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import { fetch, Headers } from "undici";
import { parseExplicitReference } from "../src/bible/referenceParser";
import { BOOK_NAMES } from "../src/bible/bookNames";

const WP_API_BASE = "https://www.chiasmusxchange.com/wp-json/wp/v2/posts";
const WP_PER_PAGE = 100;
const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  "data",
  "structures",
  "literary_structures.json",
);

const getNumberFlag = (name: string): number | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  const value = Number.parseInt(arg.slice(prefix.length), 10);
  return Number.isFinite(value) ? value : undefined;
};

const getStringFlag = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  return arg.slice(prefix.length);
};

const limit = getNumberFlag("limit");
const outputPath = getStringFlag("output") ?? DEFAULT_OUTPUT;
const shouldReset = process.argv.includes("--reset");

const fetchText = async (
  url: string,
): Promise<{ text: string; status: number; headers: Headers }> => {
  const res = await fetch(url, {
    headers: { "User-Agent": "zero1-codex" },
  });
  const text = await res.text();
  return { text, status: res.status, headers: res.headers };
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (
  url: string,
  label: string,
  maxRetries: number,
): Promise<{ text: string; status: number; headers: Headers }> => {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const result = await fetchText(url);
    if (result.status !== 429) return result;
    const backoff = 1000 * Math.pow(2, attempt);
    console.log(`[Structures] ${label} hit 429, retrying in ${backoff}ms`);
    await delay(backoff);
    attempt += 1;
  }
  return { text: "", status: 429, headers: new Headers() };
};

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const normalizeApostrophes = (value: string): string =>
  value.replace(/[\u2018\u2019]/g, "'");

const normalizeLabel = (value: string): string =>
  normalizeApostrophes(value).replace(/[^A-Z']/g, "");

const normalizeBookPrefix = (value: string): string =>
  value
    .replace(/^III\s+/i, "3 ")
    .replace(/^II\s+/i, "2 ")
    .replace(/^I\s+/i, "1 ");

const normalizeHtmlText = (value: string): string =>
  normalizeApostrophes(normalizeWhitespace(cheerio.load(value).text()));

const extractMappingFromHtml = (
  html: string,
  baseBook: string,
  baseChapter: number,
): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const $ = cheerio.load(html);

  const addMapping = (label: string, rangeText: string) => {
    if (!label || !rangeText || mapping[label]) return;
    const ref = parseRange(rangeText, baseBook, baseChapter);
    if (!ref) return;
    mapping[label] = ref;
  };

  $("sup").each((_, element) => {
    const raw = $(element).text();
    const cleaned = normalizeApostrophes(
      normalizeWhitespace(raw.replace(/\u00a0/g, " ")),
    );
    if (!cleaned) return;
    const labelMatch = cleaned.match(/^([A-Z])\s*'?/);
    if (!labelMatch) return;
    const label = normalizeLabel(labelMatch[0]);
    const rangeText = cleaned.slice(labelMatch[0].length).trim();
    addMapping(label, rangeText);
  });

  const lineSet = new Set<string>();
  $("p, li, pre, blockquote").each((_, element) => {
    const text = normalizeApostrophes($(element).text());
    if (text) lineSet.add(text);
  });

  normalizeApostrophes(cheerio.load(html).text())
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => lineSet.add(line));

  Array.from(lineSet).forEach((line) => {
    if (Object.keys(mapping).length >= 12) return;
    const cleaned = normalizeWhitespace(line.replace(/\u00a0/g, " "));
    const labelMatch = cleaned.match(/^([A-Z])\s*'?\.?/);
    if (!labelMatch) return;
    const label = normalizeLabel(labelMatch[0]);
    if (!label) return;

    const parenMatch = cleaned.match(/\(([^)]+)\)/);
    if (parenMatch) {
      addMapping(label, parenMatch[1]);
      return;
    }

    const remainder = cleaned.slice(labelMatch[0].length).trim();
    const numberMatch = remainder.match(/^(\d+[:\d-]*)/);
    if (numberMatch) {
      addMapping(label, numberMatch[1]);
    }
  });

  return mapping;
};

const parseReferenceFromTitle = (title: string) => {
  if (!title) return null;
  const normalized = normalizeBookPrefix(normalizeHtmlText(title));
  if (!normalized) return null;
  return parseExplicitReference(normalized);
};

const buildReferenceString = (
  abbrev: string,
  chapter: number,
  verse: number,
  endVerse?: number,
): string => {
  const bookName = BOOK_NAMES[abbrev] ?? abbrev;
  const suffix = endVerse && endVerse !== verse ? `-${endVerse}` : "";
  return `${bookName} ${chapter}:${verse}${suffix}`;
};

const parseRange = (
  rawRange: string,
  baseBook: string,
  baseChapter: number,
): string | null => {
  const normalizedRange = rawRange.replace(/[\u2013\u2014]/g, "-");
  const cleaned = normalizedRange.replace(/[^\d:-]/g, "");
  if (!cleaned) return null;

  const maxChapterForBook = (book: string) => {
    const fullName = BOOK_NAMES[book] ?? book;
    return fullName === "Psalms" ? 150 : 66;
  };
  const maxVerse = 200;

  if (cleaned.includes(":")) {
    const ref = parseExplicitReference(
      `${BOOK_NAMES[baseBook] ?? baseBook} ${cleaned}`,
    );
    if (!ref) return null;
    const maxChapter = maxChapterForBook(ref.book);
    const maxEnd = ref.endVerse ?? ref.verse;
    if (ref.chapter > maxChapter || ref.verse > maxVerse || maxEnd > maxVerse) {
      return null;
    }
    return buildReferenceString(ref.book, ref.chapter, ref.verse, ref.endVerse);
  }

  const numbers = cleaned.match(/\d+/g);
  if (!numbers || numbers.length === 0) return null;
  const start = Number.parseInt(numbers[0], 10);
  const end =
    numbers.length > 1
      ? Number.parseInt(numbers[numbers.length - 1], 10)
      : start;
  if (!Number.isFinite(start)) return null;
  const maxChapter = maxChapterForBook(baseBook);
  if (baseChapter > maxChapter || start > maxVerse || end > maxVerse) {
    return null;
  }
  return buildReferenceString(baseBook, baseChapter, start, end);
};

const pickCenter = (mapping: Record<string, string>): string | undefined => {
  if (mapping.X) return mapping.X;
  if (mapping.C) return mapping.C;
  return undefined;
};

const toChiasmEntry = (
  url: string,
  title: string,
  mapping: Record<string, string>,
  center?: string,
) => ({
  name: title,
  type: "chiasm",
  ...(center ? { center } : {}),
  mapping,
  confidence: 0.9,
  source: url,
});

type WpPost = {
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
};

async function main() {
  console.log("=".repeat(60));
  console.log("Build Literary Structures (Chiasmus Exchange)");
  console.log("=".repeat(60));
  console.log(`Output: ${outputPath}`);
  if (limit !== undefined) console.log(`Limit: ${limit}`);
  if (shouldReset) console.log("Reset enabled: ignoring existing file");
  console.log();

  const entries: Array<Record<string, unknown>> = [];
  let skipped = 0;
  const REQUEST_DELAY = 250;

  const existingSources = new Set<string>();
  if (!shouldReset && fs.existsSync(outputPath)) {
    try {
      const existingRaw = fs.readFileSync(outputPath, "utf8");
      const existingEntries = JSON.parse(existingRaw);
      if (Array.isArray(existingEntries)) {
        existingEntries.forEach((entry) => {
          if (entry && typeof entry.source === "string") {
            existingSources.add(entry.source);
            entries.push(entry);
          }
        });
      }
    } catch (error) {
      console.log(
        `[Structures] Failed to read existing file (${(error as Error).message}). Starting fresh.`,
      );
    }
  }

  const firstUrl = `${WP_API_BASE}?per_page=${WP_PER_PAGE}&page=1`;
  const firstResult = await fetchWithRetry(firstUrl, "wp-page-1", 3);
  if (firstResult.status !== 200) {
    throw new Error(
      `Failed to fetch WordPress API (status ${firstResult.status})`,
    );
  }

  const totalPages = Number.parseInt(
    firstResult.headers.get("x-wp-totalpages") ?? "1",
    10,
  );
  const totalPosts = Number.parseInt(
    firstResult.headers.get("x-wp-total") ?? "0",
    10,
  );
  const maxPosts = limit ?? totalPosts;
  const maxPages = Math.min(
    totalPages,
    Math.max(1, Math.ceil(maxPosts / WP_PER_PAGE)),
  );

  console.log(`Found ${totalPosts} candidate posts`);
  console.log(`Processing up to ${maxPosts} posts...`);

  let processedPosts = 0;

  const processPosts = (posts: WpPost[]) => {
    for (const post of posts) {
      if (processedPosts >= maxPosts) return;
      processedPosts += 1;

      const source = post.link ?? "";
      if (!source || existingSources.has(source)) {
        skipped += 1;
        continue;
      }

      const title = normalizeHtmlText(post.title?.rendered ?? "");
      const ref = parseReferenceFromTitle(title);
      if (!ref) {
        skipped += 1;
        continue;
      }

      const content = post.content?.rendered ?? "";
      const mapping = extractMappingFromHtml(content, ref.book, ref.chapter);
      if (Object.keys(mapping).length < 4) {
        skipped += 1;
        continue;
      }

      const center = pickCenter(mapping);
      entries.push(toChiasmEntry(source, title, mapping, center));
      existingSources.add(source);
    }
  };

  try {
    const firstPosts = JSON.parse(firstResult.text) as WpPost[];
    if (Array.isArray(firstPosts)) {
      processPosts(firstPosts);
    }
  } catch (error) {
    throw new Error(
      `Failed to parse WordPress API response: ${(error as Error).message}`,
    );
  }

  for (let page = 2; page <= maxPages && processedPosts < maxPosts; page += 1) {
    const pageUrl = `${WP_API_BASE}?per_page=${WP_PER_PAGE}&page=${page}`;
    const pageResult = await fetchWithRetry(pageUrl, `wp-page-${page}`, 3);
    if (pageResult.status !== 200) {
      console.log(
        `[Structures] Skipping page ${page} (status ${pageResult.status})`,
      );
      continue;
    }

    try {
      const posts = JSON.parse(pageResult.text) as WpPost[];
      if (Array.isArray(posts)) {
        processPosts(posts);
      }
    } catch (error) {
      console.log(
        `[Structures] Failed to parse page ${page}: ${(error as Error).message}`,
      );
    }

    if (page % 5 === 0) {
      console.log(
        `[Structures] Processed ${Math.min(
          processedPosts,
          maxPosts,
        )}/${maxPosts}`,
      );
    }

    if (REQUEST_DELAY > 0) {
      await delay(REQUEST_DELAY);
    }
  }

  entries.sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? "")),
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));

  console.log();
  console.log(
    `[Structures] Wrote ${entries.length} entries (${skipped} skipped)`,
  );
}

main().catch((error) => {
  console.error("Build literary structures failed:", error);
  process.exit(1);
});
