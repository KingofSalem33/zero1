import type { VisualContextBundle } from "../types/goldenThread";

export const MAP_SESSION_UPDATED_EVENT = "map-session-updated";
const MAP_SESSION_STORAGE_KEY = "lastMapSession";

export interface StoredMapSession {
  bundle: VisualContextBundle;
  anchorLabel: string;
  verseCount: number;
  updatedAt: number;
}

const buildAnchorLabel = (bundle: VisualContextBundle) => {
  const anchor = bundle.nodes?.find((node) => node.id === bundle.rootId);
  if (!anchor) return "Anchor verse";
  return `${anchor.book_name} ${anchor.chapter}:${anchor.verse}`;
};

export const storeMapSession = (bundle: VisualContextBundle) => {
  if (!bundle?.nodes?.length) return;
  try {
    const payload: StoredMapSession = {
      bundle,
      anchorLabel: buildAnchorLabel(bundle),
      verseCount: bundle.nodes.length,
      updatedAt: Date.now(),
    };
    localStorage.setItem(MAP_SESSION_STORAGE_KEY, JSON.stringify(payload));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new window.CustomEvent(MAP_SESSION_UPDATED_EVENT));
    }
  } catch {
    // Ignore storage failures
  }
};

export const getStoredMapSession = (): StoredMapSession | null => {
  try {
    const raw = localStorage.getItem(MAP_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMapSession;
    if (!parsed?.bundle?.nodes?.length) return null;
    return parsed;
  } catch {
    return null;
  }
};
