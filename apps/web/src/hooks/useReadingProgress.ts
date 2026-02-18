import { useState, useCallback } from "react";

const STORAGE_KEY = "bible-reading-progress";

/** Map of book name → last-read chapter number */
type ProgressMap = Record<string, number>;

function load(): ProgressMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function save(map: ProgressMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function useReadingProgress() {
  const [progress, setProgress] = useState<ProgressMap>(load);

  const updateProgress = useCallback((book: string, chapter: number) => {
    setProgress((prev) => {
      const next = { ...prev, [book]: chapter };
      save(next);
      return next;
    });
  }, []);

  const getLastChapter = useCallback(
    (book: string): number | undefined => progress[book],
    [progress],
  );

  return { progress, updateProgress, getLastChapter };
}
