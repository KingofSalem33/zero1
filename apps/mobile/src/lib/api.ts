import {
  normalizeBookmark,
  normalizeHighlight,
  parseBookmarksResponse,
  parseHighlightsResponse,
  toHighlightSyncRecord,
  type Bookmark,
  type Highlight,
  type LibraryBundleCreateResult,
  type LibraryConnection,
  type LibraryMap,
} from "@zero1/shared";
import {
  createProtectedApiClient,
  type LibraryConnectionCreatePayload,
  type LibraryConnectionUpdatePayload,
  type LibraryMapCreatePayload,
  type LibraryMapUpdatePayload,
} from "@zero1/shared-client";

interface ProtectedProbeOptions {
  apiBaseUrl: string;
  accessToken: string;
}

interface ProtectedProbePayload {
  bookmarks: unknown;
  highlights: unknown;
  connections: unknown;
}

export interface ProtectedProbeResult {
  bookmarksCount: number;
  highlightsCount: number;
  libraryConnectionsCount: number;
}

export type LibraryConnectionItem = LibraryConnection;
export type LibraryMapItem = LibraryMap;
export type LibraryBundleResult = LibraryBundleCreateResult;
export type MobileBookmarkItem = Bookmark;
export type MobileHighlightItem = Highlight;

function normalizeBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

function buildMobileAuthFetch(accessToken: string) {
  return async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(input, {
      ...init,
      headers,
    });
  };
}

function createMobileProtectedApiClient({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions) {
  return createProtectedApiClient({
    apiBaseUrl: normalizeBaseUrl(apiBaseUrl),
    authFetch: buildMobileAuthFetch(accessToken),
  });
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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function fetchProtectedProbe({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<ProtectedProbeResult> {
  const apiClient = createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  });
  const [bookmarks, highlights, connections] = await Promise.all([
    apiClient.getBookmarks(),
    apiClient.getHighlights(),
    apiClient.getLibraryConnections(),
  ]);

  return {
    bookmarksCount: bookmarks.length,
    highlightsCount: highlights.length,
    libraryConnectionsCount: connections.length,
  };
}

export async function fetchLibraryConnections({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<LibraryConnectionItem[]> {
  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).getLibraryConnections();
}

export async function fetchLibraryMaps({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<LibraryMapItem[]> {
  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).getLibraryMaps();
}

export async function createLibraryBundle({
  apiBaseUrl,
  accessToken,
  bundle,
}: ProtectedProbeOptions & {
  bundle: unknown;
}): Promise<LibraryBundleResult> {
  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).createLibraryBundle(bundle);
}

export async function createLibraryConnection({
  apiBaseUrl,
  accessToken,
  payload,
}: ProtectedProbeOptions & {
  payload: LibraryConnectionCreatePayload;
}): Promise<LibraryConnectionItem> {
  const result = await createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).createLibraryConnection(payload);
  return result.connection;
}

export async function updateLibraryConnection({
  apiBaseUrl,
  accessToken,
  id,
  payload,
}: ProtectedProbeOptions & {
  id: string;
  payload: LibraryConnectionUpdatePayload;
}): Promise<LibraryConnectionItem> {
  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).updateLibraryConnection(id, payload);
}

export async function deleteLibraryConnection({
  apiBaseUrl,
  accessToken,
  id,
}: ProtectedProbeOptions & { id: string }): Promise<void> {
  await createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).deleteLibraryConnection(id);
}

export async function createLibraryMap({
  apiBaseUrl,
  accessToken,
  payload,
}: ProtectedProbeOptions & {
  payload: LibraryMapCreatePayload;
}): Promise<LibraryMapItem> {
  const result = await createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).createLibraryMap(payload);
  return result.map;
}

export async function updateLibraryMap({
  apiBaseUrl,
  accessToken,
  id,
  payload,
}: ProtectedProbeOptions & {
  id: string;
  payload: LibraryMapUpdatePayload;
}): Promise<LibraryMapItem> {
  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).updateLibraryMap(id, payload);
}

export async function deleteLibraryMap({
  apiBaseUrl,
  accessToken,
  id,
}: ProtectedProbeOptions & { id: string }): Promise<void> {
  await createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).deleteLibraryMap(id);
}

export async function fetchBookmarks({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<MobileBookmarkItem[]> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const payload = await fetchJson<unknown>(
    `${baseUrl}/api/bookmarks`,
    accessToken,
  );
  return parseBookmarksResponse(payload);
}

export async function fetchHighlights({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<MobileHighlightItem[]> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const payload = await fetchJson<unknown>(
    `${baseUrl}/api/highlights`,
    accessToken,
  );
  return parseHighlightsResponse(payload);
}

export async function createBookmark({
  apiBaseUrl,
  accessToken,
  text,
}: ProtectedProbeOptions & { text: string }): Promise<MobileBookmarkItem> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const payload = await requestJson<unknown>(
    `${baseUrl}/api/bookmarks`,
    accessToken,
    {
      method: "POST",
      body: { text },
    },
  );

  const obj = asObject(payload);
  return normalizeBookmark(obj.bookmark, 0);
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
  const payload = await requestJson<unknown>(
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

  return parseHighlightsResponse(payload);
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
  const payload = await requestJson<unknown>(
    `${baseUrl}/api/highlights/${encodeURIComponent(id)}`,
    accessToken,
    {
      method: "PUT",
      body: updates,
    },
  );

  const obj = asObject(payload);
  return normalizeHighlight(obj.highlight, 0);
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

export async function fetchProtectedProbePayload({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<ProtectedProbePayload> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const [bookmarks, highlights, connections] = await Promise.all([
    fetchJson<unknown>(`${baseUrl}/api/bookmarks`, accessToken),
    fetchJson<unknown>(`${baseUrl}/api/highlights`, accessToken),
    fetchJson<unknown>(`${baseUrl}/api/library/connections`, accessToken),
  ]);

  return { bookmarks, highlights, connections };
}
