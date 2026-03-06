const LOST_CONTEXT_MAX_WORDS = 34;
const LOST_CONTEXT_MAX_SENTENCES = 2;

export { LOST_CONTEXT_MAX_WORDS, LOST_CONTEXT_MAX_SENTENCES };

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

export function chunkLostContext(
  text: string,
  maxWords: number = LOST_CONTEXT_MAX_WORDS,
  maxSentences: number = LOST_CONTEXT_MAX_SENTENCES,
): string[] {
  if (!text.trim()) return [];
  const sentences = splitIntoSentences(text);

  if (sentences.length === 1) {
    const words = sentences[0].split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return [sentences[0]];

    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += maxWords) {
      chunks.push(words.slice(i, i + maxWords).join(" ").trim());
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).filter(Boolean);
    const nextCount = wordCount + sentenceWords.length;
    const exceeds =
      current.length >= maxSentences ||
      (nextCount > maxWords && current.length > 0);

    if (exceeds) {
      chunks.push(current.join(" ").trim());
      current = [];
      wordCount = 0;
    }

    current.push(sentence);
    wordCount += sentenceWords.length;
  }

  if (current.length > 0) {
    chunks.push(current.join(" ").trim());
  }

  return chunks;
}
