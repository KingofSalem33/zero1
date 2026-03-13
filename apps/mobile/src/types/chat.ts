import type { VisualContextBundle } from "./visualization";

export type MobilePromptMode = "exegesis_long" | "go_deeper_short";

export type MobileMapConnection = {
  fromId: number;
  toId: number;
  connectionType: string;
};

export type MobileMapCluster = {
  baseId: number;
  verseIds: number[];
  connectionType: string;
};

export type MobileMapSession = {
  cluster?: MobileMapCluster;
  currentConnection?: MobileMapConnection;
  previousConnection?: MobileMapConnection;
  nextConnection?: MobileMapConnection | null;
  visitedEdgeKeys?: string[];
  offMapReferences?: string[];
  exhausted?: boolean;
};

export type MobilePendingPrompt = {
  displayText: string;
  prompt: string;
  mode?: MobilePromptMode;
  visualBundle?: VisualContextBundle;
  mapSession?: MobileMapSession;
};

export type MobileGoDeeperPayload = string | MobilePendingPrompt;

export function normalizeMobilePendingPrompt(
  payload: MobileGoDeeperPayload,
): MobilePendingPrompt {
  if (typeof payload === "string") {
    return {
      displayText: payload,
      prompt: payload,
    };
  }
  return payload;
}
