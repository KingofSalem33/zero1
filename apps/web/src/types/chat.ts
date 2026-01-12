export type PromptMode = "exegesis_long" | "go_deeper_short";

export type PendingPrompt = {
  displayText: string;
  prompt: string;
  mode?: PromptMode;
};

export type GoDeeperPayload = string | PendingPrompt;
