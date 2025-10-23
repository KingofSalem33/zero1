import React, { useState, useEffect } from "react";
import CircularProgress from "./CircularProgress";
import PhaseButton from "./PhaseButton";
import ActiveSubstepCard from "./ActiveSubstepCard";

// Mobile drawer overlay component
interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-80 bg-gray-900/95 backdrop-blur-xl border-r border-gray-700/50 z-50 lg:hidden overflow-y-auto">
        {children}
      </div>
    </>
  );
};

interface Project {
  id: string;
  goal: string;
  current_phase: number;
  current_substep: number;
  phases: ProjectPhase[];
  completed_substeps?: SubstepCompletion[];
}

interface ProjectPhase {
  phase_id: string;
  phase_number: number;
  goal: string;
  completed: boolean;
  locked: boolean;
  substeps: ProjectSubstep[];
}

interface ProjectSubstep {
  substep_id: string;
  step_number: number;
  label: string;
}

interface SubstepCompletion {
  phase_number: number;
  substep_number: number;
  status: string;
}

interface RoadmapSidebarProps {
  project: Project | null;
  onViewFullRoadmap: () => void;
  onOpenFileManager: () => void;
  onOpenMemoryManager: () => void;
  onOpenNewWorkspace: () => void;
  onAskAI: () => void;
}

const RoadmapSidebar: React.FC<RoadmapSidebarProps> = ({
  project,
  onViewFullRoadmap,
  onOpenFileManager,
  onOpenMemoryManager,
  onOpenNewWorkspace,
  onAskAI,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Load collapse state from localStorage (desktop only)
    const saved = localStorage.getItem("roadmapSidebarCollapsed");
    return saved === "true";
  });
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Save collapse state to localStorage
  useEffect(() => {
    localStorage.setItem("roadmapSidebarCollapsed", String(isCollapsed));
  }, [isCollapsed]);

  if (!project) return null;

  const calculateProgress = () => {
    if (!project.phases || project.phases.length === 0) return 0;
    const completedPhases = project.phases.filter((p) => p.completed).length;
    return Math.round((completedPhases / project.phases.length) * 100);
  };

  const currentPhase = project.phases?.find(
    (p) => p.phase_number === project.current_phase,
  );
  const currentSubstep = currentPhase?.substeps?.find(
    (s) => s.step_number === project.current_substep,
  );

  const progress = calculateProgress();

  // Sidebar content (reusable for both desktop and mobile)
  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-400">ROADMAP</h3>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-800/50 rounded"
              title="Close"
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
          )}
          <button
            onClick={() => setIsCollapsed(true)}
            className="hidden lg:block text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-800/50 rounded"
            title="Collapse sidebar"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress Ring */}
      <div className="flex flex-col items-center mb-6">
        <CircularProgress value={progress} size="lg" />
        <p className="text-xs text-gray-400 mt-2 text-center line-clamp-2">
          {project.goal}
        </p>
      </div>

      {/* Phase List */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-4">
        {project.phases.map((phase) => (
          <PhaseButton
            key={phase.phase_id}
            phase={phase}
            isActive={phase.phase_number === project.current_phase}
            onClick={onViewFullRoadmap}
          />
        ))}
      </div>

      {/* Active Substep Card */}
      <ActiveSubstepCard
        phase={currentPhase || null}
        substep={currentSubstep || null}
        className="mb-4"
        onAskAI={onAskAI}
      />

      {/* Action Buttons */}
      <div className="space-y-2">
        <button
          onClick={onViewFullRoadmap}
          className="w-full px-4 py-2 rounded-lg bg-blue-600/20 border border-blue-500/50 text-blue-400 hover:bg-blue-600/30 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <span>📋</span>
          <span>Full Roadmap</span>
        </button>
        <button
          onClick={onOpenFileManager}
          className="w-full px-4 py-2 rounded-lg bg-gray-700/30 border border-gray-600/50 text-gray-300 hover:bg-gray-700/50 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <span>📁</span>
          <span>Files</span>
        </button>
        <button
          onClick={onOpenMemoryManager}
          className="w-full px-4 py-2 rounded-lg bg-gray-700/30 border border-gray-600/50 text-gray-300 hover:bg-gray-700/50 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <span>🧠</span>
          <span>Memory</span>
        </button>
        <button
          onClick={onOpenNewWorkspace}
          className="w-full px-4 py-2 rounded-lg bg-green-600/20 border border-green-500/50 text-green-400 hover:bg-green-600/30 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <span>➕</span>
          <span>New Workspace</span>
        </button>
      </div>
    </div>
  );

  if (isCollapsed) {
    return (
      <>
        {/* Desktop: Collapsed sidebar */}
        <aside className="hidden lg:flex sticky top-16 h-[calc(100vh-64px)] w-16 bg-gray-900/95 backdrop-blur-xl border-r border-gray-700/50 flex-col items-center py-4 space-y-4 z-30">
          {/* Expand button */}
          <button
            onClick={() => setIsCollapsed(false)}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800/50 rounded-lg"
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

          {/* Progress indicator */}
          <div className="text-center">
            <div className="text-xl font-bold text-white">{progress}</div>
            <div className="text-xs text-gray-500">%</div>
          </div>

          {/* Phase dots */}
          <div className="flex-1 flex flex-col items-center space-y-2 overflow-y-auto py-2">
            {project.phases.map((phase) => {
              const isActive = phase.phase_number === project.current_phase;
              let statusIcon = "⚪";
              if (phase.completed) statusIcon = "✅";
              else if (isActive) statusIcon = "🔄";
              else if (phase.locked) statusIcon = "🔒";

              return (
                <button
                  key={phase.phase_id}
                  onClick={onViewFullRoadmap}
                  className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-lg
                  transition-all hover:scale-110
                  ${isActive ? "ring-2 ring-blue-500/50 bg-blue-600/20" : "hover:bg-gray-800/50"}
                `}
                  title={`P${phase.phase_number}: ${phase.goal}`}
                >
                  {statusIcon}
                </button>
              );
            })}
          </div>

          {/* Action buttons (icon only) */}
          <div className="space-y-2">
            <button
              onClick={onViewFullRoadmap}
              className="w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-800/50 rounded-lg transition-colors"
              title="View Full Roadmap"
            >
              📋
            </button>
            <button
              onClick={onOpenFileManager}
              className="w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-800/50 rounded-lg transition-colors"
              title="Files"
            >
              📁
            </button>
            <button
              onClick={onOpenMemoryManager}
              className="w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-800/50 rounded-lg transition-colors"
              title="Memory"
            >
              🧠
            </button>
            <button
              onClick={onOpenNewWorkspace}
              className="w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-800/50 rounded-lg transition-colors"
              title="New Workspace"
            >
              ➕
            </button>
          </div>
        </aside>

        {/* Mobile: Floating Action Button */}
        <button
          onClick={() => setIsMobileDrawerOpen(true)}
          className="lg:hidden fixed bottom-6 left-6 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-white z-40 hover:scale-110 transition-transform"
          title="Open roadmap"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </button>

        {/* Mobile: Drawer */}
        <MobileDrawer
          isOpen={isMobileDrawerOpen}
          onClose={() => setIsMobileDrawerOpen(false)}
        >
          <SidebarContent onClose={() => setIsMobileDrawerOpen(false)} />
        </MobileDrawer>
      </>
    );
  }

  return (
    <>
      {/* Desktop: Expanded sidebar */}
      <aside className="hidden lg:flex sticky top-16 h-[calc(100vh-64px)] w-72 bg-gray-900/95 backdrop-blur-xl border-r border-gray-700/50 flex-col z-30 overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Mobile: Floating Action Button */}
      <button
        onClick={() => setIsMobileDrawerOpen(true)}
        className="lg:hidden fixed bottom-6 left-6 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-white z-40 hover:scale-110 transition-transform"
        title="Open roadmap"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      </button>

      {/* Mobile: Drawer */}
      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
      >
        <SidebarContent onClose={() => setIsMobileDrawerOpen(false)} />
      </MobileDrawer>
    </>
  );
};

export default RoadmapSidebar;
