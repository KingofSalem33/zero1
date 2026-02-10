import React from "react";

interface MobileBottomNavProps {
  activeView: "reader" | "chat" | "library";
  onNavigate: (view: "reader" | "chat" | "library") => void;
}

const tabs = [
  {
    view: "reader" as const,
    label: "Read",
    icon: (
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
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    view: "chat" as const,
    label: "Chat",
    icon: (
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
    ),
  },
  {
    view: "library" as const,
    label: "Library",
    icon: (
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
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    ),
  },
];

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onNavigate,
}) => {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 md:hidden z-50 bg-neutral-900/90 backdrop-blur-xl border-t border-white/10"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch h-16">
        {tabs.map((tab) => {
          const isActive = activeView === tab.view;
          return (
            <button
              key={tab.view}
              onClick={() => onNavigate(tab.view)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors duration-150 relative ${
                isActive
                  ? "text-[#D4AF37]"
                  : "text-neutral-500 active:text-neutral-300"
              }`}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#D4AF37] rounded-full" />
              )}
              {tab.icon}
              <span className="text-[10px] font-medium tracking-wide">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
