import React, { useState, useEffect, lazy, Suspense, useCallback } from "react";
import "./App.css";
import RoadmapSidebarV2 from "./components/RoadmapSidebarV2";
import { useAuth } from "./contexts/AuthContext";
import { BibleHighlightsProvider } from "./contexts/BibleHighlightsContext";
import { ToastProvider } from "./components/Toast";
import type { VisualContextBundle } from "./types/goldenThread";
import type { GoDeeperPayload } from "./types/chat";
import { NarrativeMap } from "./components/golden-thread/NarrativeMap";
import { addVerseNavigationListener } from "./utils/verseNavigation";
import { useFocusTrap } from "./hooks/useFocusTrap";
import MobileBottomNav from "./components/MobileBottomNav";
import MobileHeader from "./components/MobileHeader";
import { WEB_ENV } from "./lib/env";

// Lazy load heavy components for code splitting
const UnifiedWorkspace = lazy(() => import("./components/UnifiedWorkspace"));
const BibleReader = lazy(() => import("./components/BibleReader"));
const LibraryView = lazy(() => import("./components/LibraryView"));

const API_URL = WEB_ENV.API_URL;

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
  const [viewMode, setViewMode] = useState<"reader" | "chat" | "library">(
    "reader",
  );
  const [bibleStudyMode, setBibleStudyMode] = useState(false);
  const [pendingVerseReference, setPendingVerseReference] = useState<
    string | null
  >(null);
  const [pendingChatPrompt, setPendingChatPrompt] =
    useState<GoDeeperPayload | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Trace visualization state (lifted to App level for use from any context)
  const [showVisualization, setShowVisualization] = useState(false);
  const [visualBundle, setVisualBundle] = useState<VisualContextBundle | null>(
    null,
  );
  const [tracedText, setTracedText] = useState<string>("");

  // Focus trap for visualization modal
  const visualizationRef = useFocusTrap<HTMLDivElement>(showVisualization, {
    onEscape: () => setShowVisualization(false),
  });

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
    setBibleStudyMode(false);
    setViewMode("reader");
  };

  // Navigate from Bible to Chat with a prompt
  const handleNavigateToChat = (prompt: GoDeeperPayload) => {
    setViewMode("chat"); // Switch to chat view
    setBibleStudyMode(true);
    setPendingChatPrompt(prompt); // Queue the prompt
  };

  // Canonical trace handler - shows map visualization (used from any context)
  const handleTrace = useCallback(async (selectedText: string) => {
    try {
      console.log("[App] Trace requested for:", selectedText);

      // Show visualization panel immediately with loading state
      setTracedText(selectedText);
      setShowVisualization(true);
      setVisualBundle(null); // Clear previous bundle

      // Call the trace API endpoint
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
        "[App] âœ… Received trace bundle:",
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
  const handleGoDeeper = useCallback((prompt: GoDeeperPayload) => {
    console.log("[App] Go Deeper requested with prompt:", prompt);
    handleNavigateToChat(prompt);
  }, []);

  // Show visualization with existing bundle (for map icon in Bible study)
  const handleShowVisualization = useCallback((bundle: VisualContextBundle) => {
    console.log("[App] Showing visualization with bundle:", bundle);
    setVisualBundle(bundle);
    setShowVisualization(true);
  }, []);

  // Enter Bible Study (just show chat view)
  const handleEnterBibleStudy = () => {
    setViewMode("chat");
    setBibleStudyMode(true);
  };

  // Open Highlights
  const handleOpenLibrary = () => {
    setBibleStudyMode(false);
    setViewMode("library");
  };

  const handleResetBibleStudy = () => {
    setBibleStudyMode(true);
    handleNewChat();
  };

  // Navigate from Highlights to Bible verse
  const handleNavigateToVerse = (reference?: string) => {
    setViewMode("reader");
    setBibleStudyMode(false);
    if (reference) {
      setPendingVerseReference(reference);
    }
  };

  useEffect(() => {
    return addVerseNavigationListener((reference) => {
      setViewMode("reader");
      setBibleStudyMode(false);
      setPendingVerseReference(reference);
    });
  }, []);

  // Save chats to localStorage whenever they change
  useEffect(() => {
    try {
      // Keep only the last 50 chats to prevent storage overflow
      const chatsToSave = chats.slice(-50);
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
    <ToastProvider>
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
              onOpenLibrary={handleOpenLibrary}
              isCollapsed={sidebarCollapsed}
              onToggleCollapse={setSidebarCollapsed}
              activeView={viewMode}
            />

            {/* Mobile Header */}
            <MobileHeader
              title={
                viewMode === "reader"
                  ? "Bible"
                  : viewMode === "chat"
                    ? "Chat"
                    : "Library"
              }
              onMenuToggle={() => setSidebarCollapsed(false)}
            />

            {/* Main Workspace - Renders only the active view */}
            <main
              className={`flex-1 h-screen overflow-hidden relative transition-all duration-300 pt-12 md:pt-0 pb-16 md:pb-0 ${
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
                    onOpenMap={handleShowVisualization}
                    pendingVerseReference={pendingVerseReference}
                    onVerseNavigationComplete={() =>
                      setPendingVerseReference(null)
                    }
                  />
                ) : viewMode === "library" ? (
                  <LibraryView
                    onGoDeeper={handleGoDeeper}
                    onOpenMap={handleShowVisualization}
                    onNavigateToVerse={handleNavigateToVerse}
                    onExploreBible={handleToggleBible}
                  />
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
                    bibleStudyMode={bibleStudyMode}
                    onExitBibleStudy={() => setBibleStudyMode(false)}
                    onResetBibleStudy={handleResetBibleStudy}
                    onTrace={handleTrace}
                    onGoDeeper={handleGoDeeper}
                    onShowVisualization={handleShowVisualization}
                  />
                )}
              </Suspense>
            </main>

            {/* Mobile Bottom Navigation */}
            <MobileBottomNav
              activeView={viewMode}
              onNavigate={(view) => {
                setViewMode(view);
                if (view === "reader") setBibleStudyMode(false);
                if (view === "chat") setBibleStudyMode(true);
                if (view === "library") setBibleStudyMode(false);
              }}
            />
          </div>

          {/* Trace Visualization Panel - Global overlay */}
          {showVisualization && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <div
                ref={visualizationRef}
                className="w-[90vw] h-[90vh] bg-neutral-900 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                role="dialog"
                aria-modal="true"
                aria-labelledby="visualization-title"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-neutral-950/40 backdrop-blur-sm">
                  <span
                    id="visualization-title"
                    className="text-[11px] font-normal text-neutral-500"
                  >
                    {visualBundle?.nodes?.length
                      ? `${visualBundle.nodes.length} verses`
                      : ""}
                  </span>
                  <button
                    onClick={() => setShowVisualization(false)}
                    className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 text-neutral-500 hover:text-neutral-300 transition-all duration-150 flex items-center justify-center"
                    title="Close"
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                <div className="flex-1 min-h-0 overflow-hidden relative">
                  <NarrativeMap
                    bundle={visualBundle}
                    highlightedRefs={[]}
                    onTrace={handleTrace}
                    onGoDeeper={handleGoDeeper}
                    tracedText={tracedText}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </BibleHighlightsProvider>
    </ToastProvider>
  );
}

export default App;


