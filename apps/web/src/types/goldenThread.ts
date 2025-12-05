/**
 * Golden Thread Visualization Types
 *
 * These types mirror the backend types for visualizing the
 * Expanding Ring exegesis graph
 */

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
}

export interface VisualContextBundle {
  nodes: ThreadNode[]; // Flat list of all verses with graph metadata
  edges: VisualEdge[]; // Parent-child relationships
  rootId: number; // Anchor verse ID
  lens: string; // "NONE" | "MESSIANIC" | "NARRATIVE" | "THEOLOGY"
}
