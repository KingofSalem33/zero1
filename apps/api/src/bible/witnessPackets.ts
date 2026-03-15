export interface WitnessPacketVerse {
  id: number;
  reference: string;
  text: string;
  role?: string;
  depth?: number;
  centrality?: number;
  importance?: number;
  rationale?: string;
  pericopeTitle?: string;
  pericopeType?: string;
  pericopeThemes?: string[];
}

export interface WitnessPacket {
  totalWitnesses: number;
  principalWitnessCount: number;
  principalWitnessIds: number[];
  roster: string;
  principalWitnesses: string;
  summary: string;
}

export interface WitnessPacketOptions {
  principalCount?: number;
  rosterExcerptChars?: number;
  principalTextChars?: number;
}

const ROLE_PRIORITY: Record<string, number> = {
  anchor: 4,
  lead: 3,
  paired: 3,
  hub: 2.5,
  bridge: 2,
  principal: 1.5,
  supporting: 0.5,
};

function clampText(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function formatPericopeMeta(verse: WitnessPacketVerse): string | null {
  if (!verse.pericopeTitle) return null;
  const parts = [`section="${verse.pericopeTitle}"`];
  if (verse.pericopeType) {
    parts.push(`type=${verse.pericopeType}`);
  }
  if (verse.pericopeThemes?.length) {
    parts.push(`themes=${verse.pericopeThemes.slice(0, 3).join("/")}`);
  }
  return parts.join(" | ");
}

function buildScore(
  verse: WitnessPacketVerse,
  index: number,
  total: number,
): number {
  const roleScore = verse.role ? (ROLE_PRIORITY[verse.role] ?? 0) : 0;
  const centralityScore =
    typeof verse.centrality === "number" ? verse.centrality * 3 : 0;
  const depthScore =
    typeof verse.depth === "number" ? Math.max(0, 3 - verse.depth) * 0.7 : 0;
  const explicitScore =
    typeof verse.importance === "number" ? verse.importance : 0;
  const orderScore = total > 0 ? (total - index) / total : 0;
  return explicitScore + roleScore + centralityScore + depthScore + orderScore;
}

function buildRosterLine(
  verse: WitnessPacketVerse,
  ordinal: number,
  excerptChars: number,
): string {
  const meta: string[] = [];
  if (verse.role) {
    meta.push(`role=${verse.role}`);
  }
  if (typeof verse.depth === "number") {
    meta.push(`depth=${verse.depth}`);
  }
  if (typeof verse.centrality === "number") {
    meta.push(`centrality=${verse.centrality.toFixed(2)}`);
  }
  const pericopeMeta = formatPericopeMeta(verse);
  if (pericopeMeta) {
    meta.push(pericopeMeta);
  }
  return `${ordinal}. ${verse.reference}${meta.length ? ` | ${meta.join(" | ")}` : ""} | excerpt="${clampText(verse.text, excerptChars)}"`;
}

function buildPrincipalBlock(
  verse: WitnessPacketVerse,
  principalTextChars: number,
): string {
  const meta: string[] = [];
  if (verse.role) {
    meta.push(`role=${verse.role}`);
  }
  if (typeof verse.depth === "number") {
    meta.push(`depth=${verse.depth}`);
  }
  if (typeof verse.centrality === "number") {
    meta.push(`centrality=${verse.centrality.toFixed(2)}`);
  }
  if (verse.rationale) {
    meta.push(`why=${verse.rationale}`);
  }

  const lines = [
    `- ${verse.reference}${meta.length ? ` | ${meta.join(" | ")}` : ""}`,
    `  Full text: "${clampText(verse.text, principalTextChars)}"`,
  ];
  const pericopeMeta = formatPericopeMeta(verse);
  if (pericopeMeta) {
    lines.push(`  Narrative: ${pericopeMeta}`);
  }
  return lines.join("\n");
}

export function buildWitnessPacket(
  verses: WitnessPacketVerse[],
  options: WitnessPacketOptions = {},
): WitnessPacket {
  const totalWitnesses = verses.length;
  const rosterExcerptChars = options.rosterExcerptChars ?? 120;
  const principalTextChars = options.principalTextChars ?? 360;
  const principalCount = Math.max(
    1,
    Math.min(
      totalWitnesses,
      options.principalCount ??
        (totalWitnesses <= 4
          ? totalWitnesses
          : Math.min(6, Math.ceil(totalWitnesses * 0.4))),
    ),
  );

  const ranked = verses
    .map((verse, index) => ({
      verse,
      score: buildScore(verse, index, totalWitnesses),
      index,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

  const principalSet = new Set(
    ranked.slice(0, principalCount).map((entry) => entry.verse.id),
  );
  const principalWitnesses = verses.filter((verse) =>
    principalSet.has(verse.id),
  );

  return {
    totalWitnesses,
    principalWitnessCount: principalWitnesses.length,
    principalWitnessIds: principalWitnesses.map((verse) => verse.id),
    summary:
      `All ${totalWitnesses} verses remain in scope. ` +
      `Read the ${principalWitnesses.length} principal witnesses closely, then use the full roster to confirm the broader pattern and keep the answer accountable to the whole cloud of witnesses.`,
    roster: verses
      .map((verse, index) =>
        buildRosterLine(verse, index + 1, rosterExcerptChars),
      )
      .join("\n"),
    principalWitnesses: principalWitnesses
      .map((verse) => buildPrincipalBlock(verse, principalTextChars))
      .join("\n\n"),
  };
}
