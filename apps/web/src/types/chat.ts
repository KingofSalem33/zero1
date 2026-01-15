import type { VisualContextBundle } from "./goldenThread";

export type PromptMode = "exegesis_long" | "go_deeper_short";

export type PendingPrompt = {
  displayText: string;
  prompt: string;
  mode?: PromptMode;
  visualBundle?: VisualContextBundle; // Pre-built map data to skip rebuilding
};

export type GoDeeperPayload = string | PendingPrompt;
