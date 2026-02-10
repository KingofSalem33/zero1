import React from "react";

interface MobileHeaderProps {
  title: string;
  onMenuToggle: () => void;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ title, onMenuToggle }) => {
  return (
    <header className="fixed top-0 left-0 right-0 md:hidden z-40 bg-neutral-900/80 backdrop-blur-xl border-b border-white/10 h-12 flex items-center px-4">
      <button
        onClick={onMenuToggle}
        className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors rounded-lg"
        aria-label="Open menu"
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
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>
      <span className="flex-1 text-center text-sm font-semibold text-neutral-200 tracking-wide">
        {title}
      </span>
      {/* Spacer to balance the hamburger button */}
      <div className="w-9" />
    </header>
  );
};

export default MobileHeader;
