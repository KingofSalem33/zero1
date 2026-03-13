import {
  buildBookmarkCreatePayload,
  buildHighlightSyncPayload,
  buildHighlightUpdatePayload,
  buildLibraryBundleCreatePayload,
  buildLibraryConnectionCreatePayload,
  buildLibraryConnectionUpdatePayload,
  buildLibraryMapCreatePayload,
  buildLibraryMapUpdatePayload,
  parseBookmarkCreateResponse,
  parseBookmarksResponse,
  parseLibraryBundleCreateResponse,
  parseHighlightsResponse,
  parseHighlightUpdateResponse,
  parseLibraryConnectionMutationResponse,
  parseLibraryConnectionsResponse,
  parseLibraryConnectionUpdateResponse,
  parseLibraryMapMutationResponse,
  parseLibraryMapsResponse,
  parseLibraryMapUpdateResponse,
} from "@zero1/shared";
import type {
  Bookmark,
  Highlight,
  HighlightSyncPayload,
  HighlightUpdatePayload,
  LibraryBundleCreateResult,
  LibraryConnection,
  LibraryConnectionCreatePayload,
  LibraryConnectionMutationResult,
  LibraryConnectionUpdatePayload,
  LibraryMap,
  LibraryMapCreatePayload,
  LibraryMapMutationResult,
  LibraryMapUpdatePayload,
} from "@zero1/shared";

export type {
  Bookmark,
  Highlight,
  HighlightSyncPayload,
  HighlightUpdatePayload,
  LibraryBundleCreateResult,
  LibraryConnection,
  LibraryConnectionCreatePayload,
  LibraryConnectionMutationResult,
  LibraryConnectionUpdatePayload,
  LibraryMap,
  LibraryMapCreatePayload,
  LibraryMapMutationResult,
  LibraryMapUpdatePayload,
} from "@zero1/shared";

type AuthFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface ApiClientOptions {
  apiBaseUrl: string;
  authFetch: AuthFetch;
}

export interface HighlightSyncOptions {
  highlights: Highlight[];
  lastSyncedAt?: string | null;
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`API request failed (${response.status}): ${payload}`);
  }
  return (await response.json()) as T;
}

export function createProtectedApiClient({
  apiBaseUrl,
  authFetch,
}: ApiClientOptions) {
  const baseUrl = apiBaseUrl.replace(/\/+$/, "");

  return {
    async getBookmarks(): Promise<Bookmark[]> {
      const response = await authFetch(`${baseUrl}/api/bookmarks`);
      const payload = await parseApiResponse<unknown>(response);
      return parseBookmarksResponse(payload);
    },
    async getHighlights(): Promise<Highlight[]> {
      const response = await authFetch(`${baseUrl}/api/highlights`);
      const payload = await parseApiResponse<unknown>(response);
      return parseHighlightsResponse(payload);
    },
    async createBookmark(text: string): Promise<Bookmark> {
      const payload = buildBookmarkCreatePayload(text);
      const response = await authFetch(`${baseUrl}/api/bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = await parseApiResponse<unknown>(response);
      return parseBookmarkCreateResponse(responsePayload);
    },
    async deleteBookmark(id: string): Promise<void> {
      const response = await authFetch(
        `${baseUrl}/api/bookmarks/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      await parseApiResponse<unknown>(response);
    },
    async syncHighlights(options: HighlightSyncOptions): Promise<Highlight[]> {
      const payload: HighlightSyncPayload = buildHighlightSyncPayload({
        highlights: options.highlights,
        lastSyncedAt: options.lastSyncedAt,
      });
      const response = await authFetch(`${baseUrl}/api/highlights/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = await parseApiResponse<unknown>(response);
      return parseHighlightsResponse(responsePayload);
    },
    async updateHighlight(
      id: string,
      payload: HighlightUpdatePayload,
    ): Promise<Highlight> {
      const normalizedPayload = buildHighlightUpdatePayload(payload);
      const response = await authFetch(
        `${baseUrl}/api/highlights/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(normalizedPayload),
        },
      );
      const responsePayload = await parseApiResponse<unknown>(response);
      return parseHighlightUpdateResponse(responsePayload);
    },
    async deleteHighlight(id: string): Promise<void> {
      const response = await authFetch(
        `${baseUrl}/api/highlights/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      await parseApiResponse<unknown>(response);
    },
    async getLibraryConnections(): Promise<LibraryConnection[]> {
      const response = await authFetch(`${baseUrl}/api/library/connections`);
      const payload = await parseApiResponse<unknown>(response);
      return parseLibraryConnectionsResponse(payload);
    },
    async getLibraryMaps(): Promise<LibraryMap[]> {
      const response = await authFetch(`${baseUrl}/api/library/maps`);
      const payload = await parseApiResponse<unknown>(response);
      return parseLibraryMapsResponse(payload);
    },
    async createLibraryBundle(
      bundle: unknown,
    ): Promise<LibraryBundleCreateResult> {
      const payload = buildLibraryBundleCreatePayload(bundle);
      const response = await authFetch(`${baseUrl}/api/library/bundles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = await parseApiResponse<unknown>(response);
      return parseLibraryBundleCreateResponse(responsePayload);
    },
    async createLibraryConnection(
      payload: LibraryConnectionCreatePayload,
    ): Promise<LibraryConnectionMutationResult> {
      const normalizedPayload = buildLibraryConnectionCreatePayload(payload);
      const response = await authFetch(`${baseUrl}/api/library/connections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(normalizedPayload),
      });
      const responsePayload = await parseApiResponse<unknown>(response);
      return parseLibraryConnectionMutationResponse(responsePayload);
    },
    async updateLibraryConnection(
      id: string,
      payload: LibraryConnectionUpdatePayload,
    ): Promise<LibraryConnection> {
      const normalizedPayload = buildLibraryConnectionUpdatePayload(payload);
      const response = await authFetch(
        `${baseUrl}/api/library/connections/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(normalizedPayload),
        },
      );
      const responsePayload = await parseApiResponse<unknown>(response);
      return parseLibraryConnectionUpdateResponse(responsePayload);
    },
    async deleteLibraryConnection(id: string): Promise<void> {
      const response = await authFetch(
        `${baseUrl}/api/library/connections/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      await parseApiResponse<unknown>(response);
    },
    async createLibraryMap(
      payload: LibraryMapCreatePayload,
    ): Promise<LibraryMapMutationResult> {
      const normalizedPayload = buildLibraryMapCreatePayload(payload);
      const response = await authFetch(`${baseUrl}/api/library/maps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(normalizedPayload),
      });
      const responsePayload = await parseApiResponse<unknown>(response);
      return parseLibraryMapMutationResponse(responsePayload);
    },
    async updateLibraryMap(
      id: string,
      payload: LibraryMapUpdatePayload,
    ): Promise<LibraryMap> {
      const normalizedPayload = buildLibraryMapUpdatePayload(payload);
      const response = await authFetch(
        `${baseUrl}/api/library/maps/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(normalizedPayload),
        },
      );
      const responsePayload = await parseApiResponse<unknown>(response);
      return parseLibraryMapUpdateResponse(responsePayload);
    },
    async deleteLibraryMap(id: string): Promise<void> {
      const response = await authFetch(
        `${baseUrl}/api/library/maps/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      await parseApiResponse<unknown>(response);
    },
  };
}
