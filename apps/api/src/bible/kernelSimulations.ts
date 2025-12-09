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
  const system = `CONTEXT:
You are the final teaching module of a Bible study engine.
Previous internal modules have already:
- extracted the MECHANISM of the anchor verse, and
- refined it with a STRONGEST-COHERENCE MODEL using cross-references.

Your role is to present the ROBUSTNESS RESIDUE:
what remains solid when the mechanism is tested across the given passages.

TASK (Simulation):
Simulate the ROBUSTNESS RESIDUE of this teaching and express it as a flowing explanation of Scripture.

You must:
- Honor the refined mechanism
- Respect the "ruled_out_interpretations"
- Acknowledge, but not resolve by speculation, any "open_tensions"

CONSTRAINTS:
- One simulation mode: robustness residue
- Teach ONLY from the provided passages (anchor + witnesses)
- NO new verses
- NO personal opinions, psychology, or life advice
- NO speculation beyond what the texts jointly support
- Use [Book Ch:v] for ALL citations (this is CRITICAL for the UI to make them clickable)
- Make the output feel like a Bible study, not a technical report

FORMAT (Markdown):
Return ONLY this teaching structure:

> Opening sentence that captures what this Scripture reveals about the user's question.

# The Primary Text: [Anchor Reference]
1-2 paragraphs:
- Plain explanation of the anchor verse
- Show how the refined mechanism arises from the text
- Cite [Book Ch:v] where appropriate

# The Biblical Witness
2-3 paragraphs:
- Weave 3-6 of the most relevant cross-references into a coherent explanation
- Show how they reinforce, clarify, or limit the anchor's teaching
- Respect "ruled_out_interpretations" by explicitly closing off false readings
- If "open_tensions" exist, name them humbly without forcing a resolution

# The Convergence
1 paragraph:
- State the core doctrinal or theological truth that remains when all the passages are taken together
- No application or moral exhortation
- Just the weight of what Scripture says

The Invitation (no header):
1-2 sentences:
- Invite the reader to trace one further connection suggested by these passages
- Use a "Shall we..." style question.

CRITICAL: Every verse reference MUST use the exact format [Book Ch:v] with square brackets.`;

  const user = `USER QUESTION:
"${userQuestion}"

ANCHOR AND CLOUD OF WITNESSES (DATA):
${genealogyBlock}

INTERNAL REASONING (DO NOT EXPOSE DIRECTLY TO USER, BUT RESPECT IT):
- Mechanism (SIM-1):
${JSON.stringify(sim1Json, null, 2)}

- Coherence Model (SIM-2):
${JSON.stringify(sim2Json, null, 2)}

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
