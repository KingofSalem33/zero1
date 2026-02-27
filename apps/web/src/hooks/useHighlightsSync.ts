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

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import {
  createProtectedApiClient,
  type Highlight as SharedHighlight,
} from "@zero1/shared-client";
import { buildHighlightReferenceLabel } from "@zero1/shared";
import { useAuth } from "../contexts/AuthContext";
import type { BibleHighlight } from "../contexts/BibleHighlightsContext";

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

function toSharedHighlight(highlight: BibleHighlight): SharedHighlight {
  const verses = Array.from(new Set(highlight.verses)).sort((a, b) => a - b);
  const createdAt = highlight.createdAt;
  const updatedAt =
    (highlight as SyncableHighlight).updated_at ?? highlight.createdAt;

  return {
    id: highlight.id,
    book: highlight.book,
    chapter: highlight.chapter,
    verses,
    text: highlight.text,
    color: highlight.color,
    note: highlight.note,
    createdAt,
    updatedAt,
    referenceLabel: buildHighlightReferenceLabel(
      highlight.book,
      highlight.chapter,
      verses,
    ),
  };
}

function toBibleHighlight(highlight: SharedHighlight): BibleHighlight {
  return {
    id: highlight.id,
    book: highlight.book,
    chapter: highlight.chapter,
    verses: highlight.verses,
    text: highlight.text,
    color: highlight.color,
    note: highlight.note,
    createdAt: highlight.createdAt ?? new Date().toISOString(),
  };
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
  const authFetch = useCallback(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const token = await getAccessToken();
      const headers = new globalThis.Headers(init?.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(input, {
        ...init,
        headers,
      });
    },
    [getAccessToken],
  );
  const apiClient = useMemo(
    () =>
      createProtectedApiClient({
        apiBaseUrl: WEB_ENV.API_URL,
        authFetch,
      }),
    [authFetch],
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

    const serialized = JSON.stringify(highlights);
    if (serialized === lastPushedRef.current) return;

    isSyncingRef.current = true;
    setStatus("syncing");

    try {
      const lastSynced = localStorage.getItem(LAST_SYNCED_KEY);
      const synced = await apiClient.syncHighlights({
        highlights: highlights.map((item) => toSharedHighlight(item)),
        lastSyncedAt: lastSynced,
      });

      const merged = mergeServerHighlights(highlights, synced);
      setHighlights(merged);
      lastPushedRef.current = JSON.stringify(merged);

      const syncedAt = new Date().toISOString();
      localStorage.setItem(LAST_SYNCED_KEY, syncedAt);
      setLastSyncedAt(syncedAt);

      setStatus("synced");
    } catch (error) {
      console.warn("[HighlightsSync] Push error:", error);
      setStatus("error");
    } finally {
      isSyncingRef.current = false;
    }
  }, [user, highlights, apiClient, setHighlights]);

  // Pull from cloud on login
  const pullFromCloud = useCallback(async () => {
    if (!user) return;

    setStatus("syncing");

    try {
      const cloudHighlights = await apiClient.getHighlights();
      const merged = mergeServerHighlights(highlights, cloudHighlights);
      setHighlights(merged);
      lastPushedRef.current = JSON.stringify(merged);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNCED_KEY, now);
      setLastSyncedAt(now);

      setStatus("synced");
    } catch (error) {
      console.warn("[HighlightsSync] Pull error:", error);
      setStatus("error");
    }
  }, [user, highlights, apiClient, setHighlights]);

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
  server: SharedHighlight[],
): BibleHighlight[] {
  const localMap = new Map(local.map((h) => [h.id, h]));
  const merged = new Map(local.map((h) => [h.id, h]));

  for (const sh of server) {
    const id = sh.id;
    const localH = localMap.get(id);
    const serverHighlight = toBibleHighlight(sh);

    if (!localH) {
      merged.set(id, serverHighlight);
    } else {
      const localTime = new Date(
        (localH as SyncableHighlight).updated_at || localH.createdAt,
      ).getTime();
      const serverTime = new Date(sh.updatedAt || sh.createdAt || 0).getTime();

      if (serverTime > localTime) {
        merged.set(id, serverHighlight);
      }
    }
  }

  return Array.from(merged.values());
}
