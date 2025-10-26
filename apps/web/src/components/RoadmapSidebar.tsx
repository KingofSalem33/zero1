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
        className="fixed inset-0 bg-black/70 z-40 lg:hidden"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-80 bg-neutral-900 border-r border-neutral-700/50 z-50 lg:hidden overflow-y-auto shadow-2xl">
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

// Helper to convert phase format: "P1" -> 1, or pass through if already number
const getPhaseNumber = (phase: string | number): number => {
  return typeof phase === "string" ? parseInt(phase.replace("P", "")) : phase;
};

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
      project?.phases?.find(
        (p) => p.phase_number === getPhaseNumber(project.current_phase),
      )?.phase_id || null
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
        (p) => p.phase_number === getPhaseNumber(project.current_phase),
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

  // Convert current_phase from "P1" to 1 for comparison
  const currentPhaseNumber = getPhaseNumber(project.current_phase);

  const currentPhase = project.phases?.find(
    (p) => p.phase_number === currentPhaseNumber,
  );
  const currentSubstep = currentPhase?.substeps?.find(
    (s) => s.step_number === project.current_substep,
  );

  const progress = calculateProgress();

  // Sidebar content (reusable for both desktop and mobile)
  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-3 border-b border-neutral-700/50">
        <h3 className="text-xs font-bold text-neutral-500 tracking-wider">
          ZERO1 BUILDER
        </h3>
        <div className="flex items-center gap-1">
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden text-neutral-400 hover:text-white transition-colors p-1 hover:bg-neutral-700/30 rounded"
              title="Close"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(true)}
            className="hidden lg:block text-neutral-400 hover:text-white transition-colors p-1 hover:bg-neutral-700/30 rounded"
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
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3">
        {/* Progress Section */}
        <div className="flex flex-col items-center py-2">
          <CircularProgress value={progress} size="lg" />
          <p className="text-xs text-neutral-400 mt-2 text-center line-clamp-2 px-2">
            {project.goal}
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-neutral-700/30" />

        {/* Current Step Card */}
        <div className="space-y-3">
          {/* Roadmap Header */}
          <button
            onClick={() => setIsRoadmapExpanded(!isRoadmapExpanded)}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 hover:bg-neutral-800/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">📋</span>
              <span className="text-xs font-bold text-brand-primary-400 tracking-wider">
                ROADMAP
              </span>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary-400 animate-pulse" />
                <span className="text-xs text-neutral-400">Active</span>
              </div>
            </div>
            <svg
              className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${isRoadmapExpanded ? "rotate-180" : ""}`}
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
          </button>

          {/* Current Step Info */}
          <div className="p-3 bg-neutral-800/30 rounded-lg space-y-2">
            <div className="flex items-baseline gap-2">
              <div className="text-xl font-black text-white">
                P{currentPhase?.phase_number}.{currentSubstep?.step_number}
              </div>
              <div className="text-xs text-neutral-500">
                {currentPhase?.goal}
              </div>
            </div>
            <div className="text-sm text-neutral-300 leading-snug">
              {currentSubstep?.label}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button onClick={() => onAskAI?.()} className="btn-primary flex-1">
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>Ask AI</span>
            </button>

            <button
              onClick={async () => {
                console.log("[RoadmapSidebar] Complete button clicked!");
                console.log("[RoadmapSidebar] currentSubstep:", currentSubstep);
                console.log(
                  "[RoadmapSidebar] completingSubstep:",
                  completingSubstep,
                );
                console.log(
                  "[RoadmapSidebar] currentSubstep.completed:",
                  currentSubstep?.completed,
                );

                if (
                  !currentSubstep ||
                  completingSubstep ||
                  currentSubstep.completed
                ) {
                  console.log(
                    "[RoadmapSidebar] Button click blocked, returning",
                  );
                  return;
                }

                console.log(
                  "[RoadmapSidebar] Calling onCompleteSubstep:",
                  currentSubstep.substep_id,
                );
                setCompletingSubstep(true);
                onCompleteSubstep(currentSubstep.substep_id);
                setTimeout(() => {
                  setCompletingSubstep(false);
                }, 600);
              }}
              disabled={completingSubstep || currentSubstep?.completed}
              className={`btn-icon ${
                currentSubstep?.completed
                  ? "bg-green-600 border-green-500"
                  : completingSubstep
                    ? "bg-green-600 border-green-500 scale-110"
                    : "bg-neutral-700/50 hover:bg-green-600/20 border border-neutral-600/50 hover:border-green-500"
              } w-10 h-10`}
              title={
                currentSubstep?.completed ? "Completed" : "Mark as complete"
              }
            >
              {currentSubstep?.completed || completingSubstep ? (
                <svg
                  className={`w-5 h-5 text-white ${completingSubstep ? "animate-bounce" : ""}`}
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

          {/* Progress Summary */}
          <div className="text-xs text-neutral-500 text-center">
            {project.phases.filter((p) => p.completed).length} /{" "}
            {project.phases.length} phases
          </div>
        </div>

        {/* Expanded Phase List */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isRoadmapExpanded ? "opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="space-y-1.5">
            {project.phases.map((phase) => (
              <PhaseButton
                key={phase.phase_id}
                phase={phase}
                isActive={phase.phase_number === currentPhaseNumber}
                isExpanded={expandedPhaseId === phase.phase_id}
                currentSubstep={
                  phase.phase_number === currentPhaseNumber
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

      {/* Bottom Actions - Fixed */}
      <div className="flex-shrink-0 border-t border-neutral-700/50 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenFileManager}
            className="btn-ghost flex-col gap-1 text-xs"
          >
            <span className="text-base">📁</span>
            <span>Files</span>
          </button>
          <button
            onClick={onOpenMemoryManager}
            className="btn-ghost flex-col gap-1 text-xs"
          >
            <span className="text-base">🧠</span>
            <span>Memory</span>
          </button>
        </div>

        <button onClick={onOpenNewWorkspace} className="btn-secondary w-full">
          <span className="text-sm">➕</span>
          <span>New Workspace</span>
        </button>
      </div>
    </div>
  );

  if (isCollapsed) {
    return (
      <>
        {/* Desktop: Collapsed sidebar */}
        <aside className="hidden lg:flex sticky top-14 h-[calc(100vh-56px)] w-14 bg-neutral-900 border-r border-neutral-700/50 flex-col items-center py-3 space-y-3 z-30">
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
              const isActive = phase.phase_number === currentPhaseNumber;
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
          className="lg:hidden fixed bottom-6 left-6 w-14 h-14 rounded-full bg-gradient-brand shadow-lg shadow-glow flex items-center justify-center text-white z-40 hover:scale-110 transition-transform"
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
      <aside className="hidden lg:flex sticky top-14 h-[calc(100vh-56px)] w-72 bg-neutral-900 border-r border-neutral-700/50 flex-col z-30 overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Mobile: Floating Action Button */}
      <button
        onClick={() => setIsMobileDrawerOpen(true)}
        className="lg:hidden fixed bottom-6 left-6 w-14 h-14 rounded-full bg-gradient-brand shadow-lg shadow-glow flex items-center justify-center text-white z-40 hover:scale-110 transition-transform"
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
