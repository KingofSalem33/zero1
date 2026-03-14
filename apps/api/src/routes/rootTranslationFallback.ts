export interface RootTranslationFallbackDefinition {
  number: string;
  transliteration: string;
  definition: string;
}

export interface RootTranslationFallbackWord {
  english: string;
  strongs: string | null;
}

export function buildRootTranslationFallbackText({
  selectedText,
  language,
  words,
  definitions,
}: {
  selectedText: string;
  language: string;
  words: RootTranslationFallbackWord[];
  definitions: RootTranslationFallbackDefinition[];
}): string {
  const trimmedText = selectedText.trim();
  const uniqueWordTerms = Array.from(
    new Set(
      words
        .filter((word) => Boolean(word.strongs))
        .map((word) => word.english.trim())
        .filter(Boolean),
    ),
  ).slice(0, 4);

  const keyDefinitions = definitions.slice(0, 3).map((entry) => {
    const transliteration = entry.transliteration.trim();
    const definition = entry.definition.trim().replace(/\s+/g, " ");
    const compactDefinition =
      definition.length > 110
        ? `${definition.slice(0, 107).trim()}...`
        : definition;
    return `${entry.number}${transliteration ? ` (${transliteration})` : ""}: ${compactDefinition}`;
  });

  const summaryParts = [
    "Detailed ROOT commentary is temporarily unavailable, but the original-language data for this selection was resolved successfully.",
    trimmedText ? `Selection: "${trimmedText}".` : "",
    language && language !== "unknown" ? `Source language: ${language}.` : "",
    uniqueWordTerms.length > 0
      ? `Key terms: ${uniqueWordTerms.join(", ")}.`
      : "",
    keyDefinitions.length > 0
      ? `Strong's entries: ${keyDefinitions.join(" | ")}`
      : "Strong's entries were found, but no concise lexical summary was available.",
  ];

  return summaryParts.filter(Boolean).join(" ");
}
