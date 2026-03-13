import { createProtectedApiClient } from "@zero1/shared-client";
import type {
  LibraryBundleCreateResult,
  LibraryConnection,
  LibraryConnectionCreatePayload,
  LibraryMap,
  LibraryMapCreatePayload,
} from "@zero1/shared-client";
import { authFetch } from "./authFetch";
import { WEB_ENV } from "./env";

const apiClient = createProtectedApiClient({
  apiBaseUrl: WEB_ENV.API_URL,
  authFetch,
});

export async function fetchLibraryConnections(): Promise<LibraryConnection[]> {
  return apiClient.getLibraryConnections();
}

export async function fetchLibraryMaps(): Promise<LibraryMap[]> {
  return apiClient.getLibraryMaps();
}

export async function createLibraryBundle(
  bundle: unknown,
): Promise<LibraryBundleCreateResult> {
  return apiClient.createLibraryBundle(bundle);
}

export async function createLibraryMap(
  payload: LibraryMapCreatePayload,
): Promise<LibraryMap> {
  const result = await apiClient.createLibraryMap(payload);
  return result.map;
}

export async function deleteLibraryMap(id: string): Promise<void> {
  await apiClient.deleteLibraryMap(id);
}

export async function createLibraryConnection(
  payload: LibraryConnectionCreatePayload,
): Promise<LibraryConnection> {
  const result = await apiClient.createLibraryConnection(payload);
  return result.connection;
}

export async function updateLibraryConnection(
  id: string,
  payload: { note?: string; tags?: string[] },
): Promise<LibraryConnection> {
  return apiClient.updateLibraryConnection(id, payload);
}

export async function deleteLibraryConnection(id: string): Promise<void> {
  await apiClient.deleteLibraryConnection(id);
}
