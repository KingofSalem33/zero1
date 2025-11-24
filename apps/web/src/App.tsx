import React, { useState, useEffect } from "react";
import "./App.css";
import RoadmapSidebarV2 from "./components/RoadmapSidebarV2";
import UnifiedWorkspace from "./components/UnifiedWorkspace";
import { useAuth } from "./contexts/AuthContext";

interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messages: any[];
}

function App() {
  const { user, loading: authLoading } = useAuth();
  const [project] = useState(null); // No project management for clean slate
  const [toolsUsed, setToolsUsed] = useState([]);

  // Chat history state
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem("chatHistory");
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((chat: any) => ({
        ...chat,
        timestamp: new Date(chat.timestamp),
      }));
    }
    return [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentMessages, setCurrentMessages] = useState<any[]>([]);

  // Save chats to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("chatHistory", JSON.stringify(chats));
  }, [chats]);

  // Handle creating a new chat
  const handleNewChat = () => {
    // Save current chat if it has messages
    if (currentMessages.length > 0 && currentChatId) {
      const firstUserMessage = currentMessages.find((m) => m.type === "user");
      const title = firstUserMessage?.content.slice(0, 50) || "New Chat";
      const lastAiMessage = [...currentMessages]
        .reverse()
        .find((m) => m.type === "ai");
      const lastMessage = lastAiMessage?.content.slice(0, 100) || "";

      setChats((prev) => {
        const existingIndex = prev.findIndex((c) => c.id === currentChatId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            messages: currentMessages,
            lastMessage,
            timestamp: new Date(),
          };
          return updated;
        } else {
          return [
            {
              id: currentChatId,
              title,
              lastMessage,
              timestamp: new Date(),
              messages: currentMessages,
            },
            ...prev,
          ];
        }
      });
    }

    // Start new chat
    const newChatId = `chat_${Date.now()}`;
    setCurrentChatId(newChatId);
    setCurrentMessages([]);
  };

  // Handle selecting a chat from history
  const handleSelectChat = (chatId: string) => {
    // Save current chat first
    if (currentMessages.length > 0 && currentChatId && currentChatId !== chatId) {
      const firstUserMessage = currentMessages.find((m) => m.type === "user");
      const title = firstUserMessage?.content.slice(0, 50) || "New Chat";
      const lastAiMessage = [...currentMessages]
        .reverse()
        .find((m) => m.type === "ai");
      const lastMessage = lastAiMessage?.content.slice(0, 100) || "";

      setChats((prev) => {
        const existingIndex = prev.findIndex((c) => c.id === currentChatId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            messages: currentMessages,
            lastMessage,
            timestamp: new Date(),
          };
          return updated;
        } else {
          return [
            {
              id: currentChatId,
              title,
              lastMessage,
              timestamp: new Date(),
              messages: currentMessages,
            },
            ...prev,
          ];
        }
      });
    }

    // Load selected chat
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      setCurrentChatId(chatId);
      setCurrentMessages(chat.messages);
    }
  };

  // Update current chat when messages change
  useEffect(() => {
    if (currentMessages.length > 0 && currentChatId) {
      const firstUserMessage = currentMessages.find((m) => m.type === "user");
      const title = firstUserMessage?.content.slice(0, 50) || "New Chat";
      const lastAiMessage = [...currentMessages]
        .reverse()
        .find((m) => m.type === "ai");
      const lastMessage = lastAiMessage?.content.slice(0, 100) || "";

      setChats((prev) => {
        const existingIndex = prev.findIndex((c) => c.id === currentChatId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            messages: currentMessages,
            lastMessage,
            timestamp: new Date(),
          };
          return updated;
        } else {
          return [
            {
              id: currentChatId,
              title,
              lastMessage,
              timestamp: new Date(),
              messages: currentMessages,
            },
            ...prev,
          ];
        }
      });
    }
  }, [currentMessages, currentChatId]);

  // Show loading while auth initializes
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Main layout: Sidebar + Workspace
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950">
      <div className="flex">
        {/* Left Sidebar */}
        <RoadmapSidebarV2
          project={project}
          onOpenFileManager={() => {}}
          onOpenMemoryManager={() => {}}
          onAskAI={() => {}}
          currentChatId={currentChatId || undefined}
          chats={chats}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
        />

        {/* Main Workspace */}
        <main className="flex-1 min-h-screen">
          <UnifiedWorkspace
            project={project}
            onCreateProject={() => {}}
            onInspireMe={() => {}}
            toolsUsed={toolsUsed}
            setToolsUsed={setToolsUsed}
            creating={false}
            inspiring={false}
            onRefreshProject={() => {}}
            messages={currentMessages}
            onMessagesChange={setCurrentMessages}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
