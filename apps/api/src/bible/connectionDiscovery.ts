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
 * Priority: anchor + spine + centrality, cap at limit
 */
export function selectCoreVerses(
  bundle: VisualContextBundle,
  limit: number = 12,
): ThreadNode[] {
  const { nodes, edges } = bundle;

  // If total nodes <= limit, analyze all
  if (nodes.length <= limit) {
    console.log(
      `[Connection Discovery] Analyzing all ${nodes.length} verses (under limit)`,
    );
    return nodes;
  }

  console.log(
    `[Connection Discovery] Selecting top ${limit} from ${nodes.length} verses`,
  );

  const selected = new Set<number>();

  // 1. Always include anchor (depth 0)
  const anchor = nodes.find((n) => n.depth === 0);
  if (anchor) {
    selected.add(anchor.id);
    console.log(`[Connection Discovery] Added anchor: ${anchor.id}`);
  }

  // 2. Include all spine nodes
  const spineNodes = nodes.filter((n) => n.isSpine && !selected.has(n.id));
  spineNodes.forEach((n) => selected.add(n.id));
  console.log(`[Connection Discovery] Added ${spineNodes.length} spine nodes`);

  // 3. Calculate centrality (connection count) for remaining nodes
  const centrality = new Map<number, number>();
  nodes.forEach((n) => {
    const connectionCount = edges.filter(
      (e) => e.from === n.id || e.to === n.id,
    ).length;
    centrality.set(n.id, connectionCount);
  });

  // 4. Fill remaining with highest centrality
  const remaining = nodes
    .filter((n) => !selected.has(n.id))
    .sort((a, b) => {
      const aCentrality = centrality.get(a.id) || 0;
      const bCentrality = centrality.get(b.id) || 0;
      return bCentrality - aCentrality;
    })
    .slice(0, limit - selected.size);

  remaining.forEach((n) => selected.add(n.id));
  console.log(
    `[Connection Discovery] Added ${remaining.length} high-centrality nodes`,
  );

  // 5. Ensure at least 1 OT verse if any exist (for cross-testament discovery)
  const isOT = (bookName: string) => {
    const otBooks = [
      "Genesis",
      "Exodus",
      "Leviticus",
      "Numbers",
      "Deuteronomy",
      "Joshua",
      "Judges",
      "Ruth",
      "1 Samuel",
      "2 Samuel",
      "1 Kings",
      "2 Kings",
      "1 Chronicles",
      "2 Chronicles",
      "Ezra",
      "Nehemiah",
      "Esther",
      "Job",
      "Psalms",
      "Proverbs",
      "Ecclesiastes",
      "Song of Solomon",
      "Isaiah",
      "Jeremiah",
      "Lamentations",
      "Ezekiel",
      "Daniel",
      "Hosea",
      "Joel",
      "Amos",
      "Obadiah",
      "Jonah",
      "Micah",
      "Nahum",
      "Habakkuk",
      "Zephaniah",
      "Haggai",
      "Zechariah",
      "Malachi",
    ];
    return otBooks.includes(bookName);
  };

  const selectedNodes = nodes.filter((n) => selected.has(n.id));
  const hasOT = selectedNodes.some((n) => isOT(n.book_name));

  if (!hasOT && selected.size < limit) {
    const otVerse = nodes.find((n) => !selected.has(n.id) && isOT(n.book_name));
    if (otVerse) {
      selected.add(otVerse.id);
      console.log(
        `[Connection Discovery] Added OT verse for cross-testament: ${otVerse.id}`,
      );
    }
  }

  const result = nodes.filter((n) => selected.has(n.id));
  console.log(
    `[Connection Discovery] Final selection: ${result.length} verses`,
  );
  return result;
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
