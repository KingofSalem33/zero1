/**
 * Bible Types and Interfaces
 */

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

export interface Verse extends VerseRef {
  text: string;
}

export interface Book {
  abbrev: string;
  name: string;
  chapters: string[][];
}

export interface QuestionAnalysis {
  topics: string[];
  keywords: string[];
  explicitReferences: string[];
}

export interface AnchorVerse extends VerseRef {
  reason: string;
}

export interface CrossRefBundle {
  anchor: Verse;
  refs: Verse[];
}

/**
 * Golden Thread Visualization Types
 */

/**
 * Edge types for multi-strand visualization
 */
export type EdgeType =
  | "DEEPER"
  | "ROOTS"
  | "ECHOES"
  | "PROPHECY"
  | "GENEALOGY"
  | "NARRATIVE"
  | "TYPOLOGY"
  | "FULFILLMENT"
  | "CONTRAST"
  | "PROGRESSION"
  | "PATTERN";

/**
 * Edge styling configuration
 */
export interface EdgeStyle {
  color: string;
  dashArray: string;
  width: number;
  glow?: boolean;
}

export interface ParallelPassage {
  id: number;
  reference: string; // e.g., "Mark 1:40-45"
  text: string;
  similarity: number; // 0.92-1.0 range
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
  depth: number; // 0=anchor, 1=ring1, 2=ring2, 3=ring3
  parentId?: number; // ID of verse that links to this one
  isSpine: boolean; // Is this node on the golden path (anchor to deepest leaf)?
  isVisible: boolean; // Should this node be visible by default (spine + expanded branches)?
  collapsedChildCount: number; // How many children are hidden (0 if all visible or no children)
  ringSource: string; // "ring0" | "ring1" | "ring2" | "ring3"
  parallelPassages?: ParallelPassage[]; // Parallel accounts (synoptic parallels, etc.)
  isStackedWith?: number; // If this node is hidden due to being a parallel, points to the representative node ID
  centrality?: number; // 0-1, precomputed hub score
  mass?: number; // 1-6, gravity mass used for layout
  structureId?: number; // Literary structure reference (if applicable)
  structureRole?: "center" | "mirror" | "member";
  mirrorOf?: number; // Verse ID of the mirror pair (if applicable)
  referenceKey?: string; // Canonical normalized reference (e.g., "john 1:1")
  // Pericope metadata (optional)
  pericopeId?: number; // ID of parent pericope
  pericopeTitle?: string; // Display title (title_generated || title)
  pericopeType?: string; // "narrative", "parable", "teaching", etc.
  pericopeThemes?: string[]; // Theological themes
  isPericopeAnchor?: boolean; // True if this verse is the pericope anchor
}

export interface VisualEdge {
  from: number;
  to: number;
  weight: number; // 1.0 = strongest, 0.5 = weakest
  type: EdgeType; // Type of connection
  metadata?: Record<string, unknown>; // Optional metadata (e.g., Strong's number, citation type)
}

export interface PericopeBundle {
  nodes: ThreadNode[]; // Pericope nodes (anchor + narrative connections)
  edges: VisualEdge[]; // Narrative-level connections
  rootId: number; // Anchor pericope ID
  lens: string; // "NARRATIVE"
}

export interface VisualContextBundle {
  nodes: ThreadNode[]; // Flat list of all verses with graph metadata
  edges: VisualEdge[]; // Parent-child relationships with types
  rootId: number; // Anchor verse ID
  lens: string; // "NONE" | "MESSIANIC" | "NARRATIVE" | "THEOLOGY"
  pericopeValidation?: {
    droppedEdges: number;
    minSimilarity: number;
  };
  // Pericope metadata if resolution was pericope-first
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

/**
 * Edge styling map
 */
export const EDGE_STYLES: Record<EdgeType, EdgeStyle> = {
  DEEPER: { color: "#9CA3AF", dashArray: "0", width: 1 },
  ROOTS: { color: "#D4AF37", dashArray: "4 4", width: 1 },
  ECHOES: { color: "#3B82F6", dashArray: "0", width: 2 },
  PROPHECY: { color: "#A855F7", dashArray: "0", width: 1.5, glow: true },
  GENEALOGY: { color: "#10B981", dashArray: "0", width: 1 },
  NARRATIVE: { color: "#9CA3AF", dashArray: "0", width: 1 },
  TYPOLOGY: { color: "#EA580C", dashArray: "2 3", width: 2 },
  FULFILLMENT: { color: "#14B8A6", dashArray: "2 3", width: 2 },
  CONTRAST: { color: "#DC2626", dashArray: "2 3", width: 2 },
  PROGRESSION: { color: "#16A34A", dashArray: "2 3", width: 2 },
  PATTERN: { color: "#3B82F6", dashArray: "2 3", width: 2 },
};
