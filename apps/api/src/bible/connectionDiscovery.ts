/**
 * LLM-Based Connection Discovery
 *
 * Uses GPT-4o-mini to find theological connections beyond lexical similarity:
 * - Typology (shadow → substance)
 * - Fulfillment (prophecy → event)
 * - Contrast (inversions, oppositions)
 * - Progression (covenant development)
 * - Pattern (structural, numerical, chiastic)
 */

import { ENV } from "../env";
import { runModel } from "../ai/runModel";
import type { VisualContextBundle, ThreadNode } from "./types";
import { extractTokenUsage, logTokenUsage } from "../utils/telemetry";

export interface DiscoveredConnection {
  from: number; // verse ID
  to: number;
  type:
    | "TYPOLOGY"
    | "FULFILLMENT"
    | "CONTRAST"
    | "PROGRESSION"
    | "PATTERN"
    | "ALLUSION";
  explanation: string;
  confidence: number; // 0.85-1.0
}

interface RawConnection {
  from: number; // verse number (1-indexed)
  to: number;
  type: string;
  explanation: string;
  confidence: number;
}

interface Verse {
  id: number;
  reference: string;
  text: string;
  book: string;
}

/**
 * Select core verses for LLM analysis
 * Strategy: include high-centrality (multi-connection) nodes + all their neighbors.
 */
export function selectCoreVerses(
  bundle: VisualContextBundle,
  limit?: number,
): ThreadNode[] {
  const { nodes, edges } = bundle;

  if (!nodes.length || !edges.length) {
    return nodes.slice(0, limit ?? nodes.length);
  }

  const degreeMap = new Map<number, number>();
  nodes.forEach((node) => degreeMap.set(node.id, 0));
  edges.forEach((edge) => {
    degreeMap.set(edge.from, (degreeMap.get(edge.from) ?? 0) + 1);
    degreeMap.set(edge.to, (degreeMap.get(edge.to) ?? 0) + 1);
  });

  const degrees = Array.from(degreeMap.values()).sort((a, b) => a - b);
  const percentile = (values: number[], pct: number) => {
    if (values.length === 0) return 0;
    const idx = Math.min(
      values.length - 1,
      Math.max(0, Math.floor(pct * (values.length - 1))),
    );
    return values[idx];
  };

  const minDegree = 4;
  const threshold = Math.max(minDegree, percentile(degrees, 0.8));
  const multiConnectionIds = new Set(
    Array.from(degreeMap.entries())
      .filter(([, degree]) => degree >= threshold)
      .map(([id]) => id),
  );

  if (multiConnectionIds.size === 0) {
    const anchor = nodes.find((n) => n.depth === 0);
    return anchor ? [anchor] : nodes.slice(0, limit ?? nodes.length);
  }

  const selected = new Set<number>(multiConnectionIds);
  edges.forEach((edge) => {
    if (multiConnectionIds.has(edge.from) || multiConnectionIds.has(edge.to)) {
      selected.add(edge.from);
      selected.add(edge.to);
    }
  });

  const result = nodes.filter((node) => selected.has(node.id));
  const limited =
    typeof limit === "number" && limit > 0 ? result.slice(0, limit) : result;

  console.log(
    `[Connection Discovery] Multi-connection nodes=${multiConnectionIds.size}, expanded selection=${result.length}`,
  );

  return limited;
}

/**
 * Discover theological connections using LLM
 */
export async function discoverConnections(
  verses: Verse[],
): Promise<DiscoveredConnection[]> {
  if (verses.length === 0) {
    console.log("[Connection Discovery] No verses provided, skipping");
    return [];
  }

  console.log(
    `[Connection Discovery] Analyzing ${verses.length} verses for theological connections`,
  );

  const verseList = verses
    .map((v, i) => `${i + 1}. [${v.reference}] "${v.text}"`)
    .join("\n");

  const prompt = `Analyze these ${verses.length} biblical verses for theological connections beyond lexical similarity.

VERSES:
${verseList}

Find significant connections involving:
- TYPOLOGY: Shadow → substance patterns where the NT explicitly identifies the type-antitype relationship (e.g., Rom 5:14 Adam as type of Christ, Heb 9 tabernacle as type of heavenly things)
- FULFILLMENT: Prophecy → event where the NT explicitly cites or references the OT passage as fulfilled
- ALLUSION: Intentional indirect references that are not direct quotations but clearly echo an earlier text (e.g., Rev 1:14-15 alluding to Dan 7:9-10, John 1:1 alluding to Gen 1:1)
- CONTRAST: Inversion or opposition explicit in the text (e.g., First Adam brought death → Last Adam brought life in Rom 5:12-21)
- PROGRESSION: Covenant or doctrinal development across verses, grounded in both texts
- PATTERN: Structural, numerical, or chiastic patterns with evidence from the text

Return ALL connections with confidence >0.85.

For each connection, provide:
{
  "from": 1,  // verse number (1-${verses.length})
  "to": 12,
  "type": "FULFILLMENT",  // Must be one of: TYPOLOGY, FULFILLMENT, ALLUSION, CONTRAST, PROGRESSION, PATTERN
  "explanation": "Brief explanation (max 2 sentences)",
  "confidence": 0.95  // Between 0.85 and 1.0
}

Return as:
{
  "connections": [ ...array of connections... ]
}`;

  try {
    const result = await runModel(
      [
        {
          role: "system",
          content: `You are a conservative biblical scholar who interprets Scripture by Scripture using the grammatical-historical method. Your task is to identify theological connections between verses. Return your response in JSON format.

METHODOLOGY CONSTRAINTS:
- Ground every connection in what the text actually says. Do not allegorize or spiritualize.
- TYPOLOGY: The type must be historical (not mythological). The New Testament must explicitly or clearly identify the type-antitype relationship (e.g., 1 Cor 10:1-4 identifies the rock as Christ; Heb 9 identifies the tabernacle as a type of heavenly things; Rom 5:14 identifies Adam as a type of Christ). Do NOT create typologies based solely on surface-level resemblance.
- FULFILLMENT: The New Testament must explicitly cite or clearly reference the Old Testament passage as fulfilled (e.g., "that it might be fulfilled which was spoken by the prophet"). Do NOT infer fulfillment from thematic similarity alone.
- CONTRAST: The contrast must be explicit in the text or in how the NT author uses the OT passage (e.g., Romans 5:12-21 explicitly contrasts Adam and Christ). Do NOT generate contrasts from superficial oppositions.
- PROGRESSION: Must show clear doctrinal or covenantal development across the canon, grounded in the text of both passages.
- PATTERN: Must reflect genuine literary or structural patterns (chiasm, inclusio, numerical patterns) with evidence from the text, not imposed from outside.

Only return connections you are confident a careful, text-centered interpreter would affirm.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      {
        model: ENV.OPENAI_FAST_MODEL,
        verbosity: "medium",
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "connection_discovery",
            strict: true,
            schema: {
              type: "object",
              properties: {
                connections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      from: { type: "number" },
                      to: { type: "number" },
                      type: { type: "string" },
                      explanation: { type: "string" },
                      confidence: { type: "number" },
                    },
                    required: [
                      "from",
                      "to",
                      "type",
                      "explanation",
                      "confidence",
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: ["connections"],
              additionalProperties: false,
            },
          },
        },
      },
    );

    if (!result.text) {
      console.error("[Connection Discovery] No response from LLM");
      return [];
    }

    // Log token usage for telemetry
    const tokenUsage = extractTokenUsage(
      result,
      "connectionDiscovery",
      ENV.OPENAI_FAST_MODEL,
      "connection-discovery-v1",
    );
    if (tokenUsage) {
      logTokenUsage(tokenUsage);
    }

    const parsed = JSON.parse(result.text);
    const connections = parsed.connections || [];

    console.log(
      `[Connection Discovery] LLM found ${connections.length} connections`,
    );

    // Map verse numbers back to IDs and validate
    const VALID_TYPES = new Set([
      "TYPOLOGY",
      "FULFILLMENT",
      "ALLUSION",
      "CONTRAST",
      "PROGRESSION",
      "PATTERN",
    ]);

    const discovered: DiscoveredConnection[] = (connections as RawConnection[])
      .filter((conn) => {
        // Validate structure
        if (
          !conn.from ||
          !conn.to ||
          !conn.type ||
          !conn.explanation ||
          !conn.confidence
        ) {
          console.warn(
            "[Connection Discovery] Invalid connection structure:",
            conn,
          );
          return false;
        }

        // Validate type is one of the allowed values
        if (!VALID_TYPES.has(conn.type)) {
          console.warn(
            `[Connection Discovery] Invalid type "${conn.type}", skipping: ${conn.from} → ${conn.to}`,
          );
          return false;
        }

        // Validate confidence threshold
        if (conn.confidence < 0.85) {
          console.log(
            `[Connection Discovery] Skipping low confidence (${conn.confidence}): ${conn.from} → ${conn.to}`,
          );
          return false;
        }

        // Validate verse numbers
        if (
          conn.from < 1 ||
          conn.from > verses.length ||
          conn.to < 1 ||
          conn.to > verses.length
        ) {
          console.warn(
            `[Connection Discovery] Invalid verse numbers: ${conn.from} → ${conn.to}`,
          );
          return false;
        }

        return true;
      })
      .map((conn) => ({
        from: verses[conn.from - 1].id,
        to: verses[conn.to - 1].id,
        type: conn.type as DiscoveredConnection["type"],
        explanation: conn.explanation,
        confidence: conn.confidence,
      }));

    console.log(
      `[Connection Discovery] Validated ${discovered.length} connections`,
    );
    discovered.forEach((conn, i) => {
      console.log(
        `  ${i + 1}. ${conn.type}: ${conn.from} → ${conn.to} (${(conn.confidence * 100).toFixed(0)}%)`,
      );
    });

    return discovered;
  } catch (error) {
    console.error("[Connection Discovery] Error calling LLM:", error);
    return [];
  }
}
