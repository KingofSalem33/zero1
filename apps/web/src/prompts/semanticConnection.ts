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
  pericopeContext?: {
    title: string;
    summary: string;
    rangeRef: string;
    themes?: string[];
  };
};

export const buildGoDeeperPrompt = ({
  fromVerse,
  toVerse,
  connectionLabel,
  synopsis,
  nextCandidates = [],
  topicHints = [],
  pericopeContext,
}: GoDeeperPromptInput): string => {
  const storyContext = pericopeContext
    ? `\n[STORY CONTEXT]\n${pericopeContext.title} (${pericopeContext.rangeRef})\nSummary: ${pericopeContext.summary}\n${
        pericopeContext.themes?.length
          ? `Themes: ${pericopeContext.themes.join(", ")}`
          : ""
      }`
    : "";

  return `TASK: Reveal why this connection matters and create irresistible momentum toward the next step.

=== THE DATA ===
[SOURCE ANCHOR]
${fromVerse.reference}: "${fromVerse.text}"

[TARGET CONNECTION]
${toVerse.reference}: "${toVerse.text}"

[METADATA]
- Type: ${connectionLabel}
- Previous Synopsis: "${synopsis}"
${storyContext}
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
Using the KJV text above and the synopsis as foundation, explain the theological weight of this connection—why it matters to the life of faith. Do not repeat the synopsis. Dig deeper. Show what's at stake.

Then provide a simple, clean follow-up invitation:
1. If NEXT NODES are provided, scan them and choose the most intellectually honest and theologically compelling connection
2. If TOPIC SIGNALS are provided, use the strongest signal to guide your choice
3. Write ONE sentence stating where this thread continues in Scripture - name the specific connection (word, theme, or concept) and the next passage using [Book Ch:v] format
4. Then invite them to continue with a creative, varied question. NEVER use the same phrasing repeatedly. Mix it up naturally:
   - "Shall we see how it unfolds there?"
   - "Ready to trace it further?"
   - "Want to go there?"
   - "Should we follow that thread?"
   - "Care to explore that next?"

Example closings (vary these!):
- "Scripture pulls this thread to its climax in [Hebrews 10:23]. Shall we see how it unfolds there?"
- "This same pattern appears in [Romans 8:31]. Ready to trace it further?"
- "The full weight of this truth lands in [John 15:13]. Want to go there?"

Keep it professional, warm, and inviting with creative variety. No dramatic language, no pressure—just a genuine invitation to continue the journey.`;
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
