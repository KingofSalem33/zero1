export type VisualEdgeType =
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

export interface VisualNode {
  id: number;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  depth: number;
}

export interface VisualEdge {
  from: number;
  to: number;
  weight: number;
  type: VisualEdgeType;
}

export interface VisualContextBundle {
  nodes: VisualNode[];
  edges: VisualEdge[];
  rootId: number;
  lens: string;
}

export function isVisualContextBundle(
  value: unknown,
): value is VisualContextBundle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VisualContextBundle>;
  return (
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    typeof candidate.rootId === "number"
  );
}
