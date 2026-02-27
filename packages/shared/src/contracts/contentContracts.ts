import { z } from "zod";

type JsonObject = Record<string, unknown>;

const objectSchema = z.record(z.unknown());
const stringSchema = z.string();
const numberSchema = z.number().finite();
const stringArraySchema = z.array(z.string());
const numberArraySchema = z.array(z.number().finite());

function asObject(value: unknown): JsonObject {
  const parsed = objectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function readString(value: unknown): string | undefined {
  const parsed = stringSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function readNumber(value: unknown): number | undefined {
  const parsed = numberSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function readStringArray(value: unknown): string[] {
  const parsed = stringArraySchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function readNumberArray(value: unknown): number[] {
  const parsed = numberArraySchema.safeParse(value);
  return parsed.success
    ? parsed.data.filter((entry) => Number.isFinite(entry))
    : [];
}

export interface Bookmark {
  id: string;
  text: string;
  createdAt?: string;
  userId?: string;
}

export interface Highlight {
  id: string;
  book: string;
  chapter: number;
  verses: number[];
  text: string;
  color: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  referenceLabel: string;
}

export interface LibraryConnectionVerseRef {
  reference: string;
  text?: string;
}

export interface LibraryConnectionBundleMeta {
  anchorRef?: string;
  verseCount?: number;
  edgeCount?: number;
}

export interface LibraryConnection {
  id: string;
  bundleId?: string;
  synopsis: string;
  connectionType: string;
  similarity: number;
  fromVerse: LibraryConnectionVerseRef;
  toVerse: LibraryConnectionVerseRef;
  note?: string;
  tags: string[];
  createdAt?: string;
  bundleMeta?: LibraryConnectionBundleMeta;
}

function normalizeVerseRef(value: unknown): LibraryConnectionVerseRef {
  const obj = asObject(value);
  return {
    reference: readString(obj.reference) ?? "Unknown reference",
    text: readString(obj.text),
  };
}

function normalizeBundleMeta(
  value: unknown,
): LibraryConnectionBundleMeta | undefined {
  const obj = asObject(value);
  const anchorRef = readString(obj.anchorRef);
  const verseCount = readNumber(obj.verseCount);
  const edgeCount = readNumber(obj.edgeCount);

  if (
    anchorRef === undefined &&
    verseCount === undefined &&
    edgeCount === undefined
  ) {
    return undefined;
  }

  return {
    anchorRef,
    verseCount,
    edgeCount,
  };
}

export function buildHighlightReferenceLabel(
  book: string,
  chapter: number,
  verses: number[],
): string {
  const verseLabel =
    verses.length > 0
      ? verses.length === 1
        ? String(verses[0])
        : `${verses[0]}-${verses[verses.length - 1]}`
      : "?";
  return `${book} ${chapter}:${verseLabel}`;
}

export function normalizeBookmark(value: unknown, index: number): Bookmark {
  const obj = asObject(value);
  return {
    id: readString(obj.id) ?? `bookmark-${index}`,
    text: readString(obj.text) ?? "",
    createdAt: readString(obj.createdAt) ?? readString(obj.created_at),
    userId: readString(obj.userId) ?? readString(obj.user_id),
  };
}

export function normalizeHighlight(value: unknown, index: number): Highlight {
  const obj = asObject(value);
  const book = readString(obj.book) ?? "Unknown";
  const chapter = readNumber(obj.chapter) ?? 0;
  const verses = readNumberArray(obj.verses);

  return {
    id: readString(obj.id) ?? `highlight-${index}`,
    book,
    chapter,
    verses,
    text: readString(obj.text) ?? "",
    color: readString(obj.color) ?? "#facc15",
    note: readString(obj.note),
    createdAt: readString(obj.createdAt) ?? readString(obj.created_at),
    updatedAt:
      readString(obj.updatedAt) ??
      readString(obj.updated_at) ??
      readString(obj.createdAt) ??
      readString(obj.created_at),
    referenceLabel: buildHighlightReferenceLabel(book, chapter, verses),
  };
}

export function normalizeLibraryConnection(
  value: unknown,
  index: number,
): LibraryConnection {
  const obj = asObject(value);
  return {
    id: readString(obj.id) ?? `connection-${index}`,
    bundleId: readString(obj.bundleId) ?? readString(obj.bundle_id),
    synopsis: readString(obj.synopsis) ?? "No synopsis available.",
    connectionType: readString(obj.connectionType) ?? "connection",
    similarity: readNumber(obj.similarity) ?? 0,
    fromVerse: normalizeVerseRef(obj.fromVerse ?? obj.from_verse),
    toVerse: normalizeVerseRef(obj.toVerse ?? obj.to_verse),
    note: readString(obj.note),
    tags: readStringArray(obj.tags),
    createdAt: readString(obj.createdAt) ?? readString(obj.created_at),
    bundleMeta: normalizeBundleMeta(obj.bundleMeta),
  };
}

export function parseBookmarksResponse(payload: unknown): Bookmark[] {
  const obj = asObject(payload);
  const bookmarks = Array.isArray(obj.bookmarks) ? obj.bookmarks : [];
  return bookmarks.map((entry, index) => normalizeBookmark(entry, index));
}

export function parseHighlightsResponse(payload: unknown): Highlight[] {
  const obj = asObject(payload);
  const highlights = Array.isArray(obj.highlights) ? obj.highlights : [];
  return highlights.map((entry, index) => normalizeHighlight(entry, index));
}

export function parseLibraryConnectionsResponse(
  payload: unknown,
): LibraryConnection[] {
  const obj = asObject(payload);
  const connections = Array.isArray(obj.connections) ? obj.connections : [];
  return connections.map((entry, index) =>
    normalizeLibraryConnection(entry, index),
  );
}

export function toHighlightSyncRecord(
  item: Highlight,
): Record<string, unknown> {
  return {
    id: item.id,
    book: item.book,
    chapter: item.chapter,
    verses: item.verses,
    text: item.text,
    color: item.color,
    note: item.note ?? undefined,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}
