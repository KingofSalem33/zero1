/**
 * Network science helpers for gravity-based graph expansion.
 *
 * These helpers are intentionally defensive: if the tables are missing or empty,
 * they fall back to safe defaults so the map still renders.
 */

import { supabase } from "../db";

export interface ChiasmStructure {
  id: number;
  centerId?: number;
  verseIds: number[];
  mapping: Record<string, number>;
  confidence?: number;
  type?: string;
}

export interface MirrorPair {
  leftId: number;
  rightId: number;
  leftLabel: string;
  rightLabel: string;
}

const DEFAULT_CENTRALITY = 0.1;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeLabel = (label: string): string =>
  label.trim().replace(/[’′]/g, "'"); // Normalize alternate apostrophes.

const parseMapping = (raw: unknown): Record<string, number> => {
  if (!raw || typeof raw !== "object") return {};
  const mapping: Record<string, number> = {};

  Object.entries(raw as Record<string, unknown>).forEach(([label, value]) => {
    const normalized = normalizeLabel(label);
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseInt(value, 10)
          : NaN;

    if (Number.isFinite(parsed)) {
      mapping[normalized] = parsed;
    }
  });

  return mapping;
};

const parseVerseIds = (
  raw: unknown,
  mapping: Record<string, number>,
): number[] => {
  if (Array.isArray(raw)) {
    return raw.filter((value) => Number.isFinite(value)) as number[];
  }
  return Object.values(mapping).filter((value) => Number.isFinite(value));
};

export async function fetchCentralityScores(
  verseIds: number[],
  fallback: number = DEFAULT_CENTRALITY,
): Promise<Map<number, number>> {
  const scores = new Map<number, number>();
  if (verseIds.length === 0) return scores;

  try {
    const { data, error } = await supabase
      .from("verse_analytics")
      .select("verse_id, centrality_score")
      .in("verse_id", verseIds);

    if (error) {
      console.warn(
        "[Network Science] Centrality lookup failed:",
        error.message,
      );
    } else {
      (data || []).forEach((row) => {
        const score =
          typeof row.centrality_score === "number"
            ? clamp(row.centrality_score, 0, 1)
            : fallback;
        scores.set(row.verse_id, score);
      });
    }
  } catch (error) {
    console.warn("[Network Science] Centrality lookup error:", error);
  }

  verseIds.forEach((id) => {
    if (!scores.has(id)) {
      scores.set(id, fallback);
    }
  });

  return scores;
}

export async function fetchChiasmStructureForVerse(
  verseId: number,
): Promise<ChiasmStructure | null> {
  try {
    const baseSelect =
      "id, structure_type, center_verse_id, verse_ids, json_mapping, confidence";

    const { data: centerData, error: centerError } = await supabase
      .from("literary_structures")
      .select(baseSelect)
      .eq("center_verse_id", verseId)
      .limit(1);

    if (centerError) {
      console.warn(
        "[Network Science] Chiasm center lookup failed:",
        centerError.message,
      );
    }

    const row = centerData?.[0];
    if (row) {
      const mapping = parseMapping(row.json_mapping);
      return {
        id: row.id,
        centerId: row.center_verse_id ?? undefined,
        verseIds: parseVerseIds(row.verse_ids, mapping),
        mapping,
        confidence: row.confidence ?? undefined,
        type: row.structure_type ?? undefined,
      };
    }

    const { data: memberData, error: memberError } = await supabase
      .from("literary_structures")
      .select(baseSelect)
      .contains("verse_ids", [verseId])
      .limit(1);

    if (memberError) {
      console.warn(
        "[Network Science] Chiasm membership lookup failed:",
        memberError.message,
      );
    }

    const memberRow = memberData?.[0];
    if (!memberRow) return null;

    const mapping = parseMapping(memberRow.json_mapping);
    return {
      id: memberRow.id,
      centerId: memberRow.center_verse_id ?? undefined,
      verseIds: parseVerseIds(memberRow.verse_ids, mapping),
      mapping,
      confidence: memberRow.confidence ?? undefined,
      type: memberRow.structure_type ?? undefined,
    };
  } catch (error) {
    console.warn("[Network Science] Chiasm lookup error:", error);
    return null;
  }
}

export function getChiasmLabel(
  verseId: number,
  structure: ChiasmStructure,
): string | null {
  for (const [label, id] of Object.entries(structure.mapping)) {
    if (id === verseId) {
      return normalizeLabel(label);
    }
  }
  return null;
}

export function buildMirrorPairs(structure: ChiasmStructure): MirrorPair[] {
  const normalized = new Map<string, number>();
  Object.entries(structure.mapping).forEach(([label, id]) => {
    normalized.set(normalizeLabel(label), id);
  });

  const pairs: MirrorPair[] = [];

  normalized.forEach((id, label) => {
    if (label.endsWith("'")) return;
    const mirrorLabel = `${label}'`;
    const mirrorId = normalized.get(mirrorLabel);
    if (!mirrorId) return;
    pairs.push({
      leftId: id,
      rightId: mirrorId,
      leftLabel: label,
      rightLabel: mirrorLabel,
    });
  });

  return pairs;
}

export function buildMirrorLookup(
  structure: ChiasmStructure,
): Map<number, { id: number; label: string; mirrorLabel: string }> {
  const pairs = buildMirrorPairs(structure);
  const mirrorMap = new Map<
    number,
    { id: number; label: string; mirrorLabel: string }
  >();

  pairs.forEach((pair) => {
    mirrorMap.set(pair.leftId, {
      id: pair.rightId,
      label: pair.leftLabel,
      mirrorLabel: pair.rightLabel,
    });
    mirrorMap.set(pair.rightId, {
      id: pair.leftId,
      label: pair.rightLabel,
      mirrorLabel: pair.leftLabel,
    });
  });

  return mirrorMap;
}
