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

interface LibraryConnectionResponse {
  connections: unknown[];
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

function normalizeBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

async function fetchJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`API request failed (${response.status}): ${payload}`);
  }

  return (await response.json()) as T;
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
