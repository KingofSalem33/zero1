import { useState, useCallback } from "react";

export interface BibleNote {
  key: string; // "Book:Chapter:Verse"
  text: string;
  updatedAt: string;
}

const STORAGE_KEY = "bible-notes";

function loadNotes(): Record<string, BibleNote> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveNotes(notes: Record<string, BibleNote>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function makeKey(book: string, chapter: number, verse: number): string {
  return `${book}:${chapter}:${verse}`;
}

export function useBibleNotes() {
  const [notes, setNotes] = useState<Record<string, BibleNote>>(loadNotes);

  const getNote = useCallback(
    (book: string, chapter: number, verse: number): BibleNote | undefined => {
      return notes[makeKey(book, chapter, verse)];
    },
    [notes],
  );

  const setNote = useCallback(
    (book: string, chapter: number, verse: number, text: string) => {
      setNotes((prev) => {
        const key = makeKey(book, chapter, verse);
        if (!text.trim()) {
          // Remove empty notes
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _, ...rest } = prev;
          saveNotes(rest);
          return rest;
        }
        const next = {
          ...prev,
          [key]: {
            key,
            text: text.trim(),
            updatedAt: new Date().toISOString(),
          },
        };
        saveNotes(next);
        return next;
      });
    },
    [],
  );

  const hasNote = useCallback(
    (book: string, chapter: number, verse: number): boolean => {
      return !!notes[makeKey(book, chapter, verse)]?.text;
    },
    [notes],
  );

  const allNotes = useCallback(() => {
    return Object.values(notes).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [notes]);

  return { getNote, setNote, hasNote, allNotes };
}
