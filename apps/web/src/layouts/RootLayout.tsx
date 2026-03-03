import React, { useState, useEffect, useCallback, Suspense } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import "../App.css";
import RoadmapSidebarV2 from "../components/RoadmapSidebarV2";
import MobileBottomNav from "../components/MobileBottomNav";
import MobileHeader from "../components/MobileHeader";
import { useAuth } from "../contexts/AuthContext";
import { BibleHighlightsProvider } from "../contexts/BibleHighlightsContext";
import { BibleBookmarksProvider } from "../contexts/BibleBookmarksContext";
import { ToastProvider } from "../components/Toast";
import { NarrativeMap } from "../components/golden-thread/NarrativeMap";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { addVerseNavigationListener } from "../utils/verseNavigation";
import { parseVerseReference, bookToUrlParam } from "../utils/bibleReference";
import { AppProvider } from "../contexts/AppContext";
import type { Chat } from "../contexts/AppContext";
import type { VisualContextBundle } from "../types/goldenThread";
import type { GoDeeperPayload } from "../types/chat";
import OnboardingOverlay from "../components/onboarding/OnboardingOverlay";
import { WEB_ENV } from "../lib/env";

const API_URL = WEB_ENV.API_URL;
const MAX_SAVED_CHATS = 50;

export default function RootLayout() {
  const { loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [toolsUsed, setToolsUsed] = useState([]);

  // Derive active view from URL
  const activeView: "reader" | "chat" | "library" =
    location.pathname.startsWith("/read")
      ? "reader"
      : location.pathname.startsWith("/chat")
        ? "chat"
        : location.pathname.startsWith("/library")
          ? "library"
          : "reader";

  // Chat history state
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentMessages, setCurrentMessages] = useState<any[]>([]);
  const [bibleStudyMode, setBibleStudyMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Trace visualization state
  const [showVisualization, setShowVisualization] = useState(false);
  const [visualBundle, setVisualBundle] = useState<VisualContextBundle | null>(
    null,
  );
  const [tracedText, setTracedText] = useState<string>("");
  const [traceAnchorRef, setTraceAnchorRef] = useState<string | undefined>(
    undefined,
  );

  // Focus trap for visualization modal
  const visualizationRef = useFocusTrap<HTMLDivElement>(showVisualization, {
    onEscape: () => setShowVisualization(false),
  });

  // Load chat history and sidebar state from localStorage
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
        if (saved === "true") setSidebarCollapsed(true);
      } catch (error) {
        console.error("Failed to load sidebar state:", error);
      }
    };

    if (typeof window.requestIdleCallback !== "undefined") {
      window.requestIdleCallback(() => {
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
      setCurrentChatId(`chat_${Date.now()}`);
    }
  }, []);

  // Save chats to localStorage
  useEffect(() => {
    try {
      const chatsToSave = chats.slice(-MAX_SAVED_CHATS);
      localStorage.setItem("chatHistory", JSON.stringify(chatsToSave));
    } catch (error) {
      if (error instanceof Error && error.name === "QuotaExceededError") {
        console.warn("localStorage quota exceeded, trimming chat history");
        try {
          // Progressively reduce until it fits
          const half = Math.max(1, Math.floor(chats.length / 2));
          const trimmed = chats.slice(-half);
          localStorage.setItem("chatHistory", JSON.stringify(trimmed));
        } catch {
          localStorage.removeItem("chatHistory");
        }
      }
    }
  }, [chats]);

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

  // Trace handler
  const handleTrace = useCallback(
    async (selectedText: string, anchorRef?: string) => {
      try {
        setTracedText(selectedText);
        setTraceAnchorRef(anchorRef);
        setShowVisualization(true);
        setVisualBundle(null);
        const response = await fetch(`${API_URL}/api/trace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: selectedText }),
        });
        if (!response.ok) {
          console.error("[RootLayout] Trace API error:", await response.json());
          return;
        }
        const bundle: VisualContextBundle = await response.json();
        setVisualBundle(bundle);
      } catch (error) {
        console.error(
          "[RootLayout] Failed to fetch trace visualization:",
          error,
        );
        setShowVisualization(false);
      }
    },
    [],
  );

  const handleGoDeeper = useCallback(
    (prompt: GoDeeperPayload) => {
      navigate("/chat", { state: { prompt } });
      setBibleStudyMode(true);
    },
    [navigate],
  );

  const handleShowVisualization = useCallback((bundle: VisualContextBundle) => {
    setVisualBundle(bundle);
    setShowVisualization(true);
  }, []);

  // Chat management
  const handleNewChat = useCallback(() => {
    navigate("/chat");
    // Save current chat if it has messages
    if (currentMessages.length > 0 && currentChatId) {
      const firstUserMessage = currentMessages.find((m) => m.type === "user");
      const title = firstUserMessage?.content.slice(0, 50) || "New Chat";
      const lastAiMessage = [...currentMessages]
        .reverse()
        .find((m) => m.type === "ai");
      const lastMessage = lastAiMessage?.content.slice(0, 100) || "";

      setChats((prev) => {
        let updated: Chat[];
        const existingIndex = prev.findIndex((c) => c.id === currentChatId);
        if (existingIndex >= 0) {
          updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            messages: currentMessages,
            lastMessage,
            timestamp: new Date(),
          };
        } else {
          updated = [
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
        // Trim oldest chats when exceeding limit
        if (updated.length > MAX_SAVED_CHATS) {
          updated = updated.slice(-MAX_SAVED_CHATS);
        }
        return updated;
      });
    }
    const newChatId = `chat_${Date.now()}`;
    setCurrentChatId(newChatId);
    setCurrentMessages([]);
  }, [navigate, currentMessages, currentChatId]);

  const handleSelectChat = useCallback(
    (chatId: string) => {
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

      const chat = chats.find((c) => c.id === chatId);
      if (chat) {
        setCurrentChatId(chatId);
        setCurrentMessages(chat.messages);
        navigate(`/chat/${chatId}`);
      }
    },
    [chats, currentMessages, currentChatId, navigate],
  );

  // Verse navigation listener â€” navigate to reader route, passing current location for back button
  useEffect(() => {
    return addVerseNavigationListener((reference) => {
      const parsed = parseVerseReference(reference);
      if (parsed) {
        setBibleStudyMode(false);
        navigate(
          {
            pathname: `/read/${bookToUrlParam(parsed.book)}/${parsed.chapter}`,
            hash: `#${parsed.verse}`,
          },
          {
            state: {
              cameFrom: location.pathname + location.search + location.hash,
            },
          },
        );
      }
    });
  }, [navigate, location]);

  // Navigation handlers for sidebar and mobile nav
  const handleNavigateView = useCallback(
    (view: "reader" | "chat" | "library") => {
      if (view === "reader") {
        const lastBook = localStorage.getItem("lastBibleBook") || "Matthew";
        const lastChapter = localStorage.getItem("lastBibleChapter") || "1";
        navigate(`/read/${bookToUrlParam(lastBook)}/${lastChapter}`);
        setBibleStudyMode(false);
      } else if (view === "chat") {
        navigate("/chat");
        setBibleStudyMode(true);
      } else {
        navigate("/library");
        setBibleStudyMode(false);
      }
    },
    [navigate],
  );

  const viewTitle =
    activeView === "reader"
      ? "Bible"
      : activeView === "chat"
        ? "Chat"
        : "Library";

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <BibleHighlightsProvider>
        <BibleBookmarksProvider>
          <AppProvider
            value={{
              chats,
              setChats,
              currentChatId,
              setCurrentChatId,
              currentMessages,
              setCurrentMessages,
              handleTrace,
              handleGoDeeper,
              handleShowVisualization,
              handleNewChat,
              handleSelectChat,
              bibleStudyMode,
              setBibleStudyMode,
              toolsUsed,
              setToolsUsed,
            }}
          >
            <div className="min-h-[100dvh] bg-gradient-to-br from-gray-950 via-black to-gray-950">
              <div className="flex">
                {/* Left Sidebar */}
                <RoadmapSidebarV2
                  project={null}
                  onOpenFileManager={() => {}}
                  onOpenMemoryManager={() => {}}
                  onAskAI={() => {}}
                  currentChatId={currentChatId || undefined}
                  chats={chats}
                  onNewChat={handleNewChat}
                  onSelectChat={handleSelectChat}
                  showBible={activeView === "reader"}
                  onToggleBible={() => handleNavigateView("reader")}
                  onEnterBibleStudy={() => handleNavigateView("chat")}
                  onOpenLibrary={() => handleNavigateView("library")}
                  isCollapsed={sidebarCollapsed}
                  onToggleCollapse={setSidebarCollapsed}
                  activeView={activeView}
                />

                {/* Mobile Header */}
                <MobileHeader
                  title={viewTitle}
                  onMenuToggle={() => setSidebarCollapsed(false)}
                />

                {/* Main Workspace */}
                <main
                  className={`flex-1 h-[100dvh] box-border overflow-hidden relative transition-all duration-300 pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-0 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0 ${
                    sidebarCollapsed ? "md:ml-16" : "md:ml-64"
                  }`}
                >
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center min-h-[100dvh]">
                        <div className="w-12 h-12 border-4 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    }
                  >
                    <Outlet />
                  </Suspense>
                </main>

                {/* Mobile Bottom Navigation */}
                <MobileBottomNav
                  activeView={activeView}
                  onNavigate={handleNavigateView}
                />
              </div>

              {/* Onboarding - only on reader view */}
              {activeView === "reader" && <OnboardingOverlay />}

              {/* Trace Visualization Modal */}
              {showVisualization && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <div
                    ref={visualizationRef}
                    className="w-[90vw] h-[90vh] bg-neutral-900 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="visualization-title"
                  >
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
                    <div className="flex-1 min-h-0 overflow-hidden relative">
                      <NarrativeMap
                        bundle={visualBundle}
                        highlightedRefs={[]}
                        onTrace={handleTrace}
                        onGoDeeper={handleGoDeeper}
                        tracedText={tracedText}
                        preloadAnchorRef={traceAnchorRef}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AppProvider>
        </BibleBookmarksProvider>
      </BibleHighlightsProvider>
    </ToastProvider>
  );
}


