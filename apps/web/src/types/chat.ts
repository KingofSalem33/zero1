import type { VisualContextBundle } from "./goldenThread";

export type PromptMode = "exegesis_long" | "go_deeper_short";

export type MapConnection = {
  fromId: number;
  toId: number;
  connectionType: string;
};

export type MapCluster = {
  baseId: number;
  verseIds: number[];
  connectionType: string;
};

export type MapSession = {
  cluster?: MapCluster;
  currentConnection?: MapConnection;
  nextConnection?: MapConnection | null;
  visitedEdgeKeys?: string[];
  offMapReferences?: string[];
  exhausted?: boolean;
};

export type PendingPrompt = {
  displayText: string;
  prompt: string;
  mode?: PromptMode;
  visualBundle?: VisualContextBundle; // Pre-built map data to skip rebuilding
  mapSession?: MapSession;
};

export type GoDeeperPayload = string | PendingPrompt;
