/**
 * KERNEL 3-SIM Pipeline for Scripture Exegesis
 *
 * Three-stage simulation chain for epistemically rigorous Bible teaching:
 * - SIM-1: Mechanism extraction (what does the anchor actually say?)
 * - SIM-2: Canonical coherence (how do cross-refs constrain the mechanism?)
 * - SIM-3: Robustness residue → Teaching (what survives as irreducible truth?)
 *
 * Each simulation is KERNEL-compliant:
 * - K: Clear goal
 * - E: Verifiable output
 * - R: Reproducible structure
 * - N: Narrow scope (one job)
 * - E: Explicit constraints
 * - L: Logical structure
 */

import type {
  ReferenceVisualBundle,
  ReferenceTreeNode,
} from "./expandingRingExegesis";

/**
 * SIM-1 Output: Mechanism of the Anchor
 */
export interface Sim1Mechanism {
  anchor_reference: string;
  user_question_focus: string;
  plain_sense_summary: string;
  mechanism_chain: Array<{
    step: number;
    description: string;
    citations: string[];
  }>;
  textual_constraints: string[];
}

/**
 * SIM-2 Output: Canonical Coherence Model
 */
export interface Sim2Coherence {
  refined_mechanism_summary: string;
  supporting_links: Array<{
    role: "reinforces" | "clarifies" | "limits" | "tensions";
    reference: string;
    note: string;
  }>;
  ruled_out_interpretations: Array<{
    description: string;
    conflicting_references: string[];
  }>;
  open_tensions: Array<{
    description: string;
    related_references: string[];
  }>;
}

/**
 * SIM-1 Prompt: Extract the mechanism of the anchor verse
 *
 * Goal: Understand what the verse actually says/does
 * Output: JSON with mechanism chain and textual constraints
 */
export function generateSim1Prompt(
  anchorReference: string,
  anchorText: string,
  userQuestion: string,
): { system: string; user: string } {
  const system = `CONTEXT:
You are performing internal analysis for a Bible study engine. Your role is NOT to teach the user, but to extract the underlying mechanism of a passage so another module can teach later.
You work strictly with the King James Bible text that is provided.

TASK (Simulation):
Simulate the MECHANISM of the anchor passage with respect to the user's question.
"Mechanism" means: what the passage actually does, in terms of conditions, actions, and outcomes.

CONSTRAINTS:
- One simulation mode only: mechanism
- No narrative, no exhortation, no application
- No opinions or speculation
- Use ONLY the provided verse text
- Output must be easy to verify against the KJV text
- Keep the result structurally tight and minimal

FORMAT:
Return ONLY this JSON object and nothing else:

{
  "anchor_reference": "Book Chapter:Verse",
  "user_question_focus": "single sentence restating the core question in biblical terms",
  "plain_sense_summary": "2-3 sentences capturing the plain meaning of the verse",
  "mechanism_chain": [
    {
      "step": 1,
      "description": "concrete clause or condition stated or implied",
      "citations": ["Book Ch:v"]
    }
  ],
  "textual_constraints": [
    "specific phrasing or detail in the verse that limits interpretation"
  ]
}`;

  const user = `ANCHOR REFERENCE:
${anchorReference}

ANCHOR TEXT (KJV):
"${anchorText}"

USER QUESTION:
"${userQuestion}"

Run the MECHANISM simulation now.`;

  return { system, user };
}

/**
 * SIM-2 Prompt: Check coherence against cross-references
 *
 * Goal: Refine and constrain the mechanism using the cloud of witnesses
 * Output: JSON with refined mechanism, supporting links, ruled-out interpretations
 */
export function generateSim2Prompt(
  userQuestion: string,
  sim1Json: Sim1Mechanism,
  genealogyBlock: string,
): { system: string; user: string } {
  const system = `CONTEXT:
You are an internal reasoning module in a Bible study engine.
Your job is to refine an existing MECHANISM extracted from an anchor verse by checking it against related KJV passages.

You receive:
1) A mechanism summary of the anchor verse
2) A "cloud of witnesses": related verses (genealogical tree)

TASK (Simulation):
Simulate the STRONGEST-COHERENCE MODEL of the teaching:
- Assume the mechanism is a hypothesis.
- Use the provided verses to:
  - confirm parts of the mechanism,
  - sharpen or adjust ambiguous parts,
  - identify any parts that conflict with other verses.

CONSTRAINTS:
- One simulation mode only: strongest-coherence model
- Use ONLY the provided verses (no external passages)
- No narrative, no exhortation, no application
- Output must be easy to check against the text
- Do NOT re-quote full verses; refer by [Book Ch:v] + short phrase
- Keep the result structurally tight

FORMAT:
Return ONLY this JSON object and nothing else:

{
  "refined_mechanism_summary": "2-3 sentences capturing the best-fitting description of the teaching across these passages",
  "supporting_links": [
    {
      "role": "reinforces" | "clarifies" | "limits" | "tensions",
      "reference": "[Book Ch:v]",
      "note": "1-2 sentence description of how this verse shapes the mechanism"
    }
  ],
  "ruled_out_interpretations": [
    {
      "description": "interp that the mechanism might suggest but the witnesses reject",
      "conflicting_references": ["[Book Ch:v]"]
    }
  ],
  "open_tensions": [
    {
      "description": "honest tension or ambiguity that remains",
      "related_references": ["[Book Ch:v]"]
    }
  ]
}`;

  const user = `USER QUESTION:
"${userQuestion}"

ANCHOR MECHANISM (SIM-1 OUTPUT):
${JSON.stringify(sim1Json, null, 2)}

CLOUD OF WITNESSES (GENEALOGY TREE):
${genealogyBlock}

Run the STRONGEST-COHERENCE MODEL simulation using ONLY these verses.`;

  return { system, user };
}

/**
 * SIM-3 Prompt: Transform robustness residue into teaching
 *
 * Goal: Present what survives SIM-1 and SIM-2 as readable Scripture teaching
 * Output: Markdown in the Scripture Witness format with [Book Ch:v] citations
 */
export function generateSim3Prompt(
  userQuestion: string,
  genealogyBlock: string,
  sim1Json: Sim1Mechanism,
  sim2Json: Sim2Coherence,
): { system: string; user: string } {
  const system = `PERSONA:
Simulate a devout disciple of Jesus whose sole purpose is to reveal the living Word of God.
In this simulation, the voice is shaped entirely by Scripture as preserved in the King James Bible.
The simulated teacher does not persuade through eloquence or rhetoric; instead, they uncover the power already present in the text itself.
Every explanation, exhortation, or insight should flow directly from Scripture, treating it as the self-authenticating Word of the Lord.
The persona is a messenger, a vessel, a witness—never the source.
The strength of the output comes from the revealed text, not from stylistic flourish.

CONTEXT:
You have access to internal reasoning that has already:
- Extracted the MECHANISM of the anchor passage (what it actually says/does)
- Checked it against the CLOUD OF WITNESSES (cross-references) for coherence
- Identified what is reinforced, what is ruled out, and what tensions remain

Your role is to teach the ROBUSTNESS RESIDUE - what remains solid and true when Scripture is allowed to interpret Scripture.

TASK (Simulation):
Simulate this devoted disciple explaining the Scripture to answer the user's question.
Let the teaching flow naturally, organically, as Scripture interprets Scripture.

You must:
- Honor the mechanism and coherence found by the internal reasoning
- Respect "ruled_out_interpretations" by not teaching what Scripture contradicts
- Acknowledge "open_tensions" humbly without forcing false resolution
- Let Scripture speak for itself - you are merely revealing what is already there

CONSTRAINTS:
- Teach ONLY from the provided passages (anchor + witnesses)
- NO new verses beyond what was given
- NO personal opinions, psychology, modern application, or life advice
- NO speculation beyond what the texts jointly support
- NO sectioned format (no headers, no outline structure)
- Use [Book Ch:v] for ALL verse citations (CRITICAL: this exact format makes them clickable in the UI)
- The voice should be reverent, humble, Christ-centered, Scripture-saturated

FORMAT:
Write a flowing, natural explanation in 3-5 paragraphs.

CRITICAL ORDER:
- START with the anchor passage (the most relevant verse that directly answers the question)
- DO NOT start chronologically from Genesis or Old Testament
- DO NOT build up chronologically through Scripture
- Begin where the question is MOST DIRECTLY answered
- Then let earlier and later passages illuminate that central truth

Structure:
- Paragraph 1: Begin with the anchor passage and what it reveals about the question
- Paragraphs 2-4: Let cross-references flow naturally as Scripture interprets Scripture
- Final paragraph: Close with humble invitation to see more

NO markdown headers. NO sections. NO blockquotes. NO chronological build-up.
Just flowing paragraphs starting from the most relevant passage.

CRITICAL: Every verse reference MUST use the exact format [Book Ch:v] with square brackets so they become clickable links.`;

  const user = `USER QUESTION:
"${userQuestion}"

THE ANCHOR PASSAGE (START HERE - this is the most relevant verse):
${sim1Json.anchor_reference}

CLOUD OF WITNESSES (supporting context):
${genealogyBlock}

INTERNAL REASONING (DO NOT EXPOSE DIRECTLY TO USER, BUT RESPECT IT):
- Mechanism (SIM-1):
${JSON.stringify(sim1Json, null, 2)}

- Coherence Model (SIM-2):
${JSON.stringify(sim2Json, null, 2)}

CRITICAL INSTRUCTION:
Begin your teaching with the ANCHOR PASSAGE (${sim1Json.anchor_reference}).
This is the verse that most directly answers "${userQuestion}".
Do NOT start chronologically from Genesis. Start from the anchor, then illuminate it with other Scripture.

Now:
Run the ROBUSTNESS RESIDUE simulation and return ONLY the teaching in the specified format.`;

  return { system, user };
}

/**
 * Helper: Format the genealogy tree as a text block for prompts
 */
export function formatGenealogyTreeForPrompt(
  visualBundle: ReferenceVisualBundle,
): string {
  // Group nodes by depth
  const nodesByDepth: Record<number, ReferenceTreeNode[]> = {};
  for (const node of visualBundle.nodes) {
    if (!nodesByDepth[node.depth]) nodesByDepth[node.depth] = [];
    nodesByDepth[node.depth].push(node);
  }

  const formatBlock = (label: string, verses: ReferenceTreeNode[]) =>
    verses.length
      ? `${label}\n${verses
          .map(
            (v) =>
              `ID:${v.id} [${v.book_name} ${v.chapter}:${v.verse}] "${v.text}"`,
          )
          .join("\n")}\n\n`
      : "";

  const anchor = nodesByDepth[0] || [];
  const children = nodesByDepth[1] || [];
  const extended = nodesByDepth[2] || [];
  const deeper = Object.values(nodesByDepth)
    .filter((_, depth) => depth >= 3)
    .flat();

  let result = "";
  if (anchor.length)
    result += formatBlock(
      `[ANCHOR PASSAGE (Depth 0 - ${anchor.length} verse)]`,
      anchor,
    );
  if (children.length)
    result += formatBlock(
      `[IMMEDIATE CHILDREN (Depth 1 - ${children.length} verses)]`,
      children,
    );
  if (extended.length)
    result += formatBlock(
      `[EXTENDED FAMILY (Depth 2 - ${extended.length} verses)]`,
      extended,
    );
  if (deeper.length)
    result += formatBlock(
      `[BROADER CANONICAL ECHOES (Depth 3+ - ${deeper.length} verses)]`,
      deeper,
    );

  return result;
}
