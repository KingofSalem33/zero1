interface Tab {
  key: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === tab.key
              ? "bg-neutral-800/60 backdrop-blur-md border border-amber-300/20 text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              : "bg-neutral-800/40 backdrop-blur-sm border border-amber-200/[0.08] text-neutral-400 hover:bg-neutral-800/50 hover:border-amber-200/[0.12] hover:text-neutral-300"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
