export {
  buildSupabaseAuthOptions,
  type SupabaseBrowserClientOptions,
} from "./auth/buildSupabaseAuthOptions";
export { createSupabaseBrowserClient } from "./auth/createSupabaseBrowserClient";
export { createAuthFetch } from "./auth/createAuthFetch";
export {
  attachTokenRefreshObserver,
  type TokenRefreshSnapshot,
} from "./auth/attachTokenRefreshObserver";
export {
  createProtectedApiClient,
  type Bookmark,
  type Highlight,
  type LibraryBundleCreateResult,
  type LibraryConnection,
  type LibraryConnectionCreatePayload,
  type LibraryConnectionMutationResult,
  type LibraryConnectionUpdatePayload,
  type LibraryMap,
  type LibraryMapCreatePayload,
  type LibraryMapMutationResult,
  type LibraryMapUpdatePayload,
} from "./api/createProtectedApiClient";
export { SharedAuthProbeView } from "./ui/SharedAuthProbeView";
