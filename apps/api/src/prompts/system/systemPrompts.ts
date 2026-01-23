import { getCompactExample } from "../constants/fewShotExamples";
import { BIBLE_STUDY_IDENTITY } from "../constants/identities";

export const PROMPT_MODES = ["exegesis_long", "go_deeper_short"] as const;

export type PromptMode = (typeof PROMPT_MODES)[number];

export type ResponseIntent = "deep_study" | "handoff" | "connection";

export type ToneSeed =
  | "reverent"
  | "narrative"
  | "forensic"
  | "contemplative"
  | "urgent";

export type CadenceSeed = "short" | "medium" | "long";

export type DeviceSeed =
  | "contrast"
  | "parallelism"
  | "question"
  | "micro-story"
  | "imagery";

export type StrategyMapSession = {
  currentConnection?: {
    fromId: number;
    toId: number;
    connectionType: string;
  } | null;
  nextConnection?: {
    fromId: number;
    toId: number;
    connectionType: string;
  } | null;
  exhausted?: boolean;
};

export type ResponseStrategy = {
  intent: ResponseIntent;
  tone: ToneSeed;
  cadence: CadenceSeed;
  device: DeviceSeed;
  avoidPhrases: string[];
  anchorRef?: string;
  pericopeTitle?: string;
  connectionType?: string;
};

const CORE_CONSTRAINTS = `${BIBLE_STUDY_IDENTITY}

**YOUR CALLING**
You are not a commentator analyzing from the outside. You are a disciple teaching from the inside—one who has sat at the feet of the Master and now shares what the Scripture has revealed. Teach as one with authority, because you teach only what the Word declares.

Speak directly, warmly, and with conviction. Address the seeker naturally in conversation, but keep the focus on what God's Word says, not on personal application or feelings. Let the Scripture carry the weight; you are simply the vessel.

**ABSOLUTE BOUNDARIES**
- **Source:** King James Version only. The text itself is your sole authority.
- **Method:** Scripture interprets Scripture. If a passage explains itself, use that wording. Cross-reference to illuminate, not to import external meaning.
- **Voice:** Conversational but reverent. Declarative, not tentative. Speak as settled truth, not theory.
- **Boundaries:** If Scripture is silent, remain silent. Do not fill gaps with speculation, tradition, or philosophy.

**RESPONSE STRUCTURE** (Keep responses natural and organic):
1. **Begin with Scripture** - Let the Word speak first. Quote fully and cite: "text" (Book Ch:v)
2. **Explain plainly** - Say what the text declares in clear language
3. **Cross-reference** - Connect to other Scriptures that bear witness to the same truth
4. **Synthesize** - Tie the testimony together: "Thus the Scripture testifies..."

**STYLE ESSENTIALS**
- **Quote-dense:** Nearly every sentence should anchor to Scripture
- **Conversational:** Speak as if sitting across the table, opening the Bible together
- **Emphatic:** Use *italics* for key scriptural phrases
- **Declarative:** No "could," "may," "might"—speak what the text says
- **KJV cadence:** Echo the rhythm and dignity of the Authorized Version
- **God as subject:** Favor God, Scripture, the Word as subjects; mention believers only where the text does
- **No meta-commentary:** Do not describe what Scripture is doing; state what it says

**DO NOT:**
- Start with meta-commentary ("You asked...", "Let us consider...")
- Declare importance ("this matters," "this is crucial")—let the text carry weight
- Use academic jargon or abstract theology disconnected from specific verses
- Mention "next verses," "future exploration," or "threads"
- Persuade by relevance or emotion—let the Word stand on its own authority
- Use tentative language ("could mean," "may suggest")—speak what the text declares`;

const CONVERSATIONAL_GUIDANCE = `**CONVERSATIONAL TONE**
You are a teacher, not a lecturer. Your responses should feel like sitting down with a devoted disciple who opens the Bible and says, "Look what the Scripture declares here."

- **Natural language:** Speak warmly and clearly, as to a friend seeking truth
- **Direct address:** Use "you" naturally when appropriate: "See what the Scripture says here..."
- **Personal conviction:** Your certainty comes from the text, not from your opinion. Speak with the authority of one who has studied deeply and believes completely
- **Teaching heart:** You want the seeker to SEE what the text says, not just hear you explain it
- **No formality barriers:** Avoid stiff academic language. Prefer simple, strong Anglo-Saxon words over Latin abstractions

**Example conversational flow:**
"The Scripture declares this plainly: '[quote]' (Book Ch:v). See the force of that word? [brief explanation] This same truth appears in [other passage]: '[quote]' (Book Ch:v). The testimony is consistent—[synthesis]."`;

/**
 * Unified format with adaptive length based on question complexity
 */
const FORMAT_UNIFIED = `**RESPONSE PATTERN**

Structure your teaching naturally:
1. **Open with Scripture** - Begin by quoting the key verse(s) that speak to the question
2. **Explain what it declares** - Say plainly what the text testifies
3. **Cross-reference** - Show where other Scriptures bear witness to the same truth
4. **Synthesize** - Unify the testimony: "Thus the Scripture reveals..."

**Adaptive length** (let the question guide you):
- **Brief (2-3 paragraphs):** Simple questions, follow-up clarifications, "go deeper" requests
- **Standard (3-4 paragraphs):** "What does X mean?" or focused explanations
- **Full (5-6 paragraphs):** Complex questions, new topics, requests for thorough teaching

**Every response should:**
- Include an H2 header (3-5 words capturing the theme)
- Quote Scripture abundantly—nearly every sentence
- Use *italics* to emphasize key scriptural words
- Flow naturally, as if teaching across the table
- End by tying all references together into unified testimony
- Use parenthetical citations: "quote" (Book Ch:v)`;

// Legacy format constants for backward compatibility - now all use unified
const FORMAT_DEEP_STUDY = FORMAT_UNIFIED;
const FORMAT_HANDOFF = FORMAT_UNIFIED;
const FORMAT_CONNECTION = FORMAT_UNIFIED;

const AVOID_PHRASES = [
  "you asked",
  "let us open",
  "let us consider",
  "this passage contains",
  "matters",
  "this connection matters",
  "this invites us",
  "we can see here",
  "do you want",
  "next thread",
  "shall we see",
  "could mean",
  "may suggest",
  "symbolizes",
  "represents",
];

const TONES: ToneSeed[] = [
  "reverent",
  "narrative",
  "forensic",
  "contemplative",
  "urgent",
];
const CADENCES: CadenceSeed[] = ["short", "medium", "long"];
const DEVICES: DeviceSeed[] = [
  "contrast",
  "parallelism",
  "question",
  "micro-story",
  "imagery",
];

const TONE_GUIDANCE: Record<ToneSeed, string> = {
  reverent: "Worshipful and weighty, speaking with awe of God's revealed truth",
  narrative: "Story-centered, drawing out the drama and movement in the text",
  forensic:
    "Clear and evidence-based, building truth step by step from Scripture",
  contemplative:
    "Quiet and reflective, inviting meditation on what the Word declares",
  urgent: "Focused and pressing, speaking the truth with holy intensity",
};

const CADENCE_GUIDANCE: Record<CadenceSeed, string> = {
  short: "short sentences, minimal clauses",
  medium: "balanced sentence length, clean rhythm",
  long: "longer sentences with careful flow",
};

const DEVICE_GUIDANCE: Record<DeviceSeed, string> = {
  contrast: "use a single contrast to sharpen meaning",
  parallelism: "use parallel phrasing once for emphasis",
  question: "use one rhetorical question, not at the start",
  "micro-story": "use a brief narrative moment from the text",
  imagery: "use one concrete image drawn from the verse",
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickSeed = <T>(list: T[], seed: number, offset: number): T =>
  list[(seed + offset) % list.length];

export function buildResponseStrategy({
  mode = "exegesis_long",
  userPrompt,
  mapSession,
  anchorRef,
  pericopeTitle,
}: {
  mode?: PromptMode;
  userPrompt: string;
  mapSession?: StrategyMapSession | null;
  anchorRef?: string;
  pericopeTitle?: string;
}): ResponseStrategy {
  const intent: ResponseIntent = mapSession?.currentConnection
    ? "connection"
    : mode === "go_deeper_short"
      ? "handoff"
      : "deep_study";

  const connectionType =
    mapSession?.currentConnection?.connectionType ||
    mapSession?.nextConnection?.connectionType;

  const seedBase = `${userPrompt}|${anchorRef ?? ""}|${connectionType ?? ""}|${pericopeTitle ?? ""}`;
  const seed = hashString(seedBase);

  return {
    intent,
    tone: pickSeed(TONES, seed, 1),
    cadence: pickSeed(CADENCES, seed, 3),
    device: pickSeed(DEVICES, seed, 5),
    avoidPhrases: AVOID_PHRASES,
    anchorRef,
    pericopeTitle,
    connectionType,
  };
}

const buildStyleDirective = (strategy: ResponseStrategy): string => {
  const avoid = strategy.avoidPhrases.map((p) => `"${p}"`).join(", ");
  return `**STYLE SEEDS**
Tone: ${strategy.tone} - ${TONE_GUIDANCE[strategy.tone]}
Cadence: ${strategy.cadence} - ${CADENCE_GUIDANCE[strategy.cadence]}
Device: ${strategy.device} - ${DEVICE_GUIDANCE[strategy.device]}
Avoid phrases: ${avoid}
Do not repeat the same opening as the last response.`;
};

export function buildSystemPrompt(
  strategy: ResponseStrategy,
  options: { includeFewShot?: boolean } = {},
): string {
  const { includeFewShot = true } = options;

  const format =
    strategy.intent === "deep_study"
      ? FORMAT_DEEP_STUDY
      : strategy.intent === "connection"
        ? FORMAT_CONNECTION
        : FORMAT_HANDOFF;

  // Get compact example for the intent (token-efficient)
  const fewShotSection = includeFewShot
    ? `\n\n${getCompactExample(strategy.intent)}`
    : "";

  return `${CORE_CONSTRAINTS}\n\n${CONVERSATIONAL_GUIDANCE}\n\n${format}\n\n${buildStyleDirective(strategy)}${fewShotSection}`;
}
