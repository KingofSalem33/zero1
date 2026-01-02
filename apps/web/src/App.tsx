import React, { useState, useEffect, lazy, Suspense, useCallback } from "react";
import "./App.css";
import RoadmapSidebarV2 from "./components/RoadmapSidebarV2";
import { useAuth } from "./contexts/AuthContext";
import { BibleHighlightsProvider } from "./contexts/BibleHighlightsContext";
import type { VisualContextBundle } from "./types/goldenThread";
import { NarrativeMap } from "./components/golden-thread/NarrativeMap";

// Lazy load heavy components for code splitting
const UnifiedWorkspace = lazy(() => import("./components/UnifiedWorkspace"));
const BibleReader = lazy(() => import("./components/BibleReader"));
const HighlightsLibrary = lazy(() => import("./components/HighlightsLibrary"));

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

  // Chat history state - initialized empty, loaded async
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentMessages, setCurrentMessages] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"reader" | "chat" | "highlights">(
    "reader",
  );
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Trace visualization state (lifted to App level for use from any context)
  const [showVisualization, setShowVisualization] = useState(false);
  const [visualBundle, setVisualBundle] = useState<VisualContextBundle | null>(
    null,
  );

  // Load chat history from localStorage after mount (async, non-blocking)
  useEffect(() => {
    const loadChatHistory = () => {
      try {
        const saved = localStorage.getItem("chatHistory");
        if (saved) {
          const parsed = JSON.parse(saved);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hydrated = parsed.map((chat: any) => ({
            ...chat,
            timestamp: new Date(chat.timestamp),
          }));
          setChats(hydrated);
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    };

    const loadSidebarState = () => {
      try {
        const saved = localStorage.getItem("roadmapCollapsed");
        if (saved === "true") {
          setSidebarCollapsed(true);
        }
      } catch (error) {
        console.error("Failed to load sidebar state:", error);
      }
    };

    // Load in next tick to not block hydration
    if (typeof requestIdleCallback !== "undefined") {
      // eslint-disable-next-line no-undef
      requestIdleCallback(() => {
        loadChatHistory();
        loadSidebarState();
      });
    } else {
      setTimeout(() => {
        loadChatHistory();
        loadSidebarState();
      }, 0);
    }
  }, []);

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

  // Toggle to Bible Reader view
  const handleToggleBible = () => {
    setViewMode("reader");
  };

  // Navigate from Bible to Chat with a prompt
  const handleNavigateToChat = (prompt: string) => {
    setViewMode("chat"); // Switch to chat view
    setPendingChatPrompt(prompt); // Queue the prompt
  };

  // Canonical trace handler - shows map visualization (used from any context)
  const handleTrace = useCallback(async (selectedText: string) => {
    try {
      console.log("[App] Trace requested for:", selectedText);

      // Show visualization panel immediately with loading state
      setShowVisualization(true);
      setVisualBundle(null); // Clear previous bundle

      // Call the trace API endpoint
      const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";
      const response = await fetch(`${API_URL}/api/trace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: selectedText }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[App] Trace API error:", error);
        // Keep visualization panel open to show error state
        return;
      }

      const bundle: VisualContextBundle = await response.json();
      console.log(
        "[App] ✅ Received trace bundle:",
        bundle.nodes.length,
        "nodes",
      );

      // Set the visual bundle to display the map
      setVisualBundle(bundle);
    } catch (error) {
      console.error("[App] Failed to fetch trace visualization:", error);
      // Close visualization panel on error
      setShowVisualization(false);
    }
  }, []);

  // Handle "Go Deeper" - navigates to chat and sends the formatted prompt
  const handleGoDeeper = useCallback((prompt: string) => {
    console.log("[App] Go Deeper requested with prompt:", prompt);
    handleNavigateToChat(prompt);
  }, []);

  // Enter Bible Study (just show chat view)
  const handleEnterBibleStudy = () => {
    setViewMode("chat");
  };

  // Open Highlights
  const handleOpenHighlights = () => {
    setViewMode("highlights");
  };

  // Navigate from Highlights to Bible verse
  const handleNavigateToVerse = () => {
    setViewMode("reader");
    // TODO: Add logic to navigate to specific verse in BibleReader
    // For now, BibleReader will open at current position
  };

  // Save chats to localStorage whenever they change
  useEffect(() => {
    try {
      // Keep only the last 10 chats to prevent storage overflow
      const chatsToSave = chats.slice(-10);
      localStorage.setItem("chatHistory", JSON.stringify(chatsToSave));
    } catch (error) {
      // If localStorage is full, clear old data and try again
      if (error instanceof Error && error.name === "QuotaExceededError") {
        console.warn("localStorage quota exceeded, clearing old chat history");
        try {
          // Keep only the current chat
          const currentChatOnly = chats.slice(-1);
          localStorage.setItem("chatHistory", JSON.stringify(currentChatOnly));
        } catch {
          // If still failing, just clear it completely
          localStorage.removeItem("chatHistory");
          console.error("Failed to save chat history - localStorage cleared");
        }
      }
    }
  }, [chats]);

  // Handle creating a new chat
  const handleNewChat = () => {
    // Switch to chat view
    setViewMode("chat");

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
            showBible={viewMode === "reader"}
            onToggleBible={handleToggleBible}
            onEnterBibleStudy={handleEnterBibleStudy}
            onOpenHighlights={handleOpenHighlights}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={setSidebarCollapsed}
          />

          {/* Main Workspace - Renders only the active view */}
          <main
            className={`flex-1 min-h-screen relative transition-all duration-300 ${
              sidebarCollapsed ? "md:ml-16" : "md:ml-64"
            }`}
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-screen">
                  <div className="w-12 h-12 border-4 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              }
            >
              {viewMode === "reader" ? (
                <BibleReader
                  onNavigateToChat={handleNavigateToChat}
                  onTrace={handleTrace}
                />
              ) : viewMode === "highlights" ? (
                <HighlightsLibrary onNavigateToVerse={handleNavigateToVerse} />
              ) : (
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
                  bibleStudyMode={false}
                  onExitBibleStudy={() => {}}
                  onTrace={handleTrace}
                  onGoDeeper={handleGoDeeper}
                />
              )}
            </Suspense>
          </main>
        </div>

        {/* Trace Visualization Panel - Global overlay */}
        {showVisualization && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="w-[90vw] h-[90vh] bg-neutral-900 rounded-xl shadow-2xl overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700 bg-neutral-800/50">
                <h3 className="text-sm font-semibold text-neutral-200">
                  Theological Thread Explorer
                  {visualBundle &&
                    ` (${visualBundle.nodes?.length || 0} verses)`}
                </h3>
                <button
                  onClick={() => setShowVisualization(false)}
                  className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                  title="Close visualization"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Map Container */}
              <div className="flex-1 overflow-hidden relative">
                {visualBundle ? (
                  <NarrativeMap
                    bundle={visualBundle}
                    highlightedRefs={[]}
                    onTrace={handleTrace}
                    onGoDeeper={handleGoDeeper}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center space-y-4">
                      <div className="w-12 h-12 border-4 border-neutral-700 border-t-blue-500 rounded-full animate-spin mx-auto" />
                      <p className="text-neutral-400 text-sm">
                        Loading trace visualization...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </BibleHighlightsProvider>
  );
}

export default App;
