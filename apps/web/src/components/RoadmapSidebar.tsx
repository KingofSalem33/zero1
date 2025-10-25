import React, { useState, useEffect } from "react";
import CircularProgress from "./CircularProgress";
import PhaseButton from "./PhaseButton";

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
  completed?: boolean;
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
  onCompleteSubstep: (substepId: string) => void;
}

const RoadmapSidebar: React.FC<RoadmapSidebarProps> = ({
  project,
  onViewFullRoadmap,
  onOpenFileManager,
  onOpenMemoryManager,
  onOpenNewWorkspace,
  onAskAI,
  onCompleteSubstep,
}) => {
  const [completingSubstep, setCompletingSubstep] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Load collapse state from localStorage (desktop only)
    const saved = localStorage.getItem("roadmapSidebarCollapsed");
    return saved === "true";
  });
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isRoadmapExpanded, setIsRoadmapExpanded] = useState(() => {
    // Load roadmap expansion state from localStorage
    const saved = localStorage.getItem("roadmapExpanded");
    return saved !== "false"; // Default to expanded
  });
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(() => {
    // Auto-expand current phase on mount
    return (
      project?.phases?.find((p) => p.phase_number === project.current_phase)
        ?.phase_id || null
    );
  });

  // Save collapse state to localStorage
  useEffect(() => {
    localStorage.setItem("roadmapSidebarCollapsed", String(isCollapsed));
  }, [isCollapsed]);

  // Save roadmap expansion state to localStorage
  useEffect(() => {
    localStorage.setItem("roadmapExpanded", String(isRoadmapExpanded));
  }, [isRoadmapExpanded]);

  // Auto-expand active phase when it changes
  useEffect(() => {
    if (project?.current_phase) {
      const currentPhaseObj = project.phases?.find(
        (p) => p.phase_number === project.current_phase,
      );
      if (currentPhaseObj) {
        setExpandedPhaseId(currentPhaseObj.phase_id);
      }
    }
  }, [project?.current_phase, project?.phases]);

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
    <div className="flex flex-col h-full">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 pb-0">
        <h3 className="text-sm font-semibold text-gray-400">ZERO1 BUILDER</h3>
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

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden hover:pr-2 p-4">
        {/* Progress Ring */}
        <div className="flex flex-col items-center mb-6">
          <CircularProgress value={progress} size="lg" />
          <p className="text-xs text-gray-400 mt-2 text-center line-clamp-2">
            {project.goal}
          </p>
        </div>

        {/* Unified Roadmap Dropdown */}
        <div className="mb-4">
          {/* Roadmap Card */}
          <div className="rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/50 shadow-lg shadow-blue-500/20 overflow-hidden">
            {/* Header - Clickable to expand/collapse */}
            <button
              onClick={() => setIsRoadmapExpanded(!isRoadmapExpanded)}
              className="w-full p-4 pb-3 text-left transition-all hover:shadow-xl"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">📋</span>
                  <span className="text-xs font-bold text-blue-400 tracking-wider">
                    ROADMAP
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-xs text-blue-300">In Progress</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isRoadmapExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              <div className="flex items-baseline gap-2 mb-2">
                <div className="text-2xl font-black text-white">
                  P{currentPhase?.phase_number}.{currentSubstep?.step_number}
                </div>
                <div className="text-xs text-gray-400">
                  / {currentPhase?.goal}
                </div>
              </div>

              <div className="text-sm text-gray-200 leading-relaxed">
                {currentSubstep?.label}
              </div>
            </button>

            {/* Action Buttons - Not nested in the toggle button */}
            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={() => onAskAI?.()}
                className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-bold transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
              >
                <svg
                  className="w-4 h-4 group-hover:rotate-12 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span>Ask AI</span>
              </button>

              <button
                onClick={() => {
                  if (
                    !currentSubstep ||
                    completingSubstep ||
                    currentSubstep.completed
                  )
                    return;
                  setCompletingSubstep(true);
                  // Add delay for celebration animation
                  setTimeout(() => {
                    onCompleteSubstep(currentSubstep.substep_id);
                    setCompletingSubstep(false);
                  }, 600);
                }}
                disabled={completingSubstep || currentSubstep?.completed}
                className={`flex-shrink-0 w-12 h-12 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${
                  currentSubstep?.completed
                    ? "border-green-500 bg-green-500"
                    : completingSubstep
                      ? "border-green-500 bg-green-500 scale-110"
                      : "border-gray-500 hover:border-green-400 hover:bg-green-500/20"
                }`}
                title={
                  currentSubstep?.completed ? "Completed" : "Mark as complete"
                }
              >
                {currentSubstep?.completed || completingSubstep ? (
                  <svg
                    className={`w-6 h-6 text-white ${completingSubstep ? "animate-bounce" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : null}
              </button>
            </div>

            {/* Progress Footer */}
            <div className="px-4 py-2 bg-blue-900/20 border-t border-blue-500/30">
              <div className="text-xs text-blue-300">
                {project.phases.filter((p) => p.completed).length} of{" "}
                {project.phases.length} phases complete
              </div>
            </div>
          </div>

          {/* Expanded Phase List */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isRoadmapExpanded ? "opacity-100 mt-2" : "max-h-0 opacity-0"
            }`}
          >
            <div className="space-y-2">
              {project.phases.map((phase) => (
                <PhaseButton
                  key={phase.phase_id}
                  phase={phase}
                  isActive={phase.phase_number === project.current_phase}
                  isExpanded={expandedPhaseId === phase.phase_id}
                  currentSubstep={
                    phase.phase_number === project.current_phase
                      ? project.current_substep
                      : undefined
                  }
                  onToggleExpand={() =>
                    setExpandedPhaseId((prev) =>
                      prev === phase.phase_id ? null : phase.phase_id,
                    )
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons - Fixed at bottom */}
      <div className="flex-shrink-0 p-4 pt-0 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenFileManager}
            className="group px-3 py-2.5 rounded-lg bg-gray-700/30 border border-gray-600/50 text-gray-300 hover:bg-gray-700/50 hover:border-gray-500/70 transition-all hover:shadow-md flex flex-col items-center gap-1 text-xs font-medium"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">
              📁
            </span>
            <span>Files</span>
          </button>
          <button
            onClick={onOpenMemoryManager}
            className="group px-3 py-2.5 rounded-lg bg-gray-700/30 border border-gray-600/50 text-gray-300 hover:bg-gray-700/50 hover:border-gray-500/70 transition-all hover:shadow-md flex flex-col items-center gap-1 text-xs font-medium"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">
              🧠
            </span>
            <span>Memory</span>
          </button>
        </div>

        <button
          onClick={onOpenNewWorkspace}
          className="group w-full px-4 py-2.5 rounded-lg bg-green-600/20 border border-green-500/50 text-green-400 hover:bg-green-600/30 hover:border-green-400/70 transition-all hover:shadow-lg hover:shadow-green-500/20 flex items-center justify-center gap-2 text-sm font-semibold"
        >
          <span className="text-base group-hover:rotate-90 transition-transform">
            ➕
          </span>
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
