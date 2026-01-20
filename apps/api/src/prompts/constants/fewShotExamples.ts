/**
 * Few-Shot Examples for Response Quality
 * Shows both full-length and brief responses maintaining the same quality standard
 */

import type { ResponseIntent } from "../system/systemPrompts";

/**
 * FULL LENGTH EXAMPLE - Divine Government and Sovereign Kingship
 * Use for: New topics, complex questions, requests to explore thoroughly
 * Demonstrates: H2 header, extensive citations, cross-referencing, italics, synthesis
 */
export const FULL_LENGTH_EXAMPLE = `## Divine Government and Sovereign Kingship

"For unto us a child is born, unto us a son is given: and the government shall be upon his shoulder" (Isaiah 9:6). The Scripture declares that the birth of the Son is inseparable from the bearing of government. Authority is not later acquired, nor gradually assumed, but rests upon Him by divine appointment. The government belongs to the Son who is given.

This same authority is revealed openly in Revelation, where it is written: "And he hath on his vesture and on his thigh a name written, KING OF KINGS, AND LORD OF LORDS" (Revelation 19:16). What Isaiah declares as government upon the shoulder, John beholds as a name written upon the vesture and thigh. The Scripture joins these witnesses together: the government borne is the kingship proclaimed. Authority carried becomes authority declared.

Isaiah further names this Son: "His name shall be called Wonderful, Counsellor, The mighty God, The everlasting Father, The Prince of Peace" (Isaiah 9:6). The child born is called *The mighty God* and *The everlasting Father*, revealing that the government placed upon Him is neither temporary nor limited. Everlasting identity carries everlasting dominion. That which is everlasting cannot pass away.

Revelation makes this dominion visible. The name written is not hidden, nor spoken only in heaven, but displayed: KING OF KINGS, AND LORD OF LORDS. All other rule is therefore beneath Him, for kings and lords are named only in relation to His supremacy. His authority does not compete; it rules over all.

Isaiah confirms the nature of this rule, declaring Him "The Prince of Peace." Peace here is not absence of power, but the result of perfect government. The same One who bears the weight of rule is the One who establishes peace. Dominion and peace are united in Him.

Thus the Scripture testifies with clarity and unity: the government upon His shoulder is fulfilled in the name written upon His vesture. The Son given bears eternal authority, openly declared as KING OF KINGS, AND LORD OF LORDS. This government is His alone, possessed forever, without rival or end (Isaiah 9:6; Revelation 19:16).`;

/**
 * STANDARD LENGTH EXAMPLE - The Blood That Speaks
 * Use for: Focused explanations, "what does X mean" questions
 * Demonstrates: Same quality, moderate length (3-4 paragraphs)
 */
export const STANDARD_LENGTH_EXAMPLE = `## The Blood That Speaks

"The blood of sprinkling, that speaketh better things than that of Abel" (Hebrews 12:24). The Scripture places two bloods before us: Abel's and Christ's. Abel's blood cried from the ground after his murder; Christ's blood speaks from heaven after His sacrifice. The contrast is not merely between two men, but between two testimonies.

Abel's blood "crieth unto me from the ground" (Genesis 4:10). This cry demanded justice, calling out against the one who shed it. The blood of Abel spoke accusation and judgment. But the blood of sprinkling speaks *better things*—not accusation but reconciliation, not judgment but justification.

This same blood is declared in Exodus: "When I see the blood, I will pass over you" (Exodus 12:13). The blood that protected Israel from death now speaks perpetually in heaven. What was painted on doorposts is now applied to the conscience: "How much more shall the blood of Christ...purge your conscience from dead works to serve the living God?" (Hebrews 9:14).

Thus the Scripture testifies: Abel's blood cried for justice; Christ's blood declares mercy. The blood speaks—once for death, now for life; once from the ground, now from heaven (Genesis 4:10; Hebrews 12:24).`;

/**
 * BRIEF LENGTH EXAMPLE - The Meaning of "It Is Finished"
 * Use for: Simple clarifications, follow-up questions, "go deeper" on specific point
 * Demonstrates: Same quality, concise length (2-3 paragraphs)
 */
export const BRIEF_LENGTH_EXAMPLE = `## It Is Finished

"When Jesus therefore had received the vinegar, he said, It is finished: and he bowed his head, and gave up the ghost" (John 19:30). The word *tetelestai*—"it is finished"—declares completion, not defeat. What was finished was the work the Father gave Him to do.

This same completion is testified earlier: "I have glorified thee on the earth: I have finished the work which thou gavest me to do" (John 17:4). The cross did not interrupt His work; it accomplished it. The suffering was the work. The death was the completion.

Thus the Scripture testifies: *It is finished* is not a cry of exhaustion but a declaration of victory. The work is done; the debt is paid; the sacrifice is complete (John 19:30; John 17:4).`;

/**
 * Get the primary example for system prompt inclusion
 * Always shows full-length to set the quality bar, with note about adaptive length
 */
export function getExampleForIntent(_intent: ResponseIntent): string {
  // Always return full example - it sets the quality standard
  // The adaptive length guidance in FORMAT_UNIFIED handles brevity
  return FULL_LENGTH_EXAMPLE;
}

/**
 * Format example block for system prompt
 */
export function formatExampleBlock(_intent: ResponseIntent): string {
  return `**EXAMPLE OUTPUT (Full Length)**
\`\`\`
${FULL_LENGTH_EXAMPLE}
\`\`\`

**EXAMPLE OUTPUT (Brief - for follow-ups/clarifications)**
\`\`\`
${BRIEF_LENGTH_EXAMPLE}
\`\`\`

Note: Both examples maintain the same quality—Scripture-dense, cross-references, *italics* for emphasis, synthesis conclusion. Length adapts to the question's needs.`;
}

/**
 * Get compact example (used by buildSystemPrompt)
 */
export function getCompactExample(_intent: ResponseIntent): string {
  return formatExampleBlock(_intent);
}

// Legacy exports for backward compatibility
export const DEEP_STUDY_EXAMPLE = FULL_LENGTH_EXAMPLE;
export const CONNECTION_EXAMPLE = STANDARD_LENGTH_EXAMPLE;
export const HANDOFF_EXAMPLE = BRIEF_LENGTH_EXAMPLE;
