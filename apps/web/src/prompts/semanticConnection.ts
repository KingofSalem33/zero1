type VerseExcerpt = {
  reference: string;
  text: string;
};

export type GoDeeperPromptInput = {
  fromVerse: VerseExcerpt;
  toVerse: VerseExcerpt;
  connectionLabel: string;
  synopsis: string;
  topicVerses?: VerseExcerpt[];
  topicHints?: string[];
  connectionExplanation?: string;
};

export const buildGoDeeperPrompt = ({
  fromVerse,
  toVerse,
  connectionLabel,
  synopsis,
  topicVerses = [],
  topicHints = [],
  connectionExplanation,
}: GoDeeperPromptInput): string => {
  return `TASK: Provide an exegetical explanation of the current topic connection.

=== THE DATA ===
[SOURCE ANCHOR]
${fromVerse.reference}: "${fromVerse.text}"

[TARGET CONNECTION]
${toVerse.reference}: "${toVerse.text}"

[METADATA]
- Type: ${connectionLabel}
- Previous Synopsis: "${synopsis}"
${connectionExplanation ? `\n[CONNECTION LOGIC]\n${connectionExplanation}` : ""}
${topicVerses.length > 0 ? "\n[TOPIC VERSES]\n" : ""}${topicVerses
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
Using ONLY the KJV text above, write in compiler mode.
Movement must come from sequence, contrast, repetition of exact words, or canon movement. Do not add explanation.

Allowed witness structures (choose one):
A) Convergence: Verse A clause; Verse B clause; Verse C clause; final clause.
B) Call -> Answer: Scripture question clause; answer clause; repeated answer clause; final clause.
C) Beginning -> End: Genesis clause; Gospel clause; Epistle clause; final clause.

Rules:
1) Every sentence MUST include a short quoted clause (<= 8 words) from the provided verses.
2) No sentence may contain interpretation without a quoted clause.
3) Do not repeat a verse unless you use a different clause from it.
4) Use as many verses as needed, not all. Do not repeat the synopsis.
5) Do not add any forward carry, invitation, or question.
6) End with a final clause and reference (no summary sentence).
7) Openings may be a direct clause, a Scripture question clause, or "The Scripture declares..."
8) Use minimal connectors only (and, but, for, yet, again). Avoid explanatory connectors (thus, therefore, by this).
Write in your Scripture-governed voice, restrained and declarative.`;
};

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
