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
  topicVerses = [],
  topicHints = [],
  connectionExplanation,
}: GoDeeperPromptInput): string => {
  return `TASK: Write an expository teaching on the connection between these verses.

=== THE VERSES ===
[PRIMARY ANCHOR]
${fromVerse.reference}: "${fromVerse.text}"

[CONNECTED VERSE]
${toVerse.reference}: "${toVerse.text}"

[CONNECTION TYPE]
${connectionLabel}
${connectionExplanation ? `\n[CONNECTION INSIGHT]\n${connectionExplanation}` : ""}
${topicVerses.length > 0 ? "\n[SUPPORTING VERSES]\n" : ""}${topicVerses
    .map(
      (verse) =>
        `- [${verse.reference}] "${verse.text.slice(0, 220)}${
          verse.text.length > 220 ? "..." : ""
        }"`,
    )
    .join(
      "\n",
    )}${topicHints.length > 0 ? "\n\n[THEMATIC THREADS]\n" : ""}${topicHints
    .map((hint) => `- ${hint}`)
    .join("\n")}

=== INSTRUCTION ===
Write a Scripture-governed exposition (5-6 paragraphs) where the Word interprets itself.

CORE PRINCIPLE:
Let Scripture carry the weight. Your role is to set the verses beside one another and let them speak. Commentary should be minimal—one or two sentences between quotes, stating plainly what the text declares. Do not layer theological explanation on top. Do not analyze from outside. Let the Word testify.

VOICE AND STYLE:
- Open each paragraph with the Scripture itself, quoted fully: "text here" (Book Ch:v)
- Follow with brief, declarative commentary—what the verse says, not what it means theologically
- Transitions should be short and plain: "This same truth appears in..." / "The LORD further declares..." / "Isaiah speaks again..."
- God, the LORD, the Scripture, the Word as subjects—not "we see" or "this reveals to us"
- KJV diction only. No contractions. Echo the rhythm and weight of the Authorized Version.
- Restrained, not expansive. Every sentence must earn its place.

STRUCTURE:
1. Open by quoting the primary verse fully. Follow with 1-2 sentences stating what it declares.
2. Quote the connected verse fully. Show how it accords with or confirms the first—briefly.
3. If the verse has multiple parts, quote them separately with minimal commentary between.
4. If supporting verses exist, introduce each with a short transition and let it speak.
5. Close with synthesis: "Thus the Scripture speaks with one voice..." Gather what was already quoted—do not add new interpretation.

FORBIDDEN:
- Theological explanation layered on top ("The theological thread that unites these passages is...")
- Meta-commentary ("This declaration does not stand alone, but instead is set within a context of...")
- Reader-focused language ("we see," "this reveals to us," "this invites us")
- Contractions ("it's," "don't," "won't")
- Speculative phrases ("could mean," "may suggest," "perhaps")
- Excessive adjectives and adverbs—let the text's own words provide the weight

The goal: a reader should be able to remove your commentary and still have a coherent chain of Scripture. Your words serve only to join the witnesses together.`;
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
