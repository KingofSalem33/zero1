import { WEB_ENV } from "../lib/env";
/**
 * useHighlightsSync â€” offline-first sync engine for Bible highlights.
 *
 * Strategy:
 * - localStorage is always the source of truth for immediate reads
 * - When authenticated, syncs to cloud on changes (debounced)
 * - On login, merges cloud â†’ local using last-write-wins
 * - Tracks `updated_at` per highlight for conflict resolution
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { BibleHighlight } from "../contexts/BibleHighlightsContext";

const API_URL = WEB_ENV.API_URL;
const SYNC_DEBOUNCE_MS = 3000;
const LAST_SYNCED_KEY = "bible_highlights_last_synced";

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

interface SyncableHighlight extends BibleHighlight {
  updated_at?: string;
}

export interface HighlightsSyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
}

export function useHighlightsSync(
  highlights: BibleHighlight[],
  setHighlights: (highlights: BibleHighlight[]) => void,
  isLoaded: boolean,
): HighlightsSyncState {
  const { user, getAccessToken } = useAuth();
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);
  const lastPushedRef = useRef<string>("");
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    localStorage.getItem(LAST_SYNCED_KEY),
  );

  // Clear synced flash after 3s
  useEffect(() => {
    if (status === "synced") {
      const t = setTimeout(() => setStatus("idle"), 3000);
      return () => clearTimeout(t);
    }
  }, [status]);

  // Push local highlights to cloud
  const pushToCloud = useCallback(async () => {
    if (!user || isSyncingRef.current) return;

    const token = await getAccessToken();
    if (!token) return;

    const serialized = JSON.stringify(highlights);
    if (serialized === lastPushedRef.current) return;

    isSyncingRef.current = true;
    setStatus("syncing");

    try {
      const lastSynced = localStorage.getItem(LAST_SYNCED_KEY);

      const payload = {
        highlights: highlights.map((h) => ({
          ...h,
          created_at: h.createdAt,
          updated_at: (h as SyncableHighlight).updated_at || h.createdAt,
        })),
        last_synced_at: lastSynced,
      };

      const response = await fetch(`${API_URL}/api/highlights/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn("[HighlightsSync] Push failed:", response.status);
        setStatus("error");
        return;
      }

      const data = await response.json();

      if (data.highlights && Array.isArray(data.highlights)) {
        const merged = mergeServerHighlights(highlights, data.highlights);
        setHighlights(merged);
        lastPushedRef.current = JSON.stringify(merged);
      }

      if (data.synced_at) {
        localStorage.setItem(LAST_SYNCED_KEY, data.synced_at);
        setLastSyncedAt(data.synced_at);
      }

      setStatus("synced");
    } catch (error) {
      console.warn("[HighlightsSync] Push error:", error);
      setStatus("error");
    } finally {
      isSyncingRef.current = false;
    }
  }, [user, highlights, getAccessToken, setHighlights]);

  // Pull from cloud on login
  const pullFromCloud = useCallback(async () => {
    if (!user) return;

    const token = await getAccessToken();
    if (!token) return;

    setStatus("syncing");

    try {
      const response = await fetch(`${API_URL}/api/highlights`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      const data = await response.json();
      if (data.highlights && Array.isArray(data.highlights)) {
        const merged = mergeServerHighlights(highlights, data.highlights);
        setHighlights(merged);
        lastPushedRef.current = JSON.stringify(merged);
        const now = new Date().toISOString();
        localStorage.setItem(LAST_SYNCED_KEY, now);
        setLastSyncedAt(now);
      }
      setStatus("synced");
    } catch (error) {
      console.warn("[HighlightsSync] Pull error:", error);
      setStatus("error");
    }
  }, [user, highlights, getAccessToken, setHighlights]);

  // Set offline status when not authenticated
  useEffect(() => {
    if (!user && isLoaded) {
      setStatus("offline");
    }
  }, [user, isLoaded]);

  // Pull on login
  useEffect(() => {
    if (user && isLoaded) {
      pullFromCloud();
    }
  }, [user?.id, isLoaded]);

  // Debounced push on changes
  useEffect(() => {
    if (!user || !isLoaded) return;

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = setTimeout(() => {
      pushToCloud();
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, [user, highlights, isLoaded, pushToCloud]);

  return { status, lastSyncedAt };
}

/**
 * Merge server highlights into local highlights using last-write-wins.
 */
function mergeServerHighlights(
  local: BibleHighlight[],
  server: Record<string, unknown>[],
): BibleHighlight[] {
  const localMap = new Map(local.map((h) => [h.id, h]));
  const merged = new Map(local.map((h) => [h.id, h]));

  for (const sh of server) {
    const id = sh.id as string;
    const localH = localMap.get(id);

    const serverHighlight: BibleHighlight = {
      id,
      book: sh.book as string,
      chapter: sh.chapter as number,
      verses: sh.verses as number[],
      text: sh.text as string,
      color: sh.color as string,
      note: (sh.note as string) || undefined,
      createdAt: (sh.created_at as string) || new Date().toISOString(),
    };

    if (!localH) {
      merged.set(id, serverHighlight);
    } else {
      const localTime = new Date(
        (localH as SyncableHighlight).updated_at || localH.createdAt,
      ).getTime();
      const serverTime = new Date(
        (sh.updated_at as string) || (sh.created_at as string) || 0,
      ).getTime();

      if (serverTime > localTime) {
        merged.set(id, serverHighlight);
      }
    }
  }

  return Array.from(merged.values());
}


