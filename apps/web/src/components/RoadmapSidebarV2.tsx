import React, { useState, useEffect } from "react";
import CircularProgress from "./CircularProgress";
import { ArtifactUploadButton } from "./ArtifactUploadButton";

interface RoadmapStep {
  id: string;
  step_number: number;
  title: string;
  description: string;
  estimated_complexity: number;
  status: "pending" | "active" | "completed" | "skipped";
  acceptance_criteria: string[];
  plan_status?: "not_generated" | "generated" | "approved" | "rejected";
  current_micro_step?: number;
}

interface PhaseSubstep {
  id: string;
  substep_number: number;
  title: string;
  description: string;
  estimated_complexity: number;
  status: "pending" | "active" | "completed" | "skipped";
  acceptance_criteria: string[];
}

interface RoadmapPhase {
  id: string;
  phase_number: number;
  phase_id: string; // "P0", "P1", etc.
  title: string;
  goal: string;
  pedagogical_purpose: string;
  visible_win: string;
  status: "locked" | "active" | "completed";
  substeps: PhaseSubstep[];
}

interface ProjectV2 {
  id: string;
  goal: string;
  current_step: number;
  current_phase?: number;
  roadmap_status: "generating" | "ready" | "in_progress" | "completed";
  metadata: {
    total_steps: number;
    total_phases?: number;
    completion_percentage: number;
    roadmap_type?: "dynamic" | "phase_based";
  };
  steps?: RoadmapStep[]; // Old flat model
  phases?: RoadmapPhase[]; // New phase-based model
}

interface RoadmapSidebarV2Props {
  project: ProjectV2 | null;
  onOpenFileManager: () => void;
  onOpenMemoryManager: () => void;
  onAskAI: () => void;
  onCompleteStep: () => void;
  onRefreshProject?: () => void;
  isCompletingStep?: boolean;
  onExitToLibrary?: () => void;
}

const RoadmapSidebarV2: React.FC<RoadmapSidebarV2Props> = ({
  project,
  onOpenFileManager,
  onOpenMemoryManager,
  onAskAI,
  onCompleteStep,
  onRefreshProject,
  isCompletingStep = false,
  onExitToLibrary,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem("roadmapCollapsed");
    return saved === "true";
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(true);

  useEffect(() => {
    localStorage.setItem("roadmapCollapsed", String(isCollapsed));
  }, [isCollapsed]);

  if (!project) return null;

  // Detect if this is a phase-based project
  const isPhaseBasedProject =
    !!project.phases && project.metadata?.roadmap_type === "phase_based";

  // For step-based projects (old model)
  const currentStep = project.steps?.find(
    (s) => s.step_number === project.current_step,
  );
  const completedSteps =
    project.steps?.filter((s) => s.status === "completed") || [];
  const upcomingSteps =
    project.steps?.filter((s) => s.step_number > project.current_step) || [];

  // Removed micro-steps check - "Ask AI" button works normally now

  // For phase-based projects
  const currentPhase = project.phases?.find((p) => p.status === "active");
  const currentSubstep = currentPhase?.substeps.find(
    (s) => s.status === "active",
  );
  const completedPhases =
    project.phases?.filter((p) => p.status === "completed") || [];
  const lockedPhases =
    project.phases?.filter((p) => p.status === "locked") || [];

  const progress = project.metadata?.completion_percentage || 0;

  // Complexity indicator
  const getComplexityDots = (complexity: number): string => {
    if (complexity <= 3) return "●";
    if (complexity <= 6) return "●●";
    return "●●●";
  };

  const getComplexityColor = (complexity: number): string => {
    if (complexity <= 3) return "text-green-400";
    if (complexity <= 6) return "text-yellow-400";
    return "text-red-400";
  };

  const getComplexityLabel = (complexity: number): string => {
    if (complexity <= 3) return "Quick";
    if (complexity <= 6) return "Medium";
    return "Complex";
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-700/50">
        <h3 className="text-xs font-bold text-neutral-400 tracking-wider">
          ZERO1 BUILDER
        </h3>
        <button
          onClick={() => {
            setIsCollapsed(true);
            setIsMobileOpen(false);
          }}
          className="text-neutral-400 hover:text-white transition-colors p-1 hover:bg-neutral-700/30 rounded"
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Progress Circle */}
        <div className="flex flex-col items-center py-2">
          <CircularProgress value={progress} size="lg" />
          {isPhaseBasedProject ? (
            <div className="text-sm font-semibold text-white mt-2">
              Phase {(project.current_phase ?? 0) + 1} of{" "}
              {project.metadata?.total_phases || 8}
            </div>
          ) : (
            <div className="text-sm font-semibold text-white mt-2">
              Step {project.current_step} of{" "}
              {project.metadata?.total_steps || 0}
            </div>
          )}
          <p className="text-xs text-neutral-400 mt-1 text-center line-clamp-2 px-2">
            {project.goal}
          </p>
        </div>

        {/* Exit Project Button */}
        {onExitToLibrary && (
          <button
            onClick={onExitToLibrary}
            className="w-full px-3 py-2 text-sm font-medium text-neutral-300 hover:text-white bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700/50 rounded-lg transition-all flex items-center gap-2 justify-center"
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
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Exit Project
          </button>
        )}

        {/* Divider */}
        <div className="h-px bg-neutral-700/30" />

        {/* PHASE-BASED UI */}
        {isPhaseBasedProject ? (
          <>
            {/* Current Phase & Substep */}
            {currentPhase && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-brand-primary-400 animate-pulse" />
                  <span className="text-xs font-bold text-brand-primary-400 tracking-wider">
                    CURRENT PHASE: {currentPhase.phase_id}
                  </span>
                </div>

                <div className="p-4 bg-neutral-800/30 border border-brand-primary-500/20 rounded-lg space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-lg font-bold text-white mb-1">
                        {currentPhase.title}
                      </div>
                      <div className="text-xs text-neutral-400 mb-2">
                        {currentPhase.goal}
                      </div>
                      <div className="text-xs text-brand-primary-300/70 italic">
                        ✨ {currentPhase.visible_win}
                      </div>
                    </div>
                  </div>

                  {/* Current Substep */}
                  {currentSubstep && (
                    <div className="mt-3 p-3 bg-neutral-900/50 border border-brand-primary-500/10 rounded-lg">
                      <div className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                        <span className="text-brand-primary-400">→</span>
                        {currentSubstep.title}
                      </div>
                      <div className="text-xs text-neutral-300 leading-relaxed mb-2">
                        {currentSubstep.description}
                      </div>
                      {currentSubstep.acceptance_criteria &&
                        currentSubstep.acceptance_criteria.length > 0 && (
                          <div className="text-xs space-y-1">
                            <div className="text-neutral-500 font-semibold">
                              Acceptance Criteria:
                            </div>
                            {currentSubstep.acceptance_criteria.map(
                              (criteria, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 text-neutral-400"
                                >
                                  <span>•</span>
                                  <span>{criteria}</span>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                    </div>
                  )}

                  {/* Other substeps in current phase */}
                  {currentPhase.substeps.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="text-xs font-semibold text-neutral-500 mb-1">
                        Phase Progress:{" "}
                        {
                          currentPhase.substeps.filter(
                            (s) => s.status === "completed",
                          ).length
                        }
                        /{currentPhase.substeps.length}
                      </div>
                      {currentPhase.substeps.map((substep) => (
                        <div
                          key={substep.id}
                          className={`flex items-center gap-2 text-xs ${substep.status === "active" ? "hidden" : ""}`}
                        >
                          {substep.status === "completed" ? (
                            <span className="text-green-400">✓</span>
                          ) : (
                            <span className="text-neutral-600">○</span>
                          )}
                          <span
                            className={
                              substep.status === "completed"
                                ? "text-neutral-500 line-through"
                                : "text-neutral-400"
                            }
                          >
                            {substep.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={onAskAI}
                    className="btn-primary flex-1"
                    title="Ask AI for help"
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
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span>Ask AI</span>
                  </button>
                  <button
                    onClick={onCompleteStep}
                    disabled={
                      !currentSubstep ||
                      currentSubstep.status === "completed" ||
                      isCompletingStep
                    }
                    className={`btn-icon w-10 h-10 transition-all ${
                      currentSubstep?.status === "completed" || isCompletingStep
                        ? "bg-green-600 border-green-500 scale-110"
                        : "bg-neutral-700/50 hover:bg-green-600/20 border border-neutral-600/50 hover:border-green-500"
                    }`}
                    title={
                      currentSubstep?.status === "completed"
                        ? "Completed"
                        : "Mark complete"
                    }
                  >
                    {(currentSubstep?.status === "completed" ||
                      isCompletingStep) && (
                      <svg
                        className={`w-5 h-5 text-white ${isCompletingStep ? "animate-bounce" : ""}`}
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
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-neutral-700/30" />

            {/* Completed Phases */}
            {completedPhases.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <span className="text-xs font-bold text-green-400 tracking-wider">
                    ✓ COMPLETED ({completedPhases.length})
                  </span>
                  <svg
                    className={`w-3 h-3 text-neutral-400 transition-transform ${showCompleted ? "rotate-180" : ""}`}
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
                {showCompleted && (
                  <div className="space-y-1 pl-2">
                    {completedPhases.map((phase) => (
                      <div
                        key={phase.id}
                        className="text-xs text-neutral-500 flex items-start gap-2"
                      >
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span className="flex-1">
                          {phase.phase_id}: {phase.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Locked Phases */}
            {lockedPhases.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowUpcoming(!showUpcoming)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <span className="text-xs font-bold text-neutral-500 tracking-wider">
                    🔒 LOCKED ({lockedPhases.length})
                  </span>
                  <svg
                    className={`w-3 h-3 text-neutral-400 transition-transform ${showUpcoming ? "rotate-180" : ""}`}
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
                {showUpcoming && (
                  <div className="space-y-2 pl-2">
                    {lockedPhases.map((phase) => (
                      <div key={phase.id} className="text-xs space-y-1">
                        <div className="flex items-start gap-2 text-neutral-600">
                          <span className="mt-0.5">🔒</span>
                          <div className="flex-1">
                            <div className="font-medium">
                              {phase.phase_id}: {phase.title}
                            </div>
                            <div className="text-neutral-700 text-[11px] italic mt-0.5">
                              {phase.goal}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* STEP-BASED UI (OLD MODEL) */
          <>
            {/* Current Step */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-primary-400 animate-pulse" />
                <span className="text-xs font-bold text-brand-primary-400 tracking-wider">
                  CURRENT STEP
                </span>
              </div>

              {!currentStep ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-3 bg-neutral-700/30 rounded-full w-3/4" />
                  <div className="h-3 bg-neutral-700/30 rounded-full w-full" />
                  <div className="h-3 bg-neutral-700/30 rounded-full w-2/3" />
                </div>
              ) : (
                <div className="p-4 bg-neutral-800/30 border border-brand-primary-500/20 rounded-lg space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-lg font-bold text-white mb-1">
                        {currentStep.title}
                      </div>
                      <div className="text-xs text-neutral-400 flex items-center gap-2">
                        <span
                          className={getComplexityColor(
                            currentStep.estimated_complexity,
                          )}
                        >
                          {getComplexityDots(currentStep.estimated_complexity)}{" "}
                          {getComplexityLabel(currentStep.estimated_complexity)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-neutral-300 leading-relaxed">
                    {currentStep.description}
                  </div>

                  {currentStep.acceptance_criteria &&
                    currentStep.acceptance_criteria.length > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="text-neutral-500 font-semibold">
                          Acceptance Criteria:
                        </div>
                        {currentStep.acceptance_criteria.map(
                          (criteria, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-neutral-400"
                            >
                              <span>•</span>
                              <span>{criteria}</span>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={onAskAI}
                  className="btn-primary flex-1"
                  title="Ask AI for help"
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
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span>Ask AI</span>
                </button>
                <button
                  onClick={onCompleteStep}
                  disabled={
                    !currentStep ||
                    currentStep.status === "completed" ||
                    isCompletingStep
                  }
                  className={`btn-icon w-10 h-10 transition-all ${
                    currentStep?.status === "completed" || isCompletingStep
                      ? "bg-green-600 border-green-500 scale-110"
                      : "bg-neutral-700/50 hover:bg-green-600/20 border border-neutral-600/50 hover:border-green-500"
                  }`}
                  title={
                    currentStep?.status === "completed"
                      ? "Completed"
                      : "Mark complete"
                  }
                >
                  {(currentStep?.status === "completed" ||
                    isCompletingStep) && (
                    <svg
                      className={`w-5 h-5 text-white ${isCompletingStep ? "animate-bounce" : ""}`}
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
                  )}
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-neutral-700/30" />

            {/* Completed Steps */}
            {completedSteps.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <span className="text-xs font-bold text-green-400 tracking-wider">
                    ✓ COMPLETED ({completedSteps.length})
                  </span>
                  <svg
                    className={`w-3 h-3 text-neutral-400 transition-transform ${showCompleted ? "rotate-180" : ""}`}
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
                {showCompleted && (
                  <div className="space-y-1 pl-2">
                    {completedSteps.map((step) => (
                      <div
                        key={step.id}
                        className="text-xs text-neutral-500 flex items-start gap-2"
                      >
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span className="flex-1">{step.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Upcoming Steps */}
            {upcomingSteps.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowUpcoming(!showUpcoming)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <span className="text-xs font-bold text-neutral-500 tracking-wider">
                    UPCOMING ({upcomingSteps.length})
                  </span>
                  <svg
                    className={`w-3 h-3 text-neutral-400 transition-transform ${showUpcoming ? "rotate-180" : ""}`}
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
                {showUpcoming && (
                  <div className="space-y-2 pl-2">
                    {upcomingSteps.slice(0, 5).map((step) => (
                      <div key={step.id} className="text-xs space-y-1">
                        <div className="flex items-start gap-2 text-neutral-400">
                          <span className="text-neutral-600 mt-0.5">→</span>
                          <span className="flex-1 font-medium">
                            {step.title}
                          </span>
                        </div>
                      </div>
                    ))}
                    {upcomingSteps.length > 5 && (
                      <div className="text-xs text-neutral-600 italic pl-4">
                        ...and {upcomingSteps.length - 5} more steps
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="flex-shrink-0 border-t border-neutral-700/50 p-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenFileManager}
            className="btn-ghost flex-col gap-1 text-xs"
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>Knowledge</span>
          </button>
          <button
            onClick={onOpenMemoryManager}
            className="btn-ghost flex-col gap-1 text-xs"
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
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <span>Context</span>
          </button>
        </div>

        <ArtifactUploadButton
          projectId={project?.id || null}
          onUploadComplete={() => onRefreshProject?.()}
          variant="button"
          label="AI Review"
          showIcon={false}
        />
      </div>
    </div>
  );

  // Collapsed view
  if (isCollapsed) {
    return (
      <>
        {/* Desktop: Collapsed sidebar */}
        <aside className="hidden lg:flex sticky top-14 h-[calc(100vh-56px)] w-14 bg-neutral-900 border-r border-neutral-700/50 flex-col items-center py-3 space-y-3 z-30">
          <button
            onClick={() => setIsCollapsed(false)}
            className="text-neutral-400 hover:text-white transition-colors p-2 hover:bg-neutral-800/50 rounded-lg"
            title="Expand"
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

          <div className="text-center">
            <div className="text-xl font-bold text-white">{progress}</div>
            <div className="text-xs text-neutral-500">%</div>
          </div>

          <div className="flex-1" />

          <div className="space-y-2">
            <button
              onClick={onOpenFileManager}
              className="w-10 h-10 flex items-center justify-center hover:bg-neutral-800/50 rounded-lg transition-colors"
              title="Knowledge"
            >
              <svg
                className="w-5 h-5 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
            <button
              onClick={onOpenMemoryManager}
              className="w-10 h-10 flex items-center justify-center hover:bg-neutral-800/50 rounded-lg transition-colors"
              title="Context"
            >
              <svg
                className="w-5 h-5 text-neutral-400"
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
          </div>
        </aside>

        {/* Mobile: FAB */}
        <button
          onClick={() => setIsMobileOpen(true)}
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
        {isMobileOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/70 z-40 lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 w-80 bg-neutral-900 border-r border-neutral-700/50 z-50 lg:hidden overflow-y-auto shadow-2xl">
              <SidebarContent />
            </div>
          </>
        )}
      </>
    );
  }

  // Expanded view
  return (
    <>
      {/* Desktop: Expanded sidebar */}
      <aside className="hidden lg:flex sticky top-14 h-[calc(100vh-56px)] w-72 bg-neutral-900 border-r border-neutral-700/50 flex-col z-30 overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Mobile: FAB */}
      <button
        onClick={() => setIsMobileOpen(true)}
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
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/70 z-40 lg:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-80 bg-neutral-900 border-r border-neutral-700/50 z-50 lg:hidden overflow-y-auto shadow-2xl">
            <SidebarContent />
          </div>
        </>
      )}
    </>
  );
};

export default RoadmapSidebarV2;
