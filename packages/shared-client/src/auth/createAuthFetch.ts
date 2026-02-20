import type { SupabaseClient } from "@supabase/supabase-js";

export function createAuthFetch(supabase: SupabaseClient) {
  return async function authFetch(
    input: string | URL | Request,
    init: RequestInit = {},
  ): Promise<Response> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Authentication required");
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${session.access_token}`);

    return fetch(input, {
      ...init,
      headers,
    });
  };
}
