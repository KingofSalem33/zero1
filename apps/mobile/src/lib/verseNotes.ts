import { resolveBibleBookName, tryParseBookmarkReference } from "@zero1/shared";

export const VERSE_NOTES_STORAGE_KEY = "biblelot:mobile:reader:verse-notes";

export interface VerseNoteRecord {
  text: string;
  updatedAt: string;
}

export type VerseNoteMap = Record<string, VerseNoteRecord>;

export interface VerseNoteItem extends VerseNoteRecord {
  reference: string;
}

export function normalizeVerseNoteReference(reference: string): string | null {
  const parsed = tryParseBookmarkReference(reference);
  if (!parsed || parsed.verse === undefined) return null;
  const canonicalBook = resolveBibleBookName(parsed.book);
  if (!canonicalBook) return null;
  return `${canonicalBook} ${parsed.chapter}:${parsed.verse}`;
}

export function sanitizeVerseNoteMap(raw: unknown): VerseNoteMap {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const fallbackUpdatedAt = new Date().toISOString();
  const next: VerseNoteMap = {};

  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const normalizedKey = normalizeVerseNoteReference(key);
    if (!normalizedKey) return;

    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return;
      next[normalizedKey] = {
        text,
        updatedAt: fallbackUpdatedAt,
      };
      return;
    }

    if (!value || typeof value !== "object") return;
    const candidate = value as Partial<VerseNoteRecord>;
    const text =
      typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (!text) return;
    next[normalizedKey] = {
      text,
      updatedAt:
        typeof candidate.updatedAt === "string" &&
        candidate.updatedAt.trim().length > 0
          ? candidate.updatedAt
          : fallbackUpdatedAt,
    };
  });

  return next;
}

export function upsertVerseNote(
  current: VerseNoteMap,
  reference: string,
  text: string,
): VerseNoteMap {
  const normalizedReference = normalizeVerseNoteReference(reference);
  if (!normalizedReference) return current;

  const trimmed = text.trim();
  if (!trimmed) {
    const { [normalizedReference]: removedValue, ...rest } = current;
    void removedValue;
    return rest;
  }

  return {
    ...current,
    [normalizedReference]: {
      text: trimmed,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function toVerseNoteItems(notes: VerseNoteMap): VerseNoteItem[] {
  return Object.entries(notes)
    .map(([reference, value]) => ({
      reference,
      text: value.text,
      updatedAt: value.updatedAt,
    }))
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
}
