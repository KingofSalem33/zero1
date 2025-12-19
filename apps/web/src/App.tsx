import React, { useState, useEffect } from "react";
import "./App.css";
import RoadmapSidebarV2 from "./components/RoadmapSidebarV2";
import UnifiedWorkspace from "./components/UnifiedWorkspace";
import BibleReader from "./components/BibleReader";
import HighlightsLibrary from "./components/HighlightsLibrary";
import { useAuth } from "./contexts/AuthContext";
import { BibleHighlightsProvider } from "./contexts/BibleHighlightsContext";

interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
}

function App() {
  const { loading: authLoading } = useAuth();
  const [project] = useState(null); // No project management for clean slate
  const [toolsUsed, setToolsUsed] = useState([]);

  // Chat history state
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem("chatHistory");
    if (saved) {
      const parsed = JSON.parse(saved);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return parsed.map((chat: any) => ({
        ...chat,
        timestamp: new Date(chat.timestamp),
      }));
    }
    return [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentMessages, setCurrentMessages] = useState<any[]>([]);
  const [showBible, setShowBible] = useState<boolean>(false);
  const [oratoryMode, setOratoryMode] = useState<boolean>(false);
  const [highlightsMode, setHighlightsMode] = useState<boolean>(false);
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("roadmapCollapsed");
    return saved === "true";
  });

  // Save sidebar collapsed state
  useEffect(() => {
    localStorage.setItem("roadmapCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Initialize first chat on mount
  useEffect(() => {
    if (!currentChatId) {
      const initialChatId = `chat_${Date.now()}`;
      setCurrentChatId(initialChatId);
    }
  }, []);

  // Toggle Bible view
  const handleToggleBible = () => {
    setShowBible((prev) => {
      const newState = !prev;
      // If opening Bible, close other modes
      if (newState) {
        setHighlightsMode(false);
        setOratoryMode(false);
      }
      return newState;
    });
  };

  // Navigate from Bible to Chat with a prompt
  const handleNavigateToChat = (prompt: string) => {
    setShowBible(false); // Switch to chat view
    setPendingChatPrompt(prompt); // Queue the prompt
  };

  // Enter the Oratory
  const handleEnterOratory = () => {
    setShowBible(false); // Close Bible if open
    setHighlightsMode(false); // Close Highlights if open
    setOratoryMode(true); // Enable Oratory mode
    // Start a new chat session for the Oratory
    const newChatId = `oratory_${Date.now()}`;
    setCurrentChatId(newChatId);
    setCurrentMessages([]);
  };

  // Open Highlights in chat area
  const handleOpenHighlights = () => {
    setShowBible(false); // Close Bible if open
    setOratoryMode(false); // Exit Oratory mode
    setHighlightsMode(true); // Enter Highlights mode
  };

  // Navigate from Highlights to Bible verse
  const handleNavigateToVerse = () => {
    setHighlightsMode(false); // Close highlights
    setShowBible(true); // Open Bible
    // TODO: Add logic to navigate to specific verse in BibleReader
    // For now, BibleReader will open at current position
  };

  // Save chats to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("chatHistory", JSON.stringify(chats));
  }, [chats]);

  // Handle creating a new chat
  const handleNewChat = () => {
    // Exit special modes when starting a new chat
    setShowBible(false);
    setOratoryMode(false);
    setHighlightsMode(false);

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
    if (
      currentMessages.length > 0 &&
      currentChatId &&
      currentChatId !== chatId
    ) {
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
    <BibleHighlightsProvider>
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
            showBible={showBible}
            onToggleBible={handleToggleBible}
            onEnterOratory={handleEnterOratory}
            onOpenHighlights={handleOpenHighlights}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={setSidebarCollapsed}
          />

          {/* Main Workspace - Smooth transition between Chat, Bible, and Highlights */}
          <main
            className={`flex-1 min-h-screen relative overflow-hidden transition-all duration-300 ${
              sidebarCollapsed ? "md:ml-16" : "md:ml-64"
            }`}
          >
            {/* Chat View */}
            <div
              className={`absolute inset-0 transition-all duration-500 ease-in-out ${
                showBible || highlightsMode
                  ? "opacity-0 scale-95 pointer-events-none"
                  : "opacity-100 scale-100"
              }`}
            >
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
                pendingPrompt={pendingChatPrompt}
                onPromptConsumed={() => setPendingChatPrompt(null)}
                oratoryMode={oratoryMode}
                onExitOratory={() => setOratoryMode(false)}
              />
            </div>

            {/* Highlights Library View */}
            <div
              className={`absolute inset-0 transition-all duration-500 ease-in-out ${
                highlightsMode
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-95 pointer-events-none"
              }`}
            >
              <HighlightsLibrary onNavigateToVerse={handleNavigateToVerse} />
            </div>

            {/* Bible View */}
            <div
              className={`absolute inset-0 transition-all duration-500 ease-in-out ${
                showBible
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-95 pointer-events-none"
              }`}
            >
              <BibleReader onNavigateToChat={handleNavigateToChat} />
            </div>
          </main>
        </div>
      </div>
    </BibleHighlightsProvider>
  );
}

export default App;
