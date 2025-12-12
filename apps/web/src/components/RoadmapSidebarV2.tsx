import React, { useState, useEffect } from "react";

interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
}

// Helper function to format time ago
function getTimeAgo(timestamp: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(timestamp).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface RoadmapSidebarV2Props {
  project: any;
  onOpenFileManager: () => void;
  onOpenMemoryManager: () => void;
  onAskAI: () => void;
  onRefreshProject?: () => void;
  onExitToLibrary?: () => void;
  currentChatId?: string;
  chats?: Chat[];
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
}

const RoadmapSidebarV2: React.FC<RoadmapSidebarV2Props> = ({
  project: _project,
  currentChatId,
  chats = [],
  onNewChat,
  onSelectChat,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem("roadmapCollapsed");
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("roadmapCollapsed", String(isCollapsed));
  }, [isCollapsed]);

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
          onClick={() => setIsCollapsed(true)}
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
        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-neutral-700 hover:border-brand-primary-500 hover:bg-neutral-800/50 text-neutral-400 hover:text-brand-primary-400 transition-all group"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-sm font-medium">New Chat</span>
        </button>

        {/* Recent Chats */}
        <div className="pt-2">
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-2 mb-2">
            Recent Chats
          </h4>
          <div className="space-y-1">
            {chats.length === 0 ? (
              <div className="text-center py-8 px-2">
                <div className="text-neutral-600 text-sm">No chats yet</div>
              </div>
            ) : (
              chats.map((chat) => {
                const timeAgo = getTimeAgo(chat.timestamp);
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
                    <div className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 mt-0.5 flex-shrink-0 text-neutral-500"
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div
                            className={`text-sm font-medium truncate flex-1 ${
                              currentChatId === chat.id
                                ? "text-brand-primary-300"
                                : "text-neutral-300"
                            }`}
                          >
                            {chat.title}
                          </div>
                          <div className="text-xs text-neutral-600 flex-shrink-0">
                            {timeAgo}
                          </div>
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                          {chat.lastMessage || "No messages yet"}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Collapsed State - Floating Expand Button */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="fixed left-4 top-20 z-50 p-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg shadow-lg transition-all"
          title="Expand sidebar"
        >
          <svg
            className="w-5 h-5 text-neutral-300"
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
      )}

      {/* Expanded Sidebar */}
      {!isCollapsed && (
        <>
          {/* Desktop Sidebar */}
          <aside className="hidden md:flex flex-col w-80 bg-neutral-900/50 border-r border-neutral-800/50 h-full">
            <SidebarContent />
          </aside>

          {/* Mobile Overlay */}
          <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
            <aside className="w-80 bg-neutral-900 border-r border-neutral-800 h-full shadow-2xl">
              <SidebarContent />
            </aside>
          </div>
        </>
      )}
    </>
  );
};

export default RoadmapSidebarV2;
