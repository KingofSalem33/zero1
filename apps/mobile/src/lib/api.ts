interface ProtectedProbeOptions {
  apiBaseUrl: string;
  accessToken: string;
}

interface BookmarkResponse {
  bookmarks: unknown[];
}

interface HighlightResponse {
  highlights: unknown[];
}

interface LibraryConnectionResponse {
  connections: unknown[];
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
