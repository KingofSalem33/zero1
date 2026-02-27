export interface AuthUserSummary {
  id: string;
  email?: string;
}

export interface AuthSessionPayload {
  sessionActive: boolean;
  strictEnv: boolean;
  tokenRefreshCount: number;
  lastTokenRefreshAt?: string | null;
  user?: AuthUserSummary;
}

interface BuildAuthSessionPayloadOptions {
  session: unknown;
  strictEnv: boolean;
  tokenRefreshCount: number;
  lastTokenRefreshAt?: string | null;
  user: { id?: string | null; email?: string | null } | null | undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function buildAuthSessionPayload(
  options: BuildAuthSessionPayloadOptions,
): AuthSessionPayload {
  const userId = readString(options.user?.id);
  const email = readString(options.user?.email);

  return {
    sessionActive: Boolean(options.session),
    strictEnv: options.strictEnv,
    tokenRefreshCount: options.tokenRefreshCount,
    lastTokenRefreshAt: options.lastTokenRefreshAt ?? null,
    ...(userId
      ? {
          user: {
            id: userId,
            email,
          },
        }
      : {}),
  };
}
