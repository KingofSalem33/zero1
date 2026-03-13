import {
  createProtectedApiClient,
  type Bookmark,
  type Highlight,
  type LibraryConnection,
} from "@zero1/shared-client";
import { authFetch } from "./authFetch";
import { DESKTOP_ENV } from "./env";

const protectedApiClient = createProtectedApiClient({
  apiBaseUrl: DESKTOP_ENV.API_URL,
  authFetch,
});

export { type Bookmark, type Highlight, type LibraryConnection };
export const getBookmarks = protectedApiClient.getBookmarks;
export const getHighlights = protectedApiClient.getHighlights;
export const getLibraryConnections = protectedApiClient.getLibraryConnections;
