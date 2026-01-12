type VerseExcerpt = {
  reference: string;
  text: string;
};

export type GoDeeperPromptInput = {
  fromVerse: VerseExcerpt;
  toVerse: VerseExcerpt;
  connectionLabel: string;
  synopsis: string;
  nextCandidates?: VerseExcerpt[];
  topicHints?: string[];
};

export const buildGoDeeperPrompt = ({
  fromVerse,
  toVerse,
  connectionLabel,
  synopsis,
  nextCandidates = [],
  topicHints = [],
}: GoDeeperPromptInput): string => `TASK: Expound upon the significance of this connection.

=== THE DATA ===
[SOURCE ANCHOR]
${fromVerse.reference}: "${fromVerse.text}"

[TARGET CONNECTION]
${toVerse.reference}: "${toVerse.text}"

[METADATA]
- Type: ${connectionLabel}
- Previous Synopsis: "${synopsis}"
${nextCandidates.length > 0 ? "\n[NEXT NODES]\n" : ""}${nextCandidates
  .map(
    (verse) =>
      `- [${verse.reference}] "${verse.text.slice(0, 220)}${
        verse.text.length > 220 ? "..." : ""
      }"`,
  )
  .join(
    "\n",
  )}${topicHints.length > 0 ? "\n\n[TOPIC SIGNALS]\n" : ""}${topicHints
  .map((hint) => `- ${hint}`)
  .join("\n")}

=== INSTRUCTION ===
Using the KJV text above and the synopsis as a starting point, explain the theological significance of this link to the Christian faith. Do not just repeat the synopsis. Go deeper. Explain why this matters.

Return an H2 header plus one paragraph (<=89 words). End the paragraph with two tight parts: (1) a sentence that states the next connection explicitly (name the thread and the next passage) and (2) a short confirmation question like "Want to explore [Book Ch:v] next?" Avoid quiz tone; do not use "How does/Why does" question forms. If NEXT NODES are provided, choose one and name it in the final question using [Book Ch:v] format. If TOPIC SIGNALS are provided, prefer the strongest signal when selecting the next step. The final question must name the specific thread (word/image/theme) that links to the next passage. The question should feel like a gentle continuation, not an interrogation.`;

export const buildGoDeeperDisplayText = ({
  connectionLabel,
  fromReference,
  toReference,
}: {
  connectionLabel: string;
  fromReference: string;
  toReference: string;
}): string =>
  `Discuss the ${connectionLabel.toLowerCase()} connection between ${fromReference} and ${toReference}.`;
