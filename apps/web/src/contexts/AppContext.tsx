import React, { createContext, useContext } from "react";
import type { VisualContextBundle } from "../types/goldenThread";
import type { GoDeeperPayload } from "../types/chat";

interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
}

interface AppContextValue {
  // Chat state
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  currentChatId: string | null;
  setCurrentChatId: React.Dispatch<React.SetStateAction<string | null>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentMessages: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setCurrentMessages: React.Dispatch<React.SetStateAction<any[]>>;

  // Actions
  handleTrace: (text: string) => void;
  handleGoDeeper: (prompt: GoDeeperPayload) => void;
  handleShowVisualization: (bundle: VisualContextBundle) => void;
  handleNewChat: () => void;
  handleSelectChat: (chatId: string) => void;

  // Misc
  bibleStudyMode: boolean;
  setBibleStudyMode: React.Dispatch<React.SetStateAction<boolean>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolsUsed: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setToolsUsed: React.Dispatch<React.SetStateAction<any[]>>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}

export const AppProvider = AppContext.Provider;

export type { Chat, AppContextValue };
