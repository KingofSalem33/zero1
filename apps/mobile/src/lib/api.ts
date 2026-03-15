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

export interface SemanticConnectionSynopsisResult {
  title: string;
  synopsis: string;
  verses: Array<{
    id: number;
    reference: string;
    text: string;
  }>;
  connectionType: string;
  similarity: number;
  verseCount: number;
}

export interface DiscoveredConnectionResult {
  from: number;
  to: number;
  type:
    | "TYPOLOGY"
    | "FULFILLMENT"
    | "CONTRAST"
    | "PROGRESSION"
    | "PATTERN"
    | "ROOTS"
    | "ECHOES"
    | "PROPHECY"
    | "NARRATIVE"
    | "GENEALOGY"
    | "ALLUSION";
  explanation: string;
  confidence: number;
}

export interface NextBranchOption {
  label: string;
  prompt: string;
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

function buildFallbackChainReasoning(answer: string): string {
  const normalized = answer
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return [
      "- Identify the core claim in the response.",
      "- Anchor the claim in the cited passage.",
      "- Explain the meaning in plain language.",
      "- Apply one clear next step for study.",
    ].join("\n");
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 6)
    .map((line) => {
      const trimmed = line.replace(/^[-*]\s*/, "").trim();
      if (trimmed.length <= 180) return trimmed;
      return `${trimmed.slice(0, 177).trimEnd()}...`;
    });

  const bullets = sentences.map((line) =>
    line.startsWith("- ") ? line : `- ${line}`,
  );

  if (bullets.length >= 4) {
    return bullets.join("\n");
  }

  const padded = [...bullets];
  while (padded.length < 4) {
    padded.push("- Connect the point to its immediate biblical context.");
  }
  return padded.slice(0, 6).join("\n");
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

async function readSseDonePayload<T>(
  response: globalThis.Response,
  onEvent?: (event: string, payload: Record<string, unknown>) => void,
): Promise<T | undefined> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    return undefined;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body unavailable");
  }

  const decoder = new globalThis.TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let donePayload: T | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) {
        currentEvent = "";
        continue;
      }
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith("data:")) {
        continue;
      }

      const json = line.slice(5).trim();
      if (!json) continue;

      try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        onEvent?.(currentEvent, parsed);
        if (currentEvent === "done") {
          donePayload = parsed as T;
        } else if (currentEvent === "error") {
          streamError =
            typeof parsed.message === "string"
              ? parsed.message
              : "Request failed";
        }
      } catch {
        // Ignore malformed SSE payloads and continue.
      }
    }
  }

  if (donePayload) {
    return donePayload;
  }
  if (streamError) {
    throw new Error(streamError);
  }
  throw new Error("Streaming response ended before completion");
}

function parseSemanticSynopsisDraft(rawText: string): {
  title: string;
  synopsis: string;
} {
  const normalized = rawText.replace(/\r\n/g, "\n");
  const titleMatch = normalized.match(/^\s*Title:\s*([^\n\r]*)/im);
  const synopsisMatch = normalized.match(/^\s*Synopsis:\s*([\s\S]*)$/im);
  return {
    title: titleMatch?.[1]?.trim() || "",
    synopsis: synopsisMatch?.[1]?.trim() || "",
  };
}

export async function fetchTraceBundle({
  apiBaseUrl,
  text,
  accessToken,
  signal,
}: {
  apiBaseUrl: string;
  text: string;
  accessToken?: string;
  signal?: globalThis.AbortSignal;
}): Promise<VisualContextBundle> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}/api/trace`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
    signal,
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
  const fallback = (): ChainOfThoughtResult => ({
    reasoning: buildFallbackChainReasoning(answer),
    citations: [],
  });

  try {
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
      if (response.status >= 500) {
        return fallback();
      }
      throw new Error(`Chain request failed (${response.status})`);
    }

    const payload = (await response.json()) as Partial<ChainOfThoughtResult>;
    const reasoning =
      typeof payload.reasoning === "string" ? payload.reasoning.trim() : "";
    if (!reasoning) {
      return fallback();
    }
    return {
      reasoning,
      citations: Array.isArray(payload.citations)
        ? payload.citations.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
    };
  } catch {
    return fallback();
  }
}

export async function fetchNextBranches({
  apiBaseUrl,
  question,
  answer,
  citations,
  accessToken,
}: {
  apiBaseUrl: string;
  question?: string;
  answer: string;
  citations?: string[];
  accessToken?: string;
}): Promise<NextBranchOption[]> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const toSentenceCase = (value: string) => {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) return trimmed;
    return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
  };

  const sanitizeLabel = (value: string): string => {
    const cleaned = value
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "";
    return toSentenceCase(cleaned);
  };

  const toSubtleNudge = (value: string): string => {
    let cleaned = sanitizeLabel(value)
      .replace(/[.!?]+$/g, "")
      .trim();
    if (!cleaned) return "";
    cleaned = cleaned
      .replace(/^(want to\s+(see|explore|trace|learn)\s+how\s+)/i, "How ")
      .replace(/^(want to\s+(see|explore|trace|learn)\s+)/i, "")
      .replace(/^(explore|trace|compare|consider|see|look at)\s+/i, "");
    const normalized = sanitizeLabel(cleaned)
      .replace(/[.!?]+$/g, "")
      .trim();
    if (!normalized) return "";
    return `${normalized}.`;
  };

  const isGenericLabel = (label: string): boolean => {
    const normalized = label.toLowerCase().trim();
    if (!normalized) return true;
    return [
      /^go deeper\b/,
      /^compare\b/,
      /^practical\b/,
      /^next step\b/,
      /^learn more\b/,
      /^explore more\b/,
      /^more context\b/,
      /^deeper\b/,
      /^follow up\b/,
    ].some((pattern) => pattern.test(normalized));
  };

  const extractIdeaSentences = (text: string, count: number): string[] => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return [];
    return cleaned
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sanitizeLabel(sentence))
      .filter((sentence) => sentence.length >= 22 && sentence.length <= 180)
      .filter((sentence) => !isGenericLabel(sentence))
      .slice(0, count);
  };

  const fallback = (): NextBranchOption[] => {
    const primary = citations?.[0];
    const secondary = citations?.[1];
    const labels = extractIdeaSentences(answer, 2);

    if (labels.length < 2 && primary) {
      labels.push(
        `${primary} reveals a connected promise thread that sharpens this answer.`,
      );
    }
    if (labels.length < 2 && secondary) {
      labels.push(
        `${secondary} extends the same theme and shows how the idea unfolds across Scripture.`,
      );
    }
    while (labels.length < 2) {
      labels.push(
        labels.length === 0
          ? "A connected kingdom thread runs through this answer and points to the next passage to explore."
          : "This adjacent theme clarifies how the same biblical idea develops in the surrounding texts.",
      );
    }

    return labels.slice(0, 2).map((label, idx) => ({
      label: toSubtleNudge(label),
      prompt:
        idx === 0
          ? `Follow this next thread from the answer and show one supporting verse with why it matters: ${label}`
          : `Explore this adjacent connection from the answer with one additional verse and explain the significance: ${label}`,
    }));
  };

  if (!answer.trim()) {
    return fallback();
  }

  try {
    const response = await fetch(
      `${normalizeBaseUrl(apiBaseUrl)}/api/next-branches`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          answer,
          ...(question?.trim() ? { question: question.trim() } : {}),
          ...(citations && citations.length > 0 ? { citations } : {}),
        }),
      },
    );

    if (!response.ok) {
      if (response.status >= 500) {
        return fallback();
      }
      throw new Error(`Next branches request failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      branches?: Array<{
        label?: string;
        prompt?: string;
      }>;
    };
    const branches = (payload.branches || [])
      .map((entry) => ({
        label:
          typeof entry.label === "string"
            ? toSubtleNudge(entry.label.replace(/\s+/g, " ").trim())
            : "",
        prompt:
          typeof entry.prompt === "string"
            ? entry.prompt.replace(/\s+/g, " ").trim()
            : "",
      }))
      .filter(
        (entry) => entry.label && entry.prompt && !isGenericLabel(entry.label),
      )
      .slice(0, 2);

    if (branches.length >= 2) {
      return branches;
    }
    return fallback();
  } catch {
    return fallback();
  }
}

export async function fetchSynopsis({
  apiBaseUrl,
  text,
  maxWords = 34,
  book,
  chapter,
  verse,
  verses,
  pericopeTitle,
  pericopeType,
  pericopeThemes,
  accessToken,
  signal,
  onSynopsis,
}: {
  apiBaseUrl: string;
  text: string;
  maxWords?: number;
  book?: string;
  chapter?: number;
  verse?: number;
  verses?: number[];
  pericopeTitle?: string;
  pericopeType?: string;
  pericopeThemes?: string[];
  accessToken?: string;
  signal?: globalThis.AbortSignal;
  onSynopsis?: (synopsis: string) => void;
}): Promise<SynopsisResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Accept", "text/event-stream");
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
      ...(pericopeTitle ? { pericopeTitle } : {}),
      ...(pericopeType ? { pericopeType } : {}),
      ...(pericopeThemes?.length ? { pericopeThemes } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Synopsis request failed (${response.status})`);
  }

  let streamedSynopsis = "";
  const streamedPayload = await readSseDonePayload<SynopsisResponse>(
    response,
    (event, payload) => {
      if (event !== "content") return;
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (!delta) return;
      streamedSynopsis += delta;
      onSynopsis?.(streamedSynopsis);
    },
  );
  if (streamedPayload) {
    return streamedPayload;
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

export async function fetchSemanticConnectionSynopsis({
  apiBaseUrl,
  verseIds,
  verses,
  connectionType,
  similarity,
  isLlmDiscovered,
  topicContext,
  accessToken,
  signal,
  onProgress,
}: {
  apiBaseUrl: string;
  verseIds: number[];
  verses: Array<{
    id: number;
    reference: string;
    text: string;
    pericopeTitle?: string;
    pericopeType?: string;
    pericopeThemes?: string[];
  }>;
  connectionType: string;
  similarity: number;
  isLlmDiscovered?: boolean;
  topicContext?: Array<{
    styleType: string;
    label: string;
    overlap: number;
  }>;
  accessToken?: string;
  signal?: globalThis.AbortSignal;
  onProgress?: (draft: { title: string; synopsis: string }) => void;
}): Promise<SemanticConnectionSynopsisResult> {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Accept", "text/event-stream");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(
    `${normalizeBaseUrl(apiBaseUrl)}/api/semantic-connection/synopsis`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        verseIds,
        verses,
        connectionType,
        similarity,
        ...(isLlmDiscovered ? { isLLMDiscovered: true } : {}),
        ...(topicContext && topicContext.length > 0 ? { topicContext } : {}),
      }),
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Semantic connection request failed (${response.status})`);
  }

  let streamedText = "";
  const streamedPayload =
    await readSseDonePayload<SemanticConnectionSynopsisResult>(
      response,
      (event, payload) => {
        if (event !== "content") return;
        const delta = typeof payload.delta === "string" ? payload.delta : "";
        if (!delta) return;
        streamedText += delta;
        onProgress?.(parseSemanticSynopsisDraft(streamedText));
      },
    );
  if (streamedPayload) {
    return streamedPayload;
  }

  return (await response.json()) as SemanticConnectionSynopsisResult;
}

export async function fetchSemanticConnectionTopicTitles({
  apiBaseUrl,
  topics,
  accessToken,
}: {
  apiBaseUrl: string;
  topics: Array<{
    type: string;
    verses: Array<{
      reference: string;
      text: string;
    }>;
  }>;
  accessToken?: string;
}): Promise<Record<string, string>> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(
    `${normalizeBaseUrl(apiBaseUrl)}/api/semantic-connection/topic-titles`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ topics }),
    },
  );

  if (!response.ok) {
    throw new Error(`Semantic topic title request failed (${response.status})`);
  }

  const data = (await response.json()) as { titles?: Record<string, string> };
  return data.titles ?? {};
}

export async function discoverConnections({
  apiBaseUrl,
  verseIds,
  accessToken,
}: {
  apiBaseUrl: string;
  verseIds: number[];
  accessToken?: string;
}): Promise<{
  connections: DiscoveredConnectionResult[];
  fromCache: boolean;
}> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(
    `${normalizeBaseUrl(apiBaseUrl)}/api/discover-connections`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ verseIds }),
    },
  );

  if (!response.ok) {
    throw new Error(`Discover connections request failed (${response.status})`);
  }

  return (await response.json()) as {
    connections: DiscoveredConnectionResult[];
    fromCache: boolean;
  };
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
