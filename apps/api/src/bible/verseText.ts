import { getVerse } from "./bibleService";

type VerseLike = {
  id?: number;
  book_name: string;
  chapter: number;
  verse: number;
  text?: string | null;
};

const buildKey = (verse: VerseLike): string => {
  if (Number.isFinite(verse.id)) {
    return `id:${verse.id}`;
  }
  return `${verse.book_name}|${verse.chapter}|${verse.verse}`;
};

export async function ensureVersesHaveText<T extends VerseLike>(
  verses: T[],
  context: string,
): Promise<T[]> {
  const missing = verses.filter(
    (verse) => !verse.text || verse.text.trim().length === 0,
  );

  if (missing.length === 0) {
    return verses;
  }

  const replacements = await Promise.all(
    missing.map(async (verse) => {
      const fallback = await getVerse({
        book: verse.book_name,
        chapter: verse.chapter,
        verse: verse.verse,
      });
      const fallbackText = fallback?.text;
      if (!fallbackText || fallbackText.trim().length === 0) {
        throw new Error(
          `[Verse Text] Missing text for ${verse.book_name} ${verse.chapter}:${verse.verse} (${context})`,
        );
      }
      return { key: buildKey(verse), text: fallbackText };
    }),
  );

  const replacementMap = new Map(
    replacements.map((replacement) => [replacement.key, replacement.text]),
  );

  return verses.map((verse) => {
    if (verse.text && verse.text.trim().length > 0) {
      return verse;
    }
    const replacementText = replacementMap.get(buildKey(verse));
    if (!replacementText) {
      return verse;
    }
    return { ...verse, text: replacementText };
  });
}
