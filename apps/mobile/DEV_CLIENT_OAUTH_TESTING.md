# Mobile Dev Client OAuth Testing

Use this flow to validate Google/Apple auth callbacks (`zero1://auth/callback`) reliably on a real device.

## Why this exists

Expo Go and browser/web preview are not reliable for custom app-scheme OAuth redirects.
Use an Expo development build (dev client) instead.

## Preconditions

- `apps/mobile/.env` exists with real values
- Supabase provider config is saved (Google now; Apple later after approval)
- Supabase redirect allowlist includes `zero1://**`
- Google OAuth redirect URI includes:
  - `https://ciuxquemfnbruvvzbfth.supabase.co/auth/v1/callback`

## One-time setup

1. Login to Expo/EAS

```bash
cd apps/mobile
npm run eas:login
```

2. Link/create the Expo project when prompted

```bash
npm run eas:init
```

## Build iOS dev client (recommended for OAuth testing)

```bash
npm run eas:build:ios:dev
```

- Install the build on your iPhone from the EAS build link.
- This build supports your custom scheme (`zero1://`) callback.

## Start Metro for dev client

From repo root:

```bash
npm --prefix apps/mobile run start:dev-client
```

If Expo needs internet metadata and fails in your environment, remove `--offline` from the script temporarily.

## Test flow (Google)

1. Open the dev client on device.
2. Tap `Google`.
3. Complete account selection in browser.
4. Confirm you return to the app via `zero1://auth/callback`.
5. App should show `Signed in as ...`
6. Tap `Run Protected Probe` and confirm success.

## Test flow (Apple)

1. Tap `Apple`.
2. Complete Apple account sign-in and consent.
3. Confirm you return to the app via `zero1://auth/callback`.
4. App should show `Signed in as ...`
5. Tap `Run Protected Probe` and confirm success.

## Expected temporary behavior

- Apple button may be disabled until `EXPO_PUBLIC_ENABLE_APPLE_OAUTH=true`.
- Minimal blue/gray UI is expected (foundation auth shell only).

## If callback still hangs

- Confirm Supabase Google provider has both Client ID and Client Secret.
- Confirm `zero1://**` is in Supabase redirect allowlist.
- Confirm you are testing in dev client, not Expo Go or web preview.
- Confirm `apps/mobile/app.json` still has `"scheme": "zero1"`.
