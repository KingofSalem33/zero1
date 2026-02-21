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
- Supabase client wired for mobile session persistence:
  - AsyncStorage-backed auth state
  - `detectSessionInUrl: false`
- Mobile auth shell supports:
  - email/password sign-in
  - magic link request
  - sign out
  - protected API probe against bookmarks/highlights/library

## Next implementation stages

1. Provider expansion

- Add `@react-native-google-signin/google-signin` flow.
- Add Sign in with Apple (`expo-apple-authentication`).
- Keep email/password and magic-link fallback.

2. Deep-link callback handling

- Use Expo Linking for `zero1://auth/callback`.
- Configure Supabase auth redirect URLs for Expo dev + production schemes.

3. Shared session model parity

- Keep single `auth.users` identity across desktop/web/mobile.
- Ensure mobile bearer token is accepted by API RLS-protected routes.

4. UX hardening

- Add auth loading state and recoverable error messaging.
- Add explicit "session restored" probe on app cold start.

5. Security hardening

- Evaluate SecureStore-backed token envelope for higher-assurance local storage.
- Confirm no service-role key usage in mobile runtime.
