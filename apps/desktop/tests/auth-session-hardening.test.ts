import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachTokenRefreshObserver,
  buildSupabaseAuthOptions,
} from "@zero1/shared-client";
import { createDesktopAuthStorage } from "../src/lib/desktopAuthStorage";

describe("desktop auth session hardening", () => {
  it("enables persistent session + auto refresh in shared auth options", () => {
    const options = buildSupabaseAuthOptions();
    expect(options.persistSession).toBe(true);
    expect(options.autoRefreshToken).toBe(true);
    expect(options.detectSessionInUrl).toBe(true);
  });

  it("uses secure desktop bridge storage when available", async () => {
    const backingStore = new Map<string, string>();
    const bridge = {
      getItem: vi.fn(async (key: string) => backingStore.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        backingStore.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        backingStore.delete(key);
      }),
      isSecurePersistence: vi.fn(async () => true),
    };

    const authStorage = createDesktopAuthStorage(bridge);
    expect(authStorage.mode).toBe("secure_bridge");
    expect(await authStorage.isSecurePersistence()).toBe(true);

    await authStorage.storage.setItem("token", "abc123");
    await expect(authStorage.storage.getItem("token")).resolves.toBe("abc123");
    await authStorage.storage.removeItem("token");
    await expect(authStorage.storage.getItem("token")).resolves.toBeNull();
  });

  it("falls back to local storage adapter when secure bridge is unavailable", async () => {
    const backingStore = new Map<string, string>();
    const fallbackStorage = {
      getItem: (key: string) => backingStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backingStore.set(key, value);
      },
      removeItem: (key: string) => {
        backingStore.delete(key);
      },
    };

    const authStorage = createDesktopAuthStorage(undefined, fallbackStorage);
    expect(authStorage.mode).toBe("insecure_fallback");
    expect(await authStorage.isSecurePersistence()).toBe(false);

    await authStorage.storage.setItem("session", "xyz");
    await expect(authStorage.storage.getItem("session")).resolves.toBe("xyz");
  });

  it("captures TOKEN_REFRESHED events only", () => {
    const callbacks: Array<
      (event: string, session: { access_token?: string; expires_at?: number }) => void
    > = [];
    const unsubscribe = vi.fn();

    const mockSupabase = {
      auth: {
        onAuthStateChange: (
          callback: (
            event: string,
            session: { access_token?: string; expires_at?: number },
          ) => void,
        ) => {
          callbacks.push(callback);
          return { data: { subscription: { unsubscribe } } };
        },
      },
    } as unknown as SupabaseClient;

    const snapshots: Array<{ refreshedAtIso: string; expiresAt: number | null }> =
      [];
    const detach = attachTokenRefreshObserver(mockSupabase, (snapshot) => {
      snapshots.push(snapshot);
    });

    callbacks[0]("SIGNED_IN", { access_token: "a", expires_at: 100 });
    callbacks[0]("TOKEN_REFRESHED", { access_token: "b", expires_at: 200 });
    callbacks[0]("TOKEN_REFRESHED", { expires_at: 300 });

    expect(snapshots.length).toBe(1);
    expect(snapshots[0].expiresAt).toBe(200);

    detach();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
