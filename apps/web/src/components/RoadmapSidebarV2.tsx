import React, { useState, useEffect } from "react";

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
  onOpenHighlights?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

const RoadmapSidebarV2: React.FC<RoadmapSidebarV2Props> = ({
  currentChatId,
  chats = [],
  onNewChat: _onNewChat,
  onSelectChat,
  showBible = false,
  onToggleBible,
  onEnterBibleStudy,
  onOpenHighlights,
  isCollapsed = false,
  onToggleCollapse,
}) => {
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
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-700/50">
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
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
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
            <span className="text-sm font-medium">
              {showBible ? "Close Bible" : "Open Bible"}
            </span>
          </button>

          {/* Bible Study Button */}
          <button
            onClick={onEnterBibleStudy}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300 transition-all"
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
            <svg
              className="w-4 h-4 flex-shrink-0 -ml-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <span className="text-sm font-medium">Bible Study</span>
          </button>

          {/* Highlights Button */}
          <button
            onClick={onOpenHighlights}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300 transition-all"
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
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
            <span className="text-sm font-medium">Highlights</span>
          </button>
        </div>

        {/* Recent Chats */}
        <div className="pt-2">
          <button
            onClick={() => setShowRecentChats(!showRecentChats)}
            className="w-full flex items-center gap-2 px-3 py-2 text-neutral-400 hover:text-neutral-300 transition-colors"
          >
            <span className="text-xs font-medium">Recent Chats</span>
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
                  <div className="text-neutral-600 text-sm">No chats yet</div>
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
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group ${
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
                title={showBible ? "Close Bible" : "Open Bible"}
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

              {/* Bible Study */}
              <button
                onClick={onEnterBibleStudy}
                className="p-3 rounded-lg text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300 transition-all"
                title="Bible Study"
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
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </button>

              {/* Highlights */}
              <button
                onClick={onOpenHighlights}
                className="p-3 rounded-lg text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300 transition-all"
                title="Highlights"
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
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
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
        <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <aside className="w-64 bg-neutral-900 border-r border-neutral-800 h-full shadow-2xl">
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
};

export default RoadmapSidebarV2;
