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
export type EdgeType = "DEEPER" | "ROOTS" | "ECHOES" | "PROPHECY" | "GENEALOGY";

/**
 * Edge styling configuration
 */
export interface EdgeStyle {
  color: string;
  dashArray: string;
  width: number;
  glow?: boolean;
}

export interface ThreadNode {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  depth: number; // 0=anchor, 1=ring1, 2=ring2, 3=ring3
  parentId?: number; // ID of verse that links to this one
  isSpine: boolean; // Is this node on the golden path (anchor to deepest leaf)?
  isVisible: boolean; // Should this node be visible by default (spine + expanded branches)?
  collapsedChildCount: number; // How many children are hidden (0 if all visible or no children)
  ringSource: string; // "ring0" | "ring1" | "ring2" | "ring3"
}

export interface VisualEdge {
  from: number;
  to: number;
  weight: number; // 1.0 = strongest, 0.5 = weakest
  type: EdgeType; // Type of connection
  metadata?: Record<string, any>; // Optional metadata (e.g., Strong's number, citation type)
}

export interface VisualContextBundle {
  nodes: ThreadNode[]; // Flat list of all verses with graph metadata
  edges: VisualEdge[]; // Parent-child relationships with types
  rootId: number; // Anchor verse ID
  lens: string; // "NONE" | "MESSIANIC" | "NARRATIVE" | "THEOLOGY"
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
};
