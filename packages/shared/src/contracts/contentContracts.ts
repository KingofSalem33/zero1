import { z } from "zod";

type JsonObject = Record<string, unknown>;

const objectSchema = z.record(z.unknown());
const stringSchema = z.string();
const numberSchema = z.number().finite();
const stringArraySchema = z.array(z.string());

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
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const parsed = numberSchema.safeParse(entry);
      return parsed.success ? parsed.data : undefined;
    })
    .filter((entry): entry is number => entry !== undefined);
}

export interface Bookmark {
  id: string;
  text: string;
  createdAt?: string;
  userId?: string;
}

export interface BookmarkCreatePayload {
  text: string;
}

export interface BookmarkReference {
  book: string;
  chapter: number;
  verse?: number;
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

export interface HighlightUpdatePayload {
  color?: string;
  note?: string | null;
  text?: string;
  verses?: number[];
}

export interface HighlightSyncPayload {
  highlights: Array<Record<string, unknown>>;
  last_synced_at: string | null;
}

export interface LibraryConnectionVerseRef {
  id?: number;
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
  userId?: string;
  bundleId?: string;
  synopsis: string;
  connectionType: string;
  similarity: number;
  fromVerse: LibraryConnectionVerseRef;
  toVerse: LibraryConnectionVerseRef;
  explanation?: string;
  connectedVerseIds?: number[];
  connectedVerses?: LibraryConnectionVerseRef[];
  goDeeperPrompt?: string;
  mapSession?: unknown;
  note?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  bundle?: unknown;
  bundleMeta?: LibraryConnectionBundleMeta;
}

export interface LibraryMap {
  id: string;
  userId?: string;
  bundleId?: string;
  title?: string;
  note?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  bundleMeta?: LibraryConnectionBundleMeta;
  bundle?: unknown;
}

export interface LibraryBundleCreateResult {
  bundleId: string;
  existing: boolean;
}

export interface LibraryBundleCreatePayload {
  bundle: unknown;
}

export interface LibraryMapCreatePayload {
  bundleId: string;
  title?: string;
}

export interface LibraryMapUpdatePayload {
  title?: string;
  note?: string;
  tags?: string[];
}

export interface LibraryConnectionCreatePayload {
  bundleId: string;
  fromVerse: LibraryConnectionVerseRef;
  toVerse: LibraryConnectionVerseRef;
  connectionType: string;
  similarity: number;
  synopsis: string;
  explanation?: string;
  connectedVerseIds?: number[];
  connectedVerses?: LibraryConnectionVerseRef[];
  goDeeperPrompt: string;
  mapSession?: unknown;
}

export interface LibraryConnectionUpdatePayload {
  note?: string;
  tags?: string[];
}

export interface LibraryMapSessionConnection {
  fromId: number;
  toId: number;
  connectionType: string;
}

export interface LibraryMapSessionPayload {
  cluster?: {
    baseId: number;
    verseIds: number[];
    connectionType: string;
  };
  currentConnection?: LibraryMapSessionConnection;
  previousConnection?: LibraryMapSessionConnection;
  nextConnection?: LibraryMapSessionConnection | null;
  visitedEdgeKeys?: string[];
  offMapReferences?: string[];
  exhausted?: boolean;
}

export interface LibraryConnectionMutationResult {
  connection: LibraryConnection;
  existing: boolean;
}

export interface LibraryMapMutationResult {
  map: LibraryMap;
  existing: boolean;
}

function normalizeVerseRef(value: unknown): LibraryConnectionVerseRef {
  const obj = asObject(value);
  return {
    id: readNumber(obj.id),
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

function normalizeStringArray(value: unknown): string[] {
  return Array.from(
    new Set(
      readStringArray(value)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

function normalizeVerseIds(value: unknown): number[] | undefined {
  const normalized = readNumberArray(value)
    .map((entry) => Math.trunc(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function normalizeConnectionType(value: unknown): string {
  return readString(value)?.trim() || "connection";
}

function toPositiveInt(value: number, fallback: number): number {
  const normalized = Math.trunc(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

export function formatBookmarkReference(reference: BookmarkReference): string {
  const book = reference.book.trim() || "Unknown";
  const chapter = toPositiveInt(reference.chapter, 1);
  const verse =
    reference.verse === undefined
      ? undefined
      : toPositiveInt(reference.verse, 1);
  return `${book} ${chapter}${verse ? `:${verse}` : ""}`;
}

export function tryParseBookmarkReference(
  reference: string,
): BookmarkReference | undefined {
  const trimmed = reference.trim();
  const match = trimmed.match(/^(.*\S)\s+(\d+)(?::(\d+))?$/);
  if (!match) {
    return undefined;
  }

  const book = match[1].trim();
  const chapter = Number(match[2]);
  const verse = match[3] ? Number(match[3]) : undefined;

  if (!book || !Number.isInteger(chapter) || chapter <= 0) {
    return undefined;
  }
  if (verse !== undefined && (!Number.isInteger(verse) || verse <= 0)) {
    return undefined;
  }

  return {
    book,
    chapter,
    ...(verse !== undefined ? { verse } : {}),
  };
}

export function parseBookmarkReference(reference: string): BookmarkReference {
  const parsed = tryParseBookmarkReference(reference);
  if (parsed) {
    return parsed;
  }
  return {
    book: reference.trim() || "Unknown",
    chapter: 1,
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
  const connectedVerses = Array.isArray(obj.connectedVerses)
    ? obj.connectedVerses.map((entry) => normalizeVerseRef(entry))
    : Array.isArray(obj.connected_verses)
      ? obj.connected_verses.map((entry) => normalizeVerseRef(entry))
      : [];

  return {
    id: readString(obj.id) ?? `connection-${index}`,
    userId: readString(obj.userId) ?? readString(obj.user_id),
    bundleId: readString(obj.bundleId) ?? readString(obj.bundle_id),
    synopsis: readString(obj.synopsis) ?? "No synopsis available.",
    connectionType:
      readString(obj.connectionType) ??
      readString(obj.connection_type) ??
      "connection",
    similarity: readNumber(obj.similarity) ?? 0,
    fromVerse: normalizeVerseRef(obj.fromVerse ?? obj.from_verse),
    toVerse: normalizeVerseRef(obj.toVerse ?? obj.to_verse),
    explanation: readString(obj.explanation),
    connectedVerseIds: readNumberArray(
      obj.connectedVerseIds ?? obj.connected_verse_ids,
    ),
    connectedVerses,
    goDeeperPrompt:
      readString(obj.goDeeperPrompt) ?? readString(obj.go_deeper_prompt),
    mapSession: obj.mapSession ?? obj.map_session,
    note: readString(obj.note),
    tags: readStringArray(obj.tags),
    createdAt: readString(obj.createdAt) ?? readString(obj.created_at),
    updatedAt: readString(obj.updatedAt) ?? readString(obj.updated_at),
    bundle: obj.bundle,
    bundleMeta: normalizeBundleMeta(obj.bundleMeta),
  };
}

export function normalizeLibraryMap(value: unknown, index: number): LibraryMap {
  const obj = asObject(value);
  return {
    id: readString(obj.id) ?? `map-${index}`,
    userId: readString(obj.userId) ?? readString(obj.user_id),
    bundleId: readString(obj.bundleId) ?? readString(obj.bundle_id),
    title: readString(obj.title),
    note: readString(obj.note),
    tags: readStringArray(obj.tags),
    createdAt: readString(obj.createdAt) ?? readString(obj.created_at),
    updatedAt: readString(obj.updatedAt) ?? readString(obj.updated_at),
    bundleMeta: normalizeBundleMeta(obj.bundleMeta),
    bundle: obj.bundle,
  };
}

export function parseBookmarksResponse(payload: unknown): Bookmark[] {
  const obj = asObject(payload);
  const bookmarks = Array.isArray(obj.bookmarks) ? obj.bookmarks : [];
  return bookmarks.map((entry, index) => normalizeBookmark(entry, index));
}

export function parseBookmarkCreateResponse(payload: unknown): Bookmark {
  const obj = asObject(payload);
  return normalizeBookmark(obj.bookmark, 0);
}

export function buildBookmarkCreatePayload(
  text: string,
): BookmarkCreatePayload {
  return { text: text.trim() };
}

export function parseHighlightsResponse(payload: unknown): Highlight[] {
  const obj = asObject(payload);
  const highlights = Array.isArray(obj.highlights) ? obj.highlights : [];
  return highlights.map((entry, index) => normalizeHighlight(entry, index));
}

export function parseHighlightUpdateResponse(payload: unknown): Highlight {
  const obj = asObject(payload);
  return normalizeHighlight(obj.highlight, 0);
}

export function buildHighlightUpdatePayload(
  payload: HighlightUpdatePayload,
): HighlightUpdatePayload {
  const output: HighlightUpdatePayload = {};
  if (Object.prototype.hasOwnProperty.call(payload, "color")) {
    output.color = readString(payload.color)?.trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, "note")) {
    output.note =
      payload.note === null ? null : (readString(payload.note)?.trim() ?? "");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "text")) {
    output.text = readString(payload.text) ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "verses")) {
    const normalizedVerses = normalizeVerseIds(payload.verses);
    output.verses = Array.isArray(payload.verses)
      ? (normalizedVerses ?? [])
      : normalizedVerses;
  }
  return output;
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

export function parseLibraryMapsResponse(payload: unknown): LibraryMap[] {
  const obj = asObject(payload);
  const maps = Array.isArray(obj.maps) ? obj.maps : [];
  return maps.map((entry, index) => normalizeLibraryMap(entry, index));
}

export function parseLibraryBundleCreateResponse(
  payload: unknown,
): LibraryBundleCreateResult {
  const obj = asObject(payload);
  return {
    bundleId: readString(obj.bundleId) ?? "",
    existing: Boolean(obj.existing),
  };
}

export function parseLibraryConnectionMutationResponse(
  payload: unknown,
): LibraryConnectionMutationResult {
  const obj = asObject(payload);
  return {
    connection: normalizeLibraryConnection(obj.connection, 0),
    existing: Boolean(obj.existing),
  };
}

export function parseLibraryConnectionUpdateResponse(
  payload: unknown,
): LibraryConnection {
  const obj = asObject(payload);
  return normalizeLibraryConnection(obj.connection, 0);
}

export function parseLibraryMapMutationResponse(
  payload: unknown,
): LibraryMapMutationResult {
  const obj = asObject(payload);
  return {
    map: normalizeLibraryMap(obj.map, 0),
    existing: Boolean(obj.existing),
  };
}

export function parseLibraryMapUpdateResponse(payload: unknown): LibraryMap {
  const obj = asObject(payload);
  return normalizeLibraryMap(obj.map, 0);
}

export function buildLibraryBundleCreatePayload(
  bundle: unknown,
): LibraryBundleCreatePayload {
  return { bundle };
}

export function buildLibraryMapCreatePayload(
  input: LibraryMapCreatePayload,
): LibraryMapCreatePayload {
  const title = readString(input.title)?.trim();
  return {
    bundleId: readString(input.bundleId)?.trim() ?? "",
    ...(title ? { title } : {}),
  };
}

export function buildLibraryMapUpdatePayload(
  input: LibraryMapUpdatePayload,
): LibraryMapUpdatePayload {
  const payload: LibraryMapUpdatePayload = {};
  if (Object.prototype.hasOwnProperty.call(input, "title")) {
    payload.title = readString(input.title)?.trim() ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(input, "note")) {
    payload.note = readString(input.note)?.trim() ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(input, "tags")) {
    payload.tags = normalizeStringArray(input.tags);
  }
  return payload;
}

export function buildLibraryConnectionCreatePayload(
  input: LibraryConnectionCreatePayload,
): LibraryConnectionCreatePayload {
  const connectionType = normalizeConnectionType(input.connectionType);
  const connectedVerseIds = normalizeVerseIds(input.connectedVerseIds);
  const explanation = readString(input.explanation)?.trim();
  const connectedVerses = Array.isArray(input.connectedVerses)
    ? input.connectedVerses
        .map((entry) => normalizeVerseRef(entry))
        .filter(
          (entry) =>
            entry.reference.trim().length > 0 &&
            typeof entry.id === "number" &&
            Number.isFinite(entry.id),
        )
    : undefined;

  return {
    bundleId: readString(input.bundleId)?.trim() ?? "",
    fromVerse: normalizeVerseRef(input.fromVerse),
    toVerse: normalizeVerseRef(input.toVerse),
    connectionType,
    similarity: readNumber(input.similarity) ?? 0,
    synopsis: readString(input.synopsis)?.trim() ?? "",
    ...(explanation ? { explanation } : {}),
    ...(connectedVerseIds ? { connectedVerseIds } : {}),
    ...(connectedVerses && connectedVerses.length > 0
      ? { connectedVerses }
      : {}),
    goDeeperPrompt: readString(input.goDeeperPrompt)?.trim() ?? "",
    ...(input.mapSession !== undefined ? { mapSession: input.mapSession } : {}),
  };
}

export function buildLibraryConnectionUpdatePayload(
  input: LibraryConnectionUpdatePayload,
): LibraryConnectionUpdatePayload {
  const payload: LibraryConnectionUpdatePayload = {};
  if (Object.prototype.hasOwnProperty.call(input, "note")) {
    payload.note = readString(input.note)?.trim() ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(input, "tags")) {
    payload.tags = normalizeStringArray(input.tags);
  }
  return payload;
}

export function buildLibraryEdgeKey(
  connectionType: string,
  fromId: number,
  toId: number,
): string {
  const a = Math.min(fromId, toId);
  const b = Math.max(fromId, toId);
  return `${connectionType}:${a}-${b}`;
}

interface BuildLibraryMapSessionOptions {
  connectionType: string;
  fromId: number;
  toId: number;
  verseIds?: number[];
}

export function buildLibraryMapSession(
  options: BuildLibraryMapSessionOptions,
): LibraryMapSessionPayload {
  const fromId = Math.trunc(options.fromId);
  const toId = Math.trunc(options.toId);
  const clusterVerseIds = normalizeVerseIds(options.verseIds) ?? [];

  if (!clusterVerseIds.includes(fromId)) {
    clusterVerseIds.unshift(fromId);
  }
  if (!clusterVerseIds.includes(toId)) {
    clusterVerseIds.push(toId);
  }

  const connectionType = normalizeConnectionType(options.connectionType);
  return {
    cluster: {
      baseId: fromId,
      verseIds: clusterVerseIds,
      connectionType,
    },
    currentConnection: {
      fromId,
      toId,
      connectionType,
    },
    visitedEdgeKeys: [buildLibraryEdgeKey(connectionType, fromId, toId)],
  };
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

interface BuildHighlightSyncPayloadOptions {
  highlights: Highlight[];
  lastSyncedAt?: string | null;
}

export function buildHighlightSyncPayload(
  options: BuildHighlightSyncPayloadOptions,
): HighlightSyncPayload {
  return {
    highlights: options.highlights.map((item) => toHighlightSyncRecord(item)),
    last_synced_at: options.lastSyncedAt ?? null,
  };
}
