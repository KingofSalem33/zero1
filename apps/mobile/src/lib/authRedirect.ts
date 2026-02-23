import type { Session } from "@supabase/supabase-js";
import { MOBILE_ENV } from "./env";
import { supabase } from "./supabase";

type AuthRedirectOutcome =
  | { kind: "ignored"; reason: string }
  | { kind: "error"; message: string }
  | { kind: "session"; session: Session | null }
  | { kind: "code"; session: Session | null };

function parseParams(input: string) {
  return new globalThis.URLSearchParams(
    input.replace(/^\?/, "").replace(/^#/, ""),
  );
}

function getAllParams(url: string) {
  const [, query = ""] = url.split("?");
  const queryOnly = query.split("#")[0] || "";
  const [, hash = ""] = url.split("#");
  const params = new globalThis.URLSearchParams();
  for (const [key, value] of parseParams(queryOnly)) {
    params.set(key, value);
  }
  for (const [key, value] of parseParams(hash)) {
    params.set(key, value);
  }
  return params;
}

function looksLikeAuthCallback(url: string): boolean {
  return /auth\/callback/i.test(url);
}

export function getOAuthRedirectUrl(): string {
  return MOBILE_ENV.MAGIC_LINK_REDIRECT_TO || "zero1://auth/callback";
}

export async function handleSupabaseAuthRedirect(
  url: string,
): Promise<AuthRedirectOutcome> {
  if (!looksLikeAuthCallback(url)) {
    return { kind: "ignored", reason: "URL is not an auth callback." };
  }

  const params = getAllParams(url);
  const errorDescription =
    params.get("error_description") || params.get("error");
  if (errorDescription) {
    return { kind: "error", message: errorDescription };
  }

  const authCode = params.get("code");
  if (authCode) {
    const { data, error } =
      await supabase.auth.exchangeCodeForSession(authCode);
    if (error) {
      return { kind: "error", message: error.message };
    }
    return { kind: "code", session: data.session };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return { kind: "error", message: error.message };
    }
    return { kind: "session", session: data.session };
  }

  return {
    kind: "ignored",
    reason: "No auth code or session tokens found in callback URL.",
  };
}
