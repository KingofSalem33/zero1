import type { SupabaseClient } from "@supabase/supabase-js";

export interface TokenRefreshSnapshot {
  refreshedAtIso: string;
  expiresAt: number | null;
}

export function attachTokenRefreshObserver(
  supabase: SupabaseClient,
  onRefresh: (snapshot: TokenRefreshSnapshot) => void,
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event !== "TOKEN_REFRESHED" || !session?.access_token) {
      return;
    }

    onRefresh({
      refreshedAtIso: new Date().toISOString(),
      expiresAt: session.expires_at ?? null,
    });
  });

  return () => {
    subscription.unsubscribe();
  };
}
