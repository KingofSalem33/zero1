import {
  parseBookmarksResponse,
  parseHighlightsResponse,
  parseLibraryConnectionsResponse,
} from "@zero1/shared";
import type { Bookmark, Highlight, LibraryConnection } from "@zero1/shared";

export type { Bookmark, Highlight, LibraryConnection } from "@zero1/shared";

type AuthFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface ApiClientOptions {
  apiBaseUrl: string;
  authFetch: AuthFetch;
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
    async getLibraryConnections(): Promise<LibraryConnection[]> {
      const response = await authFetch(`${baseUrl}/api/library/connections`);
      const payload = await parseApiResponse<unknown>(response);
      return parseLibraryConnectionsResponse(payload);
    },
  };
}
