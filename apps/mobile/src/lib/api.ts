interface ProtectedProbeOptions {
  apiBaseUrl: string;
  accessToken: string;
}

type JsonObject = Record<string, unknown>;

interface BookmarkResponse {
  bookmarks: unknown[];
}

interface HighlightResponse {
  highlights: unknown[];
}

interface HighlightSyncResponse {
  highlights: unknown[];
  synced_at?: string;
}

interface LibraryConnectionResponse {
  connections: unknown[];
}

interface BookmarkCreateResponse {
  bookmark?: unknown;
}

interface HighlightUpdateResponse {
  highlight?: unknown;
}

interface BookmarkItemResponse {
  id?: string;
  text?: string;
  createdAt?: string;
}

interface HighlightItemResponse {
  id?: string;
  book?: string;
  chapter?: number;
  verses?: number[];
  text?: string;
  color?: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface LibraryConnectionBundleMeta {
  anchorRef?: string;
  verseCount?: number;
  edgeCount?: number;
}

interface LibraryConnectionVerseRef {
  reference: string;
  text?: string;
}

export interface LibraryConnectionItem {
  id: string;
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

export interface ProtectedProbeResult {
  bookmarksCount: number;
  highlightsCount: number;
  libraryConnectionsCount: number;
}

export interface MobileBookmarkItem {
  id: string;
  text: string;
  createdAt?: string;
}

export interface MobileHighlightItem {
  id: string;
  book: string;
  chapter: number;
  referenceLabel: string;
  text: string;
  color: string;
  note?: string;
  verses: number[];
  createdAt?: string;
  updatedAt?: string;
}

function normalizeBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

interface RequestJsonOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

async function requestJson<T>(
  url: string,
  accessToken: string,
  options?: RequestJsonOptions,
): Promise<T> {
  const hasBody = options?.body !== undefined;
  const response = await fetch(url, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`API request failed (${response.status}): ${payload}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

async function fetchJson<T>(url: string, accessToken: string): Promise<T> {
  return requestJson<T>(url, accessToken, { method: "GET" });
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeVerseRef(value: unknown): LibraryConnectionVerseRef {
  const obj = asObject(value);
  return {
    reference: asString(obj?.reference) ?? "Unknown reference",
    text: asString(obj?.text),
  };
}

function normalizeBundleMeta(
  value: unknown,
): LibraryConnectionBundleMeta | undefined {
  const obj = asObject(value);
  if (!obj) return undefined;
  return {
    anchorRef: asString(obj.anchorRef),
    verseCount: asNumber(obj.verseCount),
    edgeCount: asNumber(obj.edgeCount),
  };
}

function normalizeConnection(
  value: unknown,
  index: number,
): LibraryConnectionItem {
  const obj = asObject(value) ?? {};
  return {
    id: asString(obj.id) ?? `connection-${index}`,
    synopsis: asString(obj.synopsis) ?? "No synopsis available.",
    connectionType: asString(obj.connectionType) ?? "connection",
    similarity: asNumber(obj.similarity) ?? 0,
    fromVerse: normalizeVerseRef(obj.fromVerse),
    toVerse: normalizeVerseRef(obj.toVerse),
    note: asString(obj.note),
    tags: asStringArray(obj.tags),
    createdAt: asString(obj.createdAt),
    bundleMeta: normalizeBundleMeta(obj.bundleMeta),
  };
}

function normalizeBookmark(value: unknown, index: number): MobileBookmarkItem {
  const obj = (asObject(value) ?? {}) as BookmarkItemResponse;
  return {
    id: asString(obj.id) ?? `bookmark-${index}`,
    text: asString(obj.text) ?? "",
    createdAt: asString(obj.createdAt),
  };
}

function normalizeHighlight(
  value: unknown,
  index: number,
): MobileHighlightItem {
  const obj = (asObject(value) ?? {}) as HighlightItemResponse;
  const book = asString(obj.book) ?? "Unknown";
  const chapter = asNumber(obj.chapter) ?? 0;
  const verses = Array.isArray(obj.verses)
    ? obj.verses.filter(
        (entry): entry is number =>
          typeof entry === "number" && Number.isFinite(entry),
      )
    : [];
  const verseLabel =
    verses.length > 0
      ? verses.length === 1
        ? String(verses[0])
        : `${verses[0]}-${verses[verses.length - 1]}`
      : "?";

  return {
    id: asString(obj.id) ?? `highlight-${index}`,
    book,
    chapter,
    referenceLabel: `${book} ${chapter}:${verseLabel}`,
    text: asString(obj.text) ?? "",
    color: asString(obj.color) ?? "#facc15",
    note: asString(obj.note ?? undefined),
    verses,
    createdAt: asString(obj.created_at),
    updatedAt: asString(obj.updated_at) ?? asString(obj.created_at),
  };
}

export async function fetchProtectedProbe({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<ProtectedProbeResult> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const [bookmarks, highlights, connections] = await Promise.all([
    fetchJson<BookmarkResponse>(`${baseUrl}/api/bookmarks`, accessToken),
    fetchJson<HighlightResponse>(`${baseUrl}/api/highlights`, accessToken),
    fetchJson<LibraryConnectionResponse>(
      `${baseUrl}/api/library/connections`,
      accessToken,
    ),
  ]);

  return {
    bookmarksCount: Array.isArray(bookmarks.bookmarks)
      ? bookmarks.bookmarks.length
      : 0,
    highlightsCount: Array.isArray(highlights.highlights)
      ? highlights.highlights.length
      : 0,
    libraryConnectionsCount: Array.isArray(connections.connections)
      ? connections.connections.length
      : 0,
  };
}

export async function fetchLibraryConnections({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<LibraryConnectionItem[]> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const payload = await fetchJson<LibraryConnectionResponse>(
    `${baseUrl}/api/library/connections`,
    accessToken,
  );

  if (!Array.isArray(payload.connections)) {
    return [];
  }

  return payload.connections.map((entry, index) =>
    normalizeConnection(entry, index),
  );
}

export async function fetchBookmarks({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<MobileBookmarkItem[]> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const payload = await fetchJson<BookmarkResponse>(
    `${baseUrl}/api/bookmarks`,
    accessToken,
  );

  if (!Array.isArray(payload.bookmarks)) {
    return [];
  }

  return payload.bookmarks.map((entry, index) =>
    normalizeBookmark(entry, index),
  );
}

export async function fetchHighlights({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<MobileHighlightItem[]> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const payload = await fetchJson<HighlightResponse>(
    `${baseUrl}/api/highlights`,
    accessToken,
  );

  if (!Array.isArray(payload.highlights)) {
    return [];
  }

  return payload.highlights.map((entry, index) =>
    normalizeHighlight(entry, index),
  );
}

export async function createBookmark({
  apiBaseUrl,
  accessToken,
  text,
}: ProtectedProbeOptions & { text: string }): Promise<MobileBookmarkItem> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const payload = await requestJson<BookmarkCreateResponse>(
    `${baseUrl}/api/bookmarks`,
    accessToken,
    {
      method: "POST",
      body: { text },
    },
  );

  return normalizeBookmark(payload.bookmark, 0);
}

export async function deleteBookmark({
  apiBaseUrl,
  accessToken,
  id,
}: ProtectedProbeOptions & { id: string }): Promise<void> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  await requestJson<Record<string, unknown>>(
    `${baseUrl}/api/bookmarks/${encodeURIComponent(id)}`,
    accessToken,
    { method: "DELETE" },
  );
}

function toHighlightSyncRecord(
  item: MobileHighlightItem,
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

export async function createHighlightViaSync({
  apiBaseUrl,
  accessToken,
  currentHighlights,
  newHighlight,
}: ProtectedProbeOptions & {
  currentHighlights: MobileHighlightItem[];
  newHighlight: MobileHighlightItem;
}): Promise<MobileHighlightItem[]> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const payload = await requestJson<HighlightSyncResponse>(
    `${baseUrl}/api/highlights/sync`,
    accessToken,
    {
      method: "POST",
      body: {
        highlights: [
          ...currentHighlights.map((item) => toHighlightSyncRecord(item)),
          toHighlightSyncRecord(newHighlight),
        ],
        last_synced_at: null,
      },
    },
  );

  if (!Array.isArray(payload.highlights)) {
    return [];
  }
  return payload.highlights.map((entry, index) =>
    normalizeHighlight(entry, index),
  );
}

export async function updateHighlight({
  apiBaseUrl,
  accessToken,
  id,
  updates,
}: ProtectedProbeOptions & {
  id: string;
  updates: {
    color?: string;
    note?: string | null;
    text?: string;
    verses?: number[];
  };
}): Promise<MobileHighlightItem> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const payload = await requestJson<HighlightUpdateResponse>(
    `${baseUrl}/api/highlights/${encodeURIComponent(id)}`,
    accessToken,
    {
      method: "PUT",
      body: updates,
    },
  );

  return normalizeHighlight(payload.highlight, 0);
}

export async function deleteHighlight({
  apiBaseUrl,
  accessToken,
  id,
}: ProtectedProbeOptions & { id: string }): Promise<void> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  await requestJson<Record<string, unknown>>(
    `${baseUrl}/api/highlights/${encodeURIComponent(id)}`,
    accessToken,
    { method: "DELETE" },
  );
}
