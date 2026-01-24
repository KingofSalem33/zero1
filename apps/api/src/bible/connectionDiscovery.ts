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
  type: "TYPOLOGY" | "FULFILLMENT" | "CONTRAST" | "PROGRESSION" | "PATTERN";
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
- TYPOLOGY: Shadow → substance patterns (e.g., Abraham sacrificing Isaac → God sacrificing Jesus)
- FULFILLMENT: Prophecy → event (e.g., "scepter from Judah" → Jesus born in Judea)
- CONTRAST: Inversion or opposition (e.g., First Adam brought death → Last Adam brought life)
- PROGRESSION: Covenant or doctrinal development across verses
- PATTERN: Structural, numerical, or chiastic patterns

Return ALL connections with confidence >0.85.

For each connection, provide:
{
  "from": 1,  // verse number (1-${verses.length})
  "to": 12,
  "type": "FULFILLMENT",  // Must be one of: TYPOLOGY, FULFILLMENT, CONTRAST, PROGRESSION, PATTERN
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
          content:
            "You are a biblical scholar analyzing theological connections between verses. Focus on typology, fulfillment, and structural patterns that lexical similarity cannot capture. Return your response in JSON format.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      {
        model: ENV.OPENAI_SMART_MODEL,
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
      ENV.OPENAI_SMART_MODEL,
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
