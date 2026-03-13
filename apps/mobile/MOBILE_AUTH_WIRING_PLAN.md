# Mobile Auth Wiring Plan

## Goal

Ship a production-ready mobile auth stack that reuses current Supabase identity and API authorization model.

## Current foundation (implemented)

- Expo + React Native app scaffolded in `apps/mobile`.
- Env contract added:
  - `EXPO_PUBLIC_API_URL`
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_MAGIC_LINK_REDIRECT_TO`
  - `EXPO_PUBLIC_ENABLE_GOOGLE_OAUTH`
  - `EXPO_PUBLIC_ENABLE_APPLE_OAUTH`
- Supabase client wired for mobile session persistence:
  - AsyncStorage-backed auth state
  - `detectSessionInUrl: false`
- Mobile auth shell supports:
  - email/password sign-in
  - magic link request
  - provider OAuth launch (Google + Apple) via Supabase `signInWithOAuth`
  - deep-link auth callback parsing + session/code exchange
  - sign out
  - protected API probe against bookmarks/highlights/library

## Next implementation stages

1. Provider expansion

- Enable Supabase Google provider in dashboard and test end-to-end callback.
- Enable Supabase Apple provider after Apple Developer approval and test end-to-end callback.
- Keep email/password and magic-link fallback.

2. Deep-link callback validation

- Confirm Supabase redirect allowlist contains `zero1://**`.
- Validate callback handling for `code` exchange (PKCE) and token fragment flows.

3. Shared session model parity

- Keep single `auth.users` identity across desktop/web/mobile.
- Ensure mobile bearer token is accepted by API RLS-protected routes.

4. UX hardening

- Add auth loading state and recoverable error messaging.
- Add explicit "session restored" probe on app cold start.
- Upgrade browser handoff from `Linking.openURL` to `expo-web-browser` auth session for better return UX.

5. Security hardening

- Evaluate SecureStore-backed token envelope for higher-assurance local storage.
- Confirm no service-role key usage in mobile runtime.
