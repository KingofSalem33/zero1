export type PendingPrompt = {
  displayText: string;
  prompt: string;
};

export type GoDeeperPayload = string | PendingPrompt;
