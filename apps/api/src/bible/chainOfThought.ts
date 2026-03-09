import type { ChainData, ChainStep, EdgeType } from "./types";

type ChainSourceNode = {
  id: number;
  book_name: string;
  chapter: number;
  verse: number;
  depth?: number;
  text?: string;
};

type ChainSourceEdge = {
  from: number;
  to: number;
  type?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
};

type ChainSourceBundle = {
  nodes: ChainSourceNode[];
  edges: ChainSourceEdge[];
  rootId?: number;
};

type OrientedEdge = {
  fromId: number;
  toId: number;
  type: EdgeType;
  weight: number;
  metadataExplanation: string;
};

const REFERENCE_REGEX =
  /((?:\[|\()?\s*(?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?\s*(?:\]|\))?)/g;

const EDGE_TYPE_SET = new Set<EdgeType>([
  "DEEPER",
  "ROOTS",
  "ECHOES",
  "ALLUSION",
  "PROPHECY",
  "GENEALOGY",
  "NARRATIVE",
  "TYPOLOGY",
  "FULFILLMENT",
  "CONTRAST",
  "PROGRESSION",
  "PATTERN",
]);

function normalizeReference(value: string): string {
  return value
    .replace(/^[[(]\s*/, "")
    .replace(/\s*[\])]$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseReference(
  value: string,
): { book: string; chapter: number; verse: number } | null {
  const cleaned = value
    .replace(/^[[(]\s*/, "")
    .replace(/\s*[\])]$/, "")
    .trim();
  const matched = cleaned.match(/^(.+?)\s+(\d+):(\d+)(?:-\d+)?$/);
  if (!matched) return null;
  const chapter = Number(matched[2]);
  const verse = Number(matched[3]);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
  return {
    book: matched[1].trim(),
    chapter,
    verse,
  };
}

function toEdgeType(value: string | undefined): EdgeType {
  if (!value) return "DEEPER";
  return EDGE_TYPE_SET.has(value as EdgeType) ? (value as EdgeType) : "DEEPER";
}

function defaultExplanation(type: EdgeType): string {
  switch (type) {
    case "ROOTS":
      return "Root context";
    case "ECHOES":
      return "Echoed theme";
    case "ALLUSION":
      return "Scripture allusion";
    case "PROPHECY":
      return "Prophetic movement";
    case "GENEALOGY":
      return "Covenant lineage";
    case "NARRATIVE":
      return "Narrative continuation";
    case "TYPOLOGY":
      return "Type -> fulfillment";
    case "FULFILLMENT":
      return "Promise -> fulfillment";
    case "CONTRAST":
      return "Theological contrast";
    case "PROGRESSION":
      return "Doctrinal progression";
    case "PATTERN":
      return "Canonical pattern";
    default:
      return "Linked idea";
  }
}

const STOP_WORDS = new Set<string>([
  "the",
  "and",
  "that",
  "this",
  "from",
  "with",
  "into",
  "for",
  "unto",
  "your",
  "their",
  "they",
  "them",
  "then",
  "when",
  "where",
  "shall",
  "will",
  "have",
  "hath",
  "were",
  "been",
  "being",
  "also",
  "there",
  "here",
  "upon",
  "which",
  "what",
  "whose",
  "because",
  "about",
  "after",
  "before",
  "through",
  "therefore",
  "unto",
  "thou",
  "thee",
  "ye",
  "him",
  "his",
  "her",
  "hers",
  "our",
  "ours",
  "mine",
  "yours",
  "their",
  "said",
  "saith",
  "saying",
  "thine",
  "hast",
  "doth",
  "did",
  "does",
  "wherefore",
  "behold",
  "thus",
  "therein",
  "thereof",
  "therein",
  "those",
  "these",
  "been",
  "such",
  "unto",
  "them",
]);

const THEME_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Seed promise", patterns: [/\bseed\b/i, /\boffspring\b/i] },
  {
    label: "Serpent defeat",
    patterns: [/\bserpent\b/i, /\bsatan\b/i, /\bdevil\b/i, /\bdragon\b/i],
  },
  {
    label: "Covenant promise",
    patterns: [/\bcovenant\b/i, /\bpromise\b/i, /\boath\b/i],
  },
  {
    label: "Nations blessed",
    patterns: [/\bbless(?:ed|ing)?\b/i, /\bnations?\b/i, /\bgentiles?\b/i],
  },
  {
    label: "Righteousness by faith",
    patterns: [/\brighteous(?:ness)?\b/i, /\bfaith\b/i, /\bjustif(?:y|ied)\b/i],
  },
  {
    label: "Atonement sacrifice",
    patterns: [/\bblood\b/i, /\bsacrifice\b/i, /\blamb\b/i, /\baltar\b/i],
  },
  {
    label: "Victory over death",
    patterns: [
      /\bresurrection\b/i,
      /\braise(?:d)?\b/i,
      /\bdeath\b/i,
      /\blife\b/i,
    ],
  },
  {
    label: "Kingdom reign",
    patterns: [/\bkingdom\b/i, /\bthrone\b/i, /\breign\b/i, /\bking\b/i],
  },
  {
    label: "God with His people",
    patterns: [/\btemple\b/i, /\btabernacle\b/i, /\bdwell(?:ing)?\b/i],
  },
  {
    label: "Priestly mediation",
    patterns: [
      /\bpriest\b/i,
      /\bhigh priest\b/i,
      /\bmediator\b/i,
      /\bintercede\b/i,
    ],
  },
  {
    label: "Mercy and grace",
    patterns: [/\bmercy\b/i, /\bgrace\b/i, /\bcompassion\b/i],
  },
];

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function tokenize(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 4 && !STOP_WORDS.has(token) && !/^\d+$/.test(token),
    );
}

function topKeywords(text: string, max = 3): string[] {
  const scores = new Map<string, number>();
  tokenize(text).forEach((token) => {
    scores.set(token, (scores.get(token) || 0) + 1);
  });
  return Array.from(scores.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .slice(0, max)
    .map(([token]) => token);
}

function detectThemes(text: string): string[] {
  const detected: string[] = [];
  THEME_PATTERNS.forEach((entry) => {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      detected.push(entry.label);
    }
  });
  return detected;
}

function clampWords(text: string, maxWords: number): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ");
  }
  return words.slice(0, maxWords).join(" ");
}

function conceptLabelFromText(text: string): string | null {
  const theme = detectThemes(text)[0];
  if (theme) return theme;
  const keywords = topKeywords(text, 2).map((word) => capitalizeFirst(word));
  if (keywords.length >= 2) return `${keywords[0]} ${keywords[1]}`;
  return keywords[0] || null;
}

function isGenericMetadata(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("this step") ||
    normalized.includes("scriptural thread") ||
    normalized.includes("canonical pattern") ||
    normalized.includes("same theme") ||
    normalized.includes("deepens") ||
    normalized.includes("this passage") ||
    normalized.includes("narrative movement") ||
    normalized.includes("redemptive history")
  );
}

function toBreadcrumbLabel(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed;
  const withoutRefs = firstSentence
    .replace(REFERENCE_REGEX, " ")
    .replace(/\[(.*?)\]/g, "$1")
    .replace(/\((.*?)\)/g, "$1");
  const compact = withoutRefs
    .replace(/^concept\s*:\s*/i, "")
    .replace(/^this\s+(step|passage)\s+/i, "")
    .replace(/^(shows?|means?|reveals?)\s+/i, "")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
  if (!compact) return null;
  const words = clampWords(compact, 7);
  if (!words || words.length < 3) return null;
  return capitalizeFirst(words);
}

function formatReference(node: ChainSourceNode): string {
  return `${node.book_name} ${node.chapter}:${node.verse}`;
}

function pickStepExplanation(edge: ChainSourceEdge): string {
  const fromMetadata =
    typeof edge.metadata?.explanation === "string"
      ? edge.metadata.explanation.trim()
      : "";
  if (fromMetadata.length > 0) return fromMetadata;
  return "";
}

function buildConceptExplanation(
  fromNode: ChainSourceNode,
  toNode: ChainSourceNode,
  type: EdgeType,
  metadataExplanation: string,
): string {
  const fromText = fromNode.text || "";
  const toText = toNode.text || "";
  const metadataLabel = toBreadcrumbLabel(metadataExplanation || "");
  if (metadataLabel && !isGenericMetadata(metadataLabel)) {
    return metadataLabel;
  }

  const fromTheme = conceptLabelFromText(fromText);
  const toTheme = conceptLabelFromText(toText);
  if (fromTheme && toTheme && fromTheme !== toTheme) {
    return `${fromTheme} -> ${toTheme}`;
  }
  if (toTheme) return toTheme;
  if (fromTheme) return fromTheme;

  return defaultExplanation(type);
}

function buildReferenceLookup(bundle: ChainSourceBundle): Map<string, number> {
  const lookup = new Map<string, number>();
  bundle.nodes.forEach((node) => {
    lookup.set(normalizeReference(formatReference(node)), node.id);
  });
  return lookup;
}

export function extractCitationsFromResponse(text: string): string[] {
  if (!text.trim()) return [];
  const matches = text.match(REFERENCE_REGEX) || [];
  const seen = new Set<string>();
  const citations: string[] = [];

  matches.forEach((candidate) => {
    const parsed = parseReference(candidate);
    if (!parsed) return;
    const canonical = `${parsed.book} ${parsed.chapter}:${parsed.verse}`;
    const key = normalizeReference(canonical);
    if (seen.has(key)) return;
    seen.add(key);
    citations.push(canonical);
  });

  return citations;
}

function orderEdges(
  bundle: ChainSourceBundle,
  edges: ChainSourceEdge[],
  maxSteps: number,
): OrientedEdge[] {
  const nodeById = new Map<number, ChainSourceNode>(
    bundle.nodes.map((node) => [node.id, node]),
  );

  const oriented = edges
    .map((edge) => {
      const fromNode = nodeById.get(edge.from);
      const toNode = nodeById.get(edge.to);
      if (!fromNode || !toNode) return null;

      const fromDepth = fromNode.depth ?? 0;
      const toDepth = toNode.depth ?? 0;
      let fromId = edge.from;
      let toId = edge.to;
      if (fromDepth > toDepth) {
        fromId = edge.to;
        toId = edge.from;
      } else if (
        fromDepth === toDepth &&
        bundle.rootId !== undefined &&
        edge.to === bundle.rootId &&
        edge.from !== bundle.rootId
      ) {
        fromId = edge.to;
        toId = edge.from;
      }

      const type = toEdgeType(edge.type);
      return {
        fromId,
        toId,
        type,
        weight: typeof edge.weight === "number" ? edge.weight : 0.7,
        metadataExplanation: pickStepExplanation(edge),
      };
    })
    .filter((edge): edge is OrientedEdge => Boolean(edge));

  const deduped = new Map<string, OrientedEdge>();
  oriented.forEach((edge) => {
    const key = `${edge.type}:${Math.min(edge.fromId, edge.toId)}-${Math.max(edge.fromId, edge.toId)}`;
    const current = deduped.get(key);
    if (!current || edge.weight > current.weight) {
      deduped.set(key, edge);
    }
  });
  const uniqueEdges = Array.from(deduped.values());
  if (uniqueEdges.length <= 1) return uniqueEdges;

  const visited = new Set<number>();
  const ordered: OrientedEdge[] = [];
  let currentNodeId =
    bundle.rootId && nodeById.has(bundle.rootId)
      ? bundle.rootId
      : uniqueEdges[0].fromId;

  while (ordered.length < Math.min(maxSteps, uniqueEdges.length)) {
    const next = uniqueEdges
      .map((edge, index) => ({ edge, index }))
      .filter(({ index }) => !visited.has(index))
      .filter(
        ({ edge }) =>
          edge.fromId === currentNodeId || edge.toId === currentNodeId,
      )
      .sort((a, b) => b.edge.weight - a.edge.weight)[0];

    if (next) {
      visited.add(next.index);
      const orientedStep =
        next.edge.fromId === currentNodeId
          ? next.edge
          : {
              ...next.edge,
              fromId: next.edge.toId,
              toId: next.edge.fromId,
            };
      ordered.push(orientedStep);
      currentNodeId = orientedStep.toId;
      continue;
    }

    const fallback = uniqueEdges
      .map((edge, index) => ({ edge, index }))
      .filter(({ index }) => !visited.has(index))
      .sort((a, b) => b.edge.weight - a.edge.weight)[0];
    if (!fallback) break;
    visited.add(fallback.index);
    ordered.push(fallback.edge);
    currentNodeId = fallback.edge.toId;
  }

  return ordered;
}

function buildTheme(rootRef: string, steps: ChainStep[]): string {
  if (steps.length === 0) return `Scripture thread from ${rootRef}`;
  const counts = new Map<EdgeType, number>();
  steps.forEach((step) => {
    counts.set(step.connectionType, (counts.get(step.connectionType) || 0) + 1);
  });
  const topType =
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "DEEPER";
  return `${rootRef}: ${topType.toLowerCase()} chain`;
}

export function buildChainDataFromBundleAndResponse(
  bundle: ChainSourceBundle,
  responseText: string,
  options?: { maxSteps?: number },
): ChainData | null {
  if (!bundle.nodes.length || !bundle.edges.length) return null;

  const maxSteps = Math.max(2, options?.maxSteps ?? 8);
  const lookup = buildReferenceLookup(bundle);
  const citedReferences = extractCitationsFromResponse(responseText);
  const citedIds = new Set<number>();

  citedReferences.forEach((reference) => {
    const id = lookup.get(normalizeReference(reference));
    if (typeof id === "number") {
      citedIds.add(id);
    }
  });

  const allEdges = bundle.edges;
  let candidateEdges =
    citedIds.size > 0
      ? allEdges.filter(
          (edge) => citedIds.has(edge.from) && citedIds.has(edge.to),
        )
      : [];

  if (candidateEdges.length === 0 && citedIds.size > 0) {
    candidateEdges = allEdges.filter(
      (edge) => citedIds.has(edge.from) || citedIds.has(edge.to),
    );
  }
  if (candidateEdges.length === 0) {
    candidateEdges = allEdges;
  }

  const orderedEdges = orderEdges(bundle, candidateEdges, maxSteps);
  if (orderedEdges.length === 0) return null;

  const nodeById = new Map<number, ChainSourceNode>(
    bundle.nodes.map((node) => [node.id, node]),
  );
  const steps: ChainStep[] = [];

  orderedEdges.forEach((edge) => {
    const fromNode = nodeById.get(edge.fromId);
    const toNode = nodeById.get(edge.toId);
    if (!fromNode || !toNode) return;
    steps.push({
      fromReference: formatReference(fromNode),
      toReference: formatReference(toNode),
      connectionType: edge.type,
      explanation: buildConceptExplanation(
        fromNode,
        toNode,
        edge.type,
        edge.metadataExplanation,
      ),
    });
  });

  if (steps.length === 0) return null;

  // Enforce uniqueness so the user sees movement, not repeated generic lines.
  const seenExplanations = new Set<string>();
  steps.forEach((step) => {
    const key = step.explanation.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seenExplanations.has(key)) {
      seenExplanations.add(key);
      return;
    }
    step.explanation = `${defaultExplanation(step.connectionType)} · ${step.toReference}`;
    seenExplanations.add(
      step.explanation.toLowerCase().replace(/\s+/g, " ").trim(),
    );
  });

  const rootNode =
    (typeof bundle.rootId === "number" && nodeById.get(bundle.rootId)) ||
    nodeById.get(orderedEdges[0].fromId) ||
    bundle.nodes[0];
  const rootRef = rootNode ? formatReference(rootNode) : steps[0].fromReference;

  return {
    theme: buildTheme(rootRef, steps),
    steps,
  };
}
