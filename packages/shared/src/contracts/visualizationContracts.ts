export type EdgeType =
  | "DEEPER"
  | "ROOTS"
  | "ECHOES"
  | "ALLUSION"
  | "PROPHECY"
  | "GENEALOGY"
  | "NARRATIVE"
  | "TYPOLOGY"
  | "FULFILLMENT"
  | "CONTRAST"
  | "PROGRESSION"
  | "PATTERN";

export interface ParallelPassage {
  id: number;
  reference: string;
  text: string;
  similarity: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
}

export interface ThreadNode {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  displayLabel?: string;
  displaySubLabel?: string;
  depth: number;
  parentId?: number;
  isSpine: boolean;
  isVisible: boolean;
  collapsedChildCount: number;
  ringSource: string;
  parallelPassages?: ParallelPassage[];
  isStackedWith?: number;
  centrality?: number;
  mass?: number;
  structureId?: number;
  structureRole?: "center" | "mirror" | "member";
  mirrorOf?: number;
  referenceKey?: string;
  pericopeId?: number;
  pericopeTitle?: string;
  pericopeType?: string;
  pericopeThemes?: string[];
  isPericopeAnchor?: boolean;
}

export interface VisualEdge {
  from: number;
  to: number;
  weight: number;
  type: EdgeType;
  metadata?: Record<string, unknown>;
}

export interface PericopeBundle {
  nodes: ThreadNode[];
  edges: VisualEdge[];
  rootId: number;
  lens: string;
}

export interface VisualContextBundle {
  nodes: ThreadNode[];
  edges: VisualEdge[];
  rootId: number;
  lens: string;
  pericopeValidation?: {
    droppedEdges: number;
    minSimilarity: number;
  };
  pericopeContext?: {
    id: number;
    title: string;
    summary: string;
    themes: string[];
    archetypes: string[];
    shadows: string[];
    rangeRef: string;
  };
  resolutionType?: "pericope_first" | "verse_first";
  pericopeBundle?: PericopeBundle;
}

export function isVisualContextBundle(
  value: unknown,
): value is VisualContextBundle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VisualContextBundle>;
  return (
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    typeof candidate.rootId === "number" &&
    typeof candidate.lens === "string"
  );
}
