import React, { useState, useEffect } from "react";
import { useBibleHighlightsContext } from "../contexts/BibleHighlightsContext";

interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
}

interface RoadmapSidebarV2Props {
  project: unknown;
  onOpenFileManager: () => void;
  onOpenMemoryManager: () => void;
  onAskAI: () => void;
  onRefreshProject?: () => void;
  onExitToLibrary?: () => void;
  currentChatId?: string;
  chats?: Chat[];
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  showBible?: boolean;
  onToggleBible?: () => void;
  onEnterBibleStudy?: () => void;
  onOpenLibrary?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  activeView?: "reader" | "chat" | "library";
}

const RoadmapSidebarV2: React.FC<RoadmapSidebarV2Props> = ({
  currentChatId,
  chats = [],
  onNewChat: _onNewChat,
  onSelectChat,
  showBible = false,
  onToggleBible,
  onEnterBibleStudy,
  onOpenLibrary,
  isCollapsed = false,
  onToggleCollapse,
  activeView = "reader",
}) => {
  const { highlights } = useBibleHighlightsContext();
  const highlightCount = highlights.length;

  const [showRecentChats, setShowRecentChats] = useState(() => {
    const saved = localStorage.getItem("showRecentChats");
    return saved !== "false"; // Default to true
  });

  useEffect(() => {
    localStorage.setItem("showRecentChats", String(showRecentChats));
  }, [showRecentChats]);

  const handleToggleCollapse = (collapsed: boolean) => {
    localStorage.setItem("roadmapCollapsed", String(collapsed));
    onToggleCollapse?.(collapsed);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-4 border-b border-neutral-700/50">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-brand-primary-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          <h3 className="text-sm font-bold text-white tracking-wide">
            Biblelot
          </h3>
        </div>
        <button
          onClick={() => handleToggleCollapse(true)}
          className="text-neutral-400 hover:text-white transition-colors p-1.5 hover:bg-neutral-700/30 rounded"
          title="Collapse sidebar"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Content - Chat History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Action Buttons */}
        <div className="space-y-1 mb-4">
          {/* Bible Toggle Button */}
          <button
            onClick={onToggleBible}
            className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              showBible
                ? "bg-brand-primary-500/20 text-brand-primary-300"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300"
            }`}
          >
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <span className="text-sm font-medium">Bible</span>
          </button>

          {/* Chat Button */}
          <button
            onClick={onEnterBibleStudy}
            className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              activeView === "chat"
                ? "bg-brand-primary-500/20 text-brand-primary-300"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300"
            }`}
          >
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span className="text-sm font-medium">Chat</span>
          </button>

          {/* Library Button */}
          <button
            onClick={onOpenLibrary}
            className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              activeView === "library"
                ? "bg-brand-primary-500/20 text-brand-primary-300"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300"
            }`}
          >
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
            <span className="text-sm font-medium">Library</span>
            {highlightCount > 0 && activeView !== "library" && (
              <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#D4AF37]/20 text-[#D4AF37] text-[10px] font-bold leading-none px-1">
                {highlightCount > 99 ? "99+" : highlightCount}
              </span>
            )}
          </button>
        </div>

        {/* Recent Chats */}
        <div className="pt-2">
          <button
            onClick={() => setShowRecentChats(!showRecentChats)}
            className="w-full flex items-center gap-2 px-4 py-2 text-neutral-400 hover:text-neutral-300 transition-colors"
          >
            <span className="text-xs font-medium">Recent Chats</span>
            {chats.length > 0 && (
              <span className="text-[10px] text-neutral-500 ml-auto mr-1">
                {chats.length}
              </span>
            )}
            <svg
              className={`w-3 h-3 flex-shrink-0 transition-transform ${
                showRecentChats ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
          {showRecentChats && (
            <div className="space-y-1">
              {chats.length === 0 ? (
                <div className="text-center py-8 px-2">
                  <div className="text-neutral-500 text-sm">No chats yet</div>
                </div>
              ) : (
                chats.map((chat) => {
                  // Capitalize first letter and truncate to 4 words
                  const words = chat.title.split(" ");
                  const truncatedTitle = words.slice(0, 4).join(" ");
                  const capitalizedTitle =
                    truncatedTitle.charAt(0).toUpperCase() +
                    truncatedTitle.slice(1);

                  return (
                    <button
                      key={chat.id}
                      onClick={() => onSelectChat?.(chat.id)}
                      className={`w-full text-left px-4 py-2 rounded-lg transition-all group ${
                        currentChatId === chat.id
                          ? "bg-brand-primary-500/20 border border-brand-primary-500/30"
                          : "hover:bg-neutral-800/50 border border-transparent"
                      }`}
                    >
                      <div
                        className={`text-sm font-medium truncate ${
                          currentChatId === chat.id
                            ? "text-brand-primary-300"
                            : "text-neutral-300"
                        }`}
                      >
                        {capitalizedTitle}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar - Always visible, toggles between narrow and wide */}
      <aside
        className={`hidden md:flex flex-col bg-neutral-900/50 border-r border-neutral-800/50 fixed left-0 top-0 h-screen z-40 transition-all duration-300 ${
          isCollapsed ? "w-16" : "w-64"
        }`}
      >
        {isCollapsed ? (
          // Collapsed: Icon-only view
          <div className="flex flex-col h-full py-4">
            {/* Expand button at top */}
            <button
              onClick={() => handleToggleCollapse(false)}
              className="mx-auto mb-6 p-2 text-neutral-400 hover:text-white transition-colors"
              title="Expand sidebar"
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            {/* Icon-only buttons */}
            <div className="flex-1 flex flex-col items-center gap-4 px-2">
              {/* Bible Toggle */}
              <button
                onClick={onToggleBible}
                className={`p-3 rounded-lg transition-all ${
                  showBible
                    ? "bg-brand-primary-500/20 text-brand-primary-300"
                    : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300"
                }`}
                title="Bible"
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
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </button>

              {/* Chat */}
              <button
                onClick={onEnterBibleStudy}
                className={`p-3 rounded-lg transition-all ${
                  activeView === "chat"
                    ? "bg-brand-primary-500/20 text-brand-primary-300"
                    : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300"
                }`}
                title="Chat"
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
                    strokeWidth={1.8}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </button>

              {/* Library */}
              <button
                onClick={onOpenLibrary}
                className={`p-3 rounded-lg transition-all ${
                  activeView === "library"
                    ? "bg-brand-primary-500/20 text-brand-primary-300"
                    : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300"
                }`}
                title="Library"
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
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          // Expanded: Full sidebar
          <SidebarContent />
        )}
      </aside>

      {/* Mobile Overlay - Only when expanded */}
      {!isCollapsed && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => handleToggleCollapse(true)}
        >
          <aside
            className="w-64 bg-neutral-900 border-r border-neutral-800 h-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
};

export default RoadmapSidebarV2;
