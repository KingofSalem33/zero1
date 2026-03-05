import type {
  Bookmark,
  Highlight,
  HighlightUpdatePayload,
  LibraryBundleCreateResult,
  LibraryConnection,
  LibraryMap,
} from "@zero1/shared";
import {
  createProtectedApiClient,
  type HighlightSyncOptions,
  type LibraryConnectionCreatePayload,
  type LibraryConnectionUpdatePayload,
  type LibraryMapCreatePayload,
  type LibraryMapUpdatePayload,
} from "@zero1/shared-client";
import type { VisualContextBundle } from "../types/visualization";

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

export interface VerseCrossReferenceItem {
  book: string;
  chapter: number;
  verse: number;
}

export interface VerseCrossReferencesResult {
  reference: string;
  crossReferences: VerseCrossReferenceItem[];
  count: number;
}

export interface ChapterFooterCard {
  lens: string;
  title: string;
  prompt: string;
}

export interface ChapterFooterResult {
  orientation: string;
  cards: ChapterFooterCard[];
  _version?: string;
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
    input: string | URL | Request,
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

async function fetchPublicJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function fetchTraceBundle({
  apiBaseUrl,
  text,
  accessToken,
}: {
  apiBaseUrl: string;
  text: string;
  accessToken?: string;
}): Promise<VisualContextBundle> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}/api/trace`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Trace request failed (${response.status})`);
  }

  return (await response.json()) as VisualContextBundle;
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

export async function fetchVerseCrossReferences({
  apiBaseUrl,
  reference,
}: {
  apiBaseUrl: string;
  reference: string;
}): Promise<VerseCrossReferencesResult> {
  const encodedReference = encodeURIComponent(reference);
  return fetchPublicJson<VerseCrossReferencesResult>(
    `${normalizeBaseUrl(apiBaseUrl)}/api/verse/${encodedReference}/cross-references`,
  );
}

export async function fetchChapterFooter({
  apiBaseUrl,
  book,
  chapter,
}: {
  apiBaseUrl: string;
  book: string;
  chapter: number;
}): Promise<ChapterFooterResult> {
  const params = `book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(String(chapter))}`;
  return fetchPublicJson<ChapterFooterResult>(
    `${normalizeBaseUrl(apiBaseUrl)}/api/bible/chapter-footer?${params}`,
  );
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
  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).getBookmarks();
}

export async function fetchHighlights({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<MobileHighlightItem[]> {
  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).getHighlights();
}

export async function createBookmark({
  apiBaseUrl,
  accessToken,
  text,
}: ProtectedProbeOptions & { text: string }): Promise<MobileBookmarkItem> {
  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).createBookmark(text);
}

export async function deleteBookmark({
  apiBaseUrl,
  accessToken,
  id,
}: ProtectedProbeOptions & { id: string }): Promise<void> {
  await createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).deleteBookmark(id);
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
  const syncOptions: HighlightSyncOptions = {
    highlights: [...currentHighlights, newHighlight],
    lastSyncedAt: null,
  };

  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).syncHighlights(syncOptions);
}

export async function updateHighlight({
  apiBaseUrl,
  accessToken,
  id,
  updates,
}: ProtectedProbeOptions & {
  id: string;
  updates: HighlightUpdatePayload;
}): Promise<MobileHighlightItem> {
  return createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).updateHighlight(id, updates);
}

export async function deleteHighlight({
  apiBaseUrl,
  accessToken,
  id,
}: ProtectedProbeOptions & { id: string }): Promise<void> {
  await createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  }).deleteHighlight(id);
}

export async function fetchProtectedProbePayload({
  apiBaseUrl,
  accessToken,
}: ProtectedProbeOptions): Promise<ProtectedProbePayload> {
  const apiClient = createMobileProtectedApiClient({
    apiBaseUrl,
    accessToken,
  });
  const [bookmarks, highlights, connections] = await Promise.all([
    apiClient.getBookmarks(),
    apiClient.getHighlights(),
    apiClient.getLibraryConnections(),
  ]);

  return { bookmarks, highlights, connections };
}
