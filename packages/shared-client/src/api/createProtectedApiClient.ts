export interface Bookmark {
  id: string;
  text: string;
  createdAt: string;
  userId: string;
}

export interface Highlight {
  id: string;
  book: string;
  chapter: number;
  verses: number[];
  text: string;
  color: string;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryConnection {
  id: string;
  bundleId: string;
  connectionType: string;
  similarity: number;
  synopsis: string;
}

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
      const payload = await parseApiResponse<{ bookmarks: Bookmark[] }>(response);
      return payload.bookmarks;
    },
    async getHighlights(): Promise<Highlight[]> {
      const response = await authFetch(`${baseUrl}/api/highlights`);
      const payload = await parseApiResponse<{ highlights: Highlight[] }>(
        response,
      );
      return payload.highlights;
    },
    async getLibraryConnections(): Promise<LibraryConnection[]> {
      const response = await authFetch(`${baseUrl}/api/library/connections`);
      const payload = await parseApiResponse<{
        connections: LibraryConnection[];
      }>(response);
      return payload.connections;
    },
  };
}
