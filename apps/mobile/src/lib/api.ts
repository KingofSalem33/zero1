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

export interface VerseTextResult {
  reference: string;
  text: string;
  book: string;
  chapter: number;
  verse: number;
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

export interface SynopsisResponse {
  synopsis: string;
  wordCount: number;
  verse?: {
    book: string;
    chapter: number;
    verse: number;
    reference: string;
  };
  verses?: {
    book: string;
    chapter: number;
    verses: number[];
    reference: string;
  };
}

export interface RootTranslationWord {
  english: string;
  original: string;
  strongs: string | null;
  definition: string;
}

export interface RootTranslationResponse {
  words: RootTranslationWord[];
  lostContext: string;
  language: string;
  strongsUsed: string[];
  versesIncluded?: number;
  totalWords?: number;
}

export interface ChainOfThoughtResult {
  reasoning: string;
  citations: string[];
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

export async function fetchChainOfThought({
  apiBaseUrl,
  answer,
  question,
  accessToken,
}: {
  apiBaseUrl: string;
  answer: string;
  question?: string;
  accessToken?: string;
}): Promise<ChainOfThoughtResult> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(
    `${normalizeBaseUrl(apiBaseUrl)}/api/chain-of-thought`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        answer,
        ...(question?.trim() ? { question: question.trim() } : {}),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Chain request failed (${response.status})`);
  }

  return (await response.json()) as ChainOfThoughtResult;
}

export async function fetchSynopsis({
  apiBaseUrl,
  text,
  maxWords = 34,
  book,
  chapter,
  verse,
  verses,
  accessToken,
}: {
  apiBaseUrl: string;
  text: string;
  maxWords?: number;
  book?: string;
  chapter?: number;
  verse?: number;
  verses?: number[];
  accessToken?: string;
}): Promise<SynopsisResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}/api/synopsis`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      maxWords,
      ...(book ? { book } : {}),
      ...(chapter ? { chapter } : {}),
      ...(verse ? { verse } : {}),
      ...(verses && verses.length > 0 ? { verses } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Synopsis request failed (${response.status})`);
  }

  return (await response.json()) as SynopsisResponse;
}

export async function fetchRootTranslation({
  apiBaseUrl,
  selectedText,
  maxWords = 140,
  book,
  chapter,
  verse,
  verses,
  accessToken,
}: {
  apiBaseUrl: string;
  selectedText: string;
  maxWords?: number;
  book?: string;
  chapter?: number;
  verse?: number;
  verses?: number[];
  accessToken?: string;
}): Promise<RootTranslationResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(
    `${normalizeBaseUrl(apiBaseUrl)}/api/root-translation`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        selectedText,
        maxWords,
        ...(book ? { book } : {}),
        ...(chapter ? { chapter } : {}),
        ...(verse ? { verse } : {}),
        ...(verses && verses.length > 0 ? { verses } : {}),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Root translation request failed (${response.status})`);
  }

  return (await response.json()) as RootTranslationResponse;
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

export async function fetchVerseText({
  apiBaseUrl,
  reference,
}: {
  apiBaseUrl: string;
  reference: string;
}): Promise<VerseTextResult> {
  const encodedReference = encodeURIComponent(reference);
  return fetchPublicJson<VerseTextResult>(
    `${normalizeBaseUrl(apiBaseUrl)}/api/verse/${encodedReference}`,
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
