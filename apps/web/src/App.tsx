/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useRef } from "react";

import "./App.css";

import { CheckpointsModal } from "./components/CheckpointsModal";

import { ExportRoadmapModal } from "./components/ExportRoadmapModal";

import { FileManager } from "./components/FileManager";

import { UserMemoryManager } from "./components/UserMemoryManager";

import RoadmapSidebarV2 from "./components/RoadmapSidebarV2";

import UnifiedWorkspace from "./components/UnifiedWorkspace";

import { Toast } from "./components/Toast";

import { AvatarMenu } from "./components/AvatarMenu";

import { AuthModal } from "./components/AuthModal";

import { ProjectLibrary } from "./components/ProjectLibrary";

import { useAuth } from "./contexts/AuthContext";

// ---- Utility helpers ----

const cls = (...arr: (string | boolean | undefined)[]) =>
  arr.filter(Boolean).join(" ");

// Helper to convert phase format: "P1" -> 1, or pass through if already number

const getPhaseNumber = (phase: string | number): number => {
  return typeof phase === "string" ? parseInt(phase.replace("P", "")) : phase;
};

// Get API URL from environment or default to localhost

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

// ---- Project Normalization ----

/**

 * Normalize project data to ensure progressive disclosure.

 * This transformation ensures that:

 * - Only Phase 1 is unlocked and expanded with substeps

 * - Phases 2-7 are locked with empty substeps array

 * - All phases have phase_number set correctly

 *

 * This must be applied consistently:

 * - When loading shared projects (URL parameters)

 * - When receiving roadmap_complete (fallback)

 * - When refreshing project data

 */

const normalizeProject = (rawProject: any): any => {
  if (!rawProject) {
    return rawProject;
  }

  // V2 projects have 'steps' instead of 'phases'
  if (rawProject.steps) {
    // V2 format - already normalized, just return as-is
    return {
      ...rawProject,
      current_step: rawProject.current_step || 1,
      steps: rawProject.steps || [],
      metadata: rawProject.metadata || {},
    };
  }

  // V1 projects have 'phases'
  if (!rawProject.phases) {
    return rawProject;
  }

  const phases = rawProject.phases;

  return {
    ...rawProject,

    current_phase:
      typeof rawProject.current_phase === "string"
        ? getPhaseNumber(rawProject.current_phase)
        : rawProject.current_phase || 1,

    current_substep: rawProject.current_substep || 1,

    phases: phases.map((phase: any, index: number) => ({
      ...phase,

      phase_number: index + 1,

      expanded: index === 0,

      locked: index > 0,

      substeps:
        index === 0
          ? (phase.substeps || []).map((substep: any, subIndex: number) => ({
              ...substep,

              step_number: subIndex + 1,

              completed: false,
            }))
          : [],
    })),
  };
};

// Keep a single SSE connection per project id for live updates (phase unlocks, refreshes)
let projectEventSource: EventSource | null = null;

// ---- Popup Workspace Component ----

interface PopupWorkspaceProps {
  workspace: PopupWorkspace;

  project: Project | null;

  onClose: () => void;

  onUpdateMessages: (workspaceId: string, messages: ChatMessage[]) => void;
}

const PopupWorkspaceComponent: React.FC<PopupWorkspaceProps> = ({
  workspace,

  project,

  onClose,

  onUpdateMessages,
}) => {
  const [currentInput, setCurrentInput] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);

  const [position, setPosition] = useState(workspace.position);

  const [isDragging, setIsDragging] = useState(false);

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [popupToast, setPopupToast] = useState<string>("");

  const handleSendMessage = async () => {
    if (!currentInput.trim() || !project || isProcessing) return;

    setIsProcessing(true);

    const userMessage = currentInput.trim();

    const newMessage: ChatMessage = {
      id: Date.now().toString(),

      type: "user",

      content: userMessage,

      timestamp: new Date(),
    };

    const updatedMessages = [...workspace.messages, newMessage];

    onUpdateMessages(workspace.id, updatedMessages);

    setCurrentInput("");

    // Get current substep's master prompt

    const currentPhase = project.phases?.find(
      (p) => p.phase_number === getPhaseNumber(project.current_phase),
    );

    const currentSubstep = currentPhase?.substeps?.find(
      (s) => s.step_number === project.current_substep,
    );

    if (!currentSubstep) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),

        type: "ai",

        content:
          "No active substep found. Please make sure you have an active project with substeps.",

        timestamp: new Date(),
      };

      onUpdateMessages(workspace.id, [...updatedMessages, errorMessage]);

      setIsProcessing(false);

      return;
    }

    // Create AI message placeholder

    const aiMessageId = (Date.now() + 1).toString();

    const aiMessage: ChatMessage = {
      id: aiMessageId,

      type: "ai",

      content: "Thinking...",

      timestamp: new Date(),
    };

    // Maintain a local copy that we mutate during streaming

    let streamMessages: ChatMessage[] = [...updatedMessages, aiMessage];

    onUpdateMessages(workspace.id, streamMessages);

    try {
      const contextPrompt = `

Context: Deep dive workspace for ${workspace.title}



${currentSubstep.prompt_to_send}



User question: ${userMessage}

`;

      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/execute-step/stream`,

        {
          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({
            master_prompt: contextPrompt,

            user_message: userMessage,

            thread_id: workspace.threadId, // Include thread ID for persistence
          }),
        },
      );

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limit exceeded

          const errorData = await response.json().catch(() => ({}));

          const retryAfter = errorData.retryAfter || "1 minute";

          throw new Error(
            `⚠️ Rate limit exceeded. Please wait ${retryAfter} before trying again.`,
          );
        }

        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new (window as any).TextDecoder();

      let buffer = "";

      let accumulatedContent = "";

      let receivedDone = false;

      let currentEvent = ""; // persist across chunks

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");

        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line === "") {
            currentEvent = "";

            continue;
          }

          if (line.startsWith(":")) {
            // heartbeat

            continue;
          }

          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();

            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              switch (currentEvent) {
                case "content": {
                  accumulatedContent += parsed.delta || "";

                  // Update AI message in our local streamMessages and push

                  streamMessages = streamMessages.map((msg) =>
                    msg.id === aiMessageId
                      ? { ...msg, content: accumulatedContent }
                      : msg,
                  );

                  onUpdateMessages(workspace.id, streamMessages);

                  break;
                }

                case "status": {
                  const status = parsed.message || "Working...";

                  // Show status while waiting for content

                  const display = accumulatedContent
                    ? accumulatedContent
                    : status;

                  streamMessages = streamMessages.map((msg) =>
                    msg.id === aiMessageId ? { ...msg, content: display } : msg,
                  );

                  onUpdateMessages(workspace.id, streamMessages);

                  break;
                }

                case "tool_call": {
                  const tool = parsed.tool || "tool";

                  const status = `Using ${tool}...`;

                  if (!accumulatedContent) {
                    streamMessages = streamMessages.map((msg) =>
                      msg.id === aiMessageId
                        ? { ...msg, content: status }
                        : msg,
                    );

                    onUpdateMessages(workspace.id, streamMessages);
                  }

                  break;
                }

                case "completion_nudge": {
                  // Surface high-confidence prompt inline in the popup workspace

                  const nudgeText = parsed.message
                    ? `✨ ${parsed.message}`
                    : "✨ Ready to mark this substep complete?";

                  const nudgeMsg: ChatMessage = {
                    id: `${aiMessageId}-nudge-${Date.now()}`,

                    type: "ai",

                    content: nudgeText,

                    timestamp: new Date(),
                  };

                  streamMessages = [...streamMessages, nudgeMsg];

                  onUpdateMessages(workspace.id, streamMessages);

                  break;
                }

                case "substep_completed": {
                  // Append briefing to popup thread if provided

                  if (parsed?.briefing) {
                    const briefMsg: ChatMessage = {
                      id: `${aiMessageId}-briefing-${Date.now()}`,

                      type: "ai",

                      content: `? ${parsed.briefing}`,

                      timestamp: new Date(),
                    };

                    streamMessages = [...streamMessages, briefMsg];

                    onUpdateMessages(workspace.id, streamMessages);
                  }

                  // Show a transient toast inside the popup

                  setPopupToast("? Substep completed!");

                  setTimeout(() => setPopupToast(""), 2000);

                  break;
                }

                case "completion_detected": {
                  // Optional: no-op for popup

                  break;
                }

                case "done": {
                  receivedDone = true;

                  break;
                }

                case "error": {
                  throw new Error(parsed.message || "Streaming error");
                }

                default: {
                  // Ignore other events
                }
              }
            } catch {
              // Failed to parse SSE data - ignore
            }
          }
        }

        if (receivedDone) {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancel errors
          }

          break;
        }
      }
    } catch {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),

        type: "ai",

        content: "Network error. Please check your connection and try again.",

        timestamp: new Date(),
      };

      onUpdateMessages(workspace.id, [...updatedMessages, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);

    setDragOffset({
      x: e.clientX - position.x,

      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = useCallback(
    (e: globalThis.MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,

          y: e.clientY - dragOffset.y,
        });
      }
    },

    [isDragging, dragOffset],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);

      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);

        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!workspace.isVisible) return null;

  return (
    <div
      className="fixed z-40 bg-gradient-to-br from-gray-900/98 to-black/95 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
      style={{
        left: `${position.x}px`,

        top: `${position.y}px`,

        width: "400px",

        height: "500px",
      }}
    >
      {/* Header */}

      <div
        className="p-4 border-b border-gray-700/50 bg-gradient-to-r from-blue-950/50 to-purple-950/50 cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
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
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">
                Deep Dive Workspace
              </h3>

              <p className="text-xs text-blue-400 truncate max-w-48">
                {workspace.title}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-6 h-6 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 flex items-center justify-center transition-colors"
          >
            <svg
              className="w-3 h-3 text-gray-400"
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
      </div>

      {/* Messages */}

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {workspace.messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600/20 to-indigo-600/20 flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-purple-400"
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
            </div>

            <p>Ask questions to dive deeper into this topic.</p>
          </div>
        )}

        {workspace.messages.map((message) => (
          <div key={message.id}>
            {message.type === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-xl p-3 bg-gradient-to-br from-blue-600 to-purple-600 text-white text-sm">
                  <p className="leading-relaxed">{message.content}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                    <svg
                      className="w-2.5 h-2.5 text-white"
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
                  </div>

                  <span className="text-xs text-emerald-400 font-medium">
                    AI Assistant
                  </span>
                </div>

                <div className="pl-7">
                  <div className="text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">
                    {message.content}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input Area */}

      <div className="p-3 border-t border-gray-700/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            placeholder="Ask questions about this topic..."
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();

                handleSendMessage();
              }
            }}
          />

          <button
            onClick={handleSendMessage}
            disabled={!currentInput.trim() || isProcessing}
            className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-600 rounded-lg flex items-center justify-center transition-all duration-200"
          >
            {isProcessing ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {popupToast && (
        <div class="absolute top-3 right-3">
          <Toast
            message={popupToast}
            duration={2000}
            onClose={() => setPopupToast("")}
            type="success"
          />
        </div>
      )}
    </div>
  );
};

// ---- Types ----

interface ProjectSubstep {
  substep_id: string;

  step_number: number;

  label: string;

  prompt_to_send: string;

  commands?: string;

  rationale?: string;

  why_next_step_matters?: string;

  completed: boolean;

  created_at: string;
}

interface PopupWorkspace {
  id: string;

  title: string;

  position: { x: number; y: number };

  messages: ChatMessage[];

  isVisible: boolean;

  threadId?: string; // Track thread for persistence
}

interface ProjectPhase {
  phase_id: string;

  phase_number: number;

  goal: string;

  why_it_matters: string;

  master_prompt: string;

  substeps: ProjectSubstep[];

  acceptance_criteria: string[];

  rollback_plan: string[];

  expanded: boolean;

  completed: boolean;

  locked: boolean;

  created_at: string;
}

interface SubstepCompletion {
  phase_number: number;

  substep_number: number;

  status: "complete" | "partial" | "incomplete";

  evidence: string;

  confidence: number;

  timestamp: string;
}

interface Project {
  id: string;

  goal: string;

  status: "clarifying" | "active" | "completed" | "paused";

  current_phase: number;

  current_substep: number;

  phases: ProjectPhase[];

  history: unknown[];

  clarification_context?: string;

  created_at: string;

  updated_at: string;

  completed_substeps?: SubstepCompletion[];
}

interface ChatMessage {
  id: string;

  type: "user" | "ai";

  content: string;

  timestamp: Date;
}

// ---- Master Control Modal with Progressive Revelation ----

interface MasterControlProps {
  project: Project;

  isOpen: boolean;

  onClose: () => void;

  onProjectUpdate: () => void;
}

const MasterControl: React.FC<MasterControlProps> = ({
  project,

  isOpen,

  onClose,

  onProjectUpdate,
}) => {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const [showCheckpoints, setShowCheckpoints] = useState(false);

  const [showExport, setShowExport] = useState(false);

  if (!isOpen) return null;

  const togglePhaseExpansion = (phaseId: string) => {
    const newExpanded = new Set(expandedPhases);

    if (newExpanded.has(phaseId)) {
      newExpanded.delete(phaseId);
    } else {
      newExpanded.add(phaseId);
    }

    setExpandedPhases(newExpanded);
  };

  const getPhaseStatus = (phase: ProjectPhase) => {
    if (phase.completed)
      return { icon: "✅", label: "Complete", color: "text-green-400" };

    if (phase.phase_number === getPhaseNumber(project.current_phase))
      return { icon: "🔄", label: "Active", color: "text-blue-400" };

    if (phase.locked)
      return { icon: "🔒", label: "Locked", color: "text-gray-500" };

    return { icon: "⚡", label: "Ready", color: "text-yellow-400" };
  };

  // Helper function to check if substep is complete

  const isSubstepComplete = (
    phaseNumber: number,

    substepNumber: number,
  ): boolean => {
    if (!project.completed_substeps) return false;

    return project.completed_substeps.some(
      (c) =>
        c.phase_number === phaseNumber &&
        c.substep_number === substepNumber &&
        c.status === "complete",
    );
  };

  // Calculate phase progress based on completed substeps

  const getPhaseProgress = (phase: ProjectPhase): number => {
    if (phase.completed) return 100;

    if (!phase.substeps || phase.substeps.length === 0) return 0;

    const completedCount = phase.substeps.filter((_, index) =>
      isSubstepComplete(phase.phase_number, index + 1),
    ).length;

    return Math.round((completedCount / phase.substeps.length) * 100);
  };

  const progress =
    project.phases.length > 0
      ? Math.round(
          (project.phases.filter((p) => p.completed).length /
            project.phases.length) *
            100,
        )
      : 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700/50 rounded-3xl max-w-5xl w-full max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}

        <div className="p-8 border-b border-gray-700/50 bg-gradient-to-r from-blue-950/30 to-purple-950/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {project.goal}
              </h2>

              <p className="text-blue-400 font-medium">
                {progress}% Complete G�� {project.phases.length} Phases
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowExport(true)}
                className="px-4 py-2 rounded-xl bg-green-600/60 hover:bg-green-500/60 flex items-center gap-2 transition-colors backdrop-blur-sm text-white font-medium"
              >
                <span>📤</span>

                <span>Export</span>
              </button>

              <button
                onClick={() => setShowCheckpoints(true)}
                className="px-4 py-2 rounded-xl bg-purple-600/60 hover:bg-purple-500/60 flex items-center gap-2 transition-colors backdrop-blur-sm text-white font-medium"
              >
                <span>💾</span>

                <span>Checkpoints</span>
              </button>

              <button
                onClick={onClose}
                className="w-10 h-10 rounded-xl bg-gray-800/60 hover:bg-gray-700/60 flex items-center justify-center transition-colors backdrop-blur-sm"
              >
                <svg
                  className="w-5 h-5 text-gray-400"
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
          </div>

          {/* Progress bar */}

          <div className="mt-6 bg-gray-800/60 rounded-full h-2 overflow-hidden backdrop-blur-sm">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700 shadow-lg shadow-blue-500/30"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Phases */}

        <div className="p-8 space-y-6 max-h-96 overflow-y-auto">
          {project.phases.map((phase) => {
            const status = getPhaseStatus(phase);

            const isExpanded = expandedPhases.has(phase.phase_id);

            return (
              <div
                key={phase.phase_id}
                className={cls(
                  "border rounded-2xl overflow-hidden transition-all duration-300",

                  phase.completed
                    ? "border-green-500/40 bg-gradient-to-br from-green-950/20 to-emerald-950/20"
                    : phase.phase_number ===
                        getPhaseNumber(project.current_phase)
                      ? "border-blue-500/60 bg-gradient-to-br from-blue-950/30 to-purple-950/30"
                      : phase.locked
                        ? "border-gray-600/40 bg-gradient-to-br from-gray-900/40 to-gray-800/40"
                        : "border-yellow-500/40 bg-gradient-to-br from-yellow-950/20 to-orange-950/20",
                )}
              >
                {/* Phase Header */}

                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div
                      className={cls(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border-2",

                        phase.completed
                          ? "bg-green-500 border-green-400 text-white"
                          : phase.phase_number ===
                              getPhaseNumber(project.current_phase)
                            ? "bg-blue-500 border-blue-400 text-white"
                            : phase.locked
                              ? "bg-gray-600 border-gray-500 text-gray-300"
                              : "bg-yellow-500 border-yellow-400 text-white",
                      )}
                    >
                      {phase.completed ? "G��" : phase.phase_number}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xl font-bold text-white">
                          {phase.goal}
                        </h3>

                        <div className="flex items-center gap-3">
                          <span
                            className={cls("text-sm font-medium", status.color)}
                          >
                            {status.icon} {status.label}
                          </span>

                          <button
                            onClick={() => togglePhaseExpansion(phase.phase_id)}
                            className="w-8 h-8 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 flex items-center justify-center transition-colors"
                          >
                            <svg
                              className={cls(
                                "w-4 h-4 text-gray-400 transition-transform duration-200",

                                isExpanded && "rotate-180",
                              )}
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
                        </div>
                      </div>

                      <p className="text-gray-400 leading-relaxed">
                        {phase.why_it_matters}
                      </p>

                      {/* Phase Progress Bar */}

                      {phase.substeps && phase.substeps.length > 0 && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500 font-medium">
                              {getPhaseProgress(phase)}% Complete
                            </span>
                          </div>

                          <div className="bg-gray-800/60 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={cls(
                                "h-full transition-all duration-500",

                                phase.completed
                                  ? "bg-green-500"
                                  : phase.phase_number ===
                                      getPhaseNumber(project.current_phase)
                                    ? "bg-gradient-to-r from-blue-500 to-purple-500"
                                    : "bg-gray-600",
                              )}
                              style={{ width: `${getPhaseProgress(phase)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Substeps (when expanded) */}

                {isExpanded && phase.substeps && phase.substeps.length > 0 && (
                  <div className="px-6 pb-6">
                    <div className="bg-black/20 border border-gray-700/30 rounded-xl p-4 backdrop-blur-sm">
                      <h4 className="text-gray-300 font-semibold mb-3 text-sm uppercase tracking-wide">
                        Substeps
                      </h4>

                      <div className="space-y-2">
                        {phase.substeps.map((substep, index) => {
                          const isComplete = isSubstepComplete(
                            phase.phase_number,

                            index + 1,
                          );

                          return (
                            <div
                              key={substep.substep_id}
                              className={cls(
                                "flex items-center gap-3 p-3 rounded-lg transition-all duration-200",

                                isComplete
                                  ? "bg-green-950/30 border border-green-500/20"
                                  : "bg-gray-800/40 border border-gray-600/20",
                              )}
                            >
                              <div
                                className={cls(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",

                                  isComplete
                                    ? "bg-green-500 text-white"
                                    : "bg-gray-600 text-gray-300",
                                )}
                              >
                                {isComplete ? "G��" : index + 1}
                              </div>

                              <div className="flex flex-col">
                                <span
                                  className={cls(
                                    "font-medium",

                                    isComplete
                                      ? "text-green-400"
                                      : "text-white",
                                  )}
                                >
                                  {substep.label}
                                </span>
                                {substep.rationale && (
                                  <span className="text-xs text-gray-400 mt-0.5">
                                    {substep.rationale}
                                  </span>
                                )}
                                {substep.why_next_step_matters && (
                                  <span className="text-[11px] text-gray-500 mt-0.5 italic">
                                    Why next: {substep.why_next_step_matters}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Checkpoints Modal */}

      <CheckpointsModal
        projectId={project.id}
        isOpen={showCheckpoints}
        onClose={() => setShowCheckpoints(false)}
        onRestoreSuccess={() => {
          setShowCheckpoints(false);

          onProjectUpdate();
        }}
      />

      {/* Export Roadmap Modal */}

      <ExportRoadmapModal
        project={project}
        isOpen={showExport}
        onClose={() => setShowExport(false)}
      />
    </div>
  );
};

// ---- Execution Engine (Right Panel) ----

// ---- Ideation Hub (Left Panel) ----

interface ToolActivity {
  type: "tool_start" | "tool_end" | "tool_error";

  tool: string;

  args?: unknown;

  result?: unknown;

  error?: string;

  timestamp: string;
}

// ---- Navigation Component ----

interface NavBarProps {
  hasProject?: boolean;
  onShowAuthModal: () => void;
  onSignOut: () => void;
  projectCount: number;
  projects: any[];
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

const NavBar: React.FC<NavBarProps> = ({
  hasProject,
  onShowAuthModal,
  onSignOut,
  projectCount,
  projects,
  onSelectProject,
  onDeleteProject,
}) => {
  // Create wrapper for onSelectProject to convert Project to projectId string
  const handleSelectProject = (project: any) => {
    onSelectProject(project.id);
  };

  return (
    <nav className="sticky top-0 z-50 bg-neutral-900/98 backdrop-blur-xl border-b border-neutral-700/50 shadow-2xl">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Brand Lockup - Tightened spacing */}

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shadow-lg shadow-glow">
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>

            <h1 className="text-lg font-bold text-white tracking-tight">
              Zero<span className="text-brand-primary-400">1</span>
            </h1>
          </div>

          {/* Primary Actions - Right side */}

          <div className="flex items-center gap-3">
            {hasProject && (
              <span className="hidden lg:block text-neutral-500 text-xs font-medium uppercase tracking-wider">
                Workspace
              </span>
            )}
            <AvatarMenu
              onShowAuthModal={onShowAuthModal}
              onSignOut={onSignOut}
              projectCount={projectCount}
              projects={projects}
              onSelectProject={handleSelectProject}
              onDeleteProject={onDeleteProject}
            />
          </div>
        </div>
      </div>
    </nav>
  );
};

// ---- Main App Component ----

function App() {
  const [project, setProject] = useState<Project | null>(null);

  const [guidance, setGuidance] = useState("");

  const [toolsUsed, setToolsUsed] = useState<ToolActivity[]>([]);

  const [creatingProject, setCreatingProject] = useState(false);

  const [inspiring, setInspiring] = useState(false);

  const [showMasterControl, setShowMasterControl] = useState(false);

  const [showFileManager, setShowFileManager] = useState(false);

  const [showMemoryManager, setShowMemoryManager] = useState(false);

  // Ref to connect RoadmapSidebar "Ask AI" to UnifiedWorkspace
  const askAIRef = useRef<(() => void) | null>(null);

  // Authentication
  const { user, loading: authLoading, getAccessToken } = useAuth();

  // View state management
  type AppView = "landing" | "workspace" | "library";
  const [currentView, setCurrentView] = useState<AppView>("landing");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userProjects, setUserProjects] = useState<any[]>([]);

  // Legacy user ID for memory system (TODO: migrate to auth-based user ID)
  const [userId] = useState(() => {
    // Generate a temporary ID for memory system
    // This should be migrated to use the authenticated user's ID
    return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  });

  // Popup workspace state

  const [popupWorkspaces, setPopupWorkspaces] = useState<PopupWorkspace[]>([]);

  // Load user projects when authenticated
  useEffect(() => {
    const loadUserProjects = async () => {
      if (!user) {
        setUserProjects([]);
        return;
      }

      try {
        const token = await getAccessToken();
        const response = await fetch(`${API_URL}/api/v2/projects`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUserProjects(data.projects || []);
        }
      } catch {
        // Failed to load user projects
      }
    };

    loadUserProjects();
  }, [user, getAccessToken]);

  // Persist current project ID to localStorage whenever it changes
  useEffect(() => {
    if (project?.id) {
      localStorage.setItem("zero1_lastProjectId", project.id);
    }
  }, [project?.id]);

  // Load project from URL parameter or localStorage on mount
  const hasLoadedProjectRef = useRef(false);

  useEffect(() => {
    console.log("[App] Mount effect - checking if should load project", {
      authLoading,
      hasUser: !!user,
      hasLoadedBefore: hasLoadedProjectRef.current,
      currentProject: project?.id,
    });

    // Wait for auth to finish loading
    if (authLoading) return;

    // Only restore projects for authenticated users
    if (!user) return;

    // Only run once per user session
    if (hasLoadedProjectRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);

    const projectIdFromUrl = urlParams.get("project");

    // Load from URL parameter (sharing) OR localStorage (session persistence)
    const lastProjectId = localStorage.getItem("zero1_lastProjectId");
    const projectId = projectIdFromUrl || lastProjectId;

    console.log("[App] Will attempt to load project:", {
      projectIdFromUrl,
      lastProjectId,
      finalProjectId: projectId,
    });

    if (projectId && !project) {
      // Load the project
      hasLoadedProjectRef.current = true;

      const loadProject = async () => {
        try {
          // Try V2 endpoint first (new projects)
          let response = await fetch(`${API_URL}/api/v2/projects/${projectId}`);

          // If not found, try V1 endpoint (old projects)
          if (!response.ok && response.status === 404) {
            response = await fetch(`${API_URL}/api/projects/${projectId}`);
          }

          const data = await response.json();

          if (response.ok && (data.project || data.id)) {
            // V2 projects return the project directly, V1 wraps it in data.project
            const projectData = data.project || data;
            const normalizedProject = normalizeProject(projectData);

            setProject(normalizedProject);

            if (projectIdFromUrl) {
              setGuidance("✨ Shared project loaded successfully!");
              setTimeout(() => setGuidance(""), 3000);
            }
            // Don't show guidance for restored projects to avoid disruption
          } else {
            // Project not found, clear localStorage
            localStorage.removeItem("zero1_lastProjectId");
            if (projectIdFromUrl) {
              setGuidance(
                "⚠️ Failed to load shared project. It may not exist or be accessible.",
              );
            }
          }
        } catch {
          // Failed to load project
          if (projectIdFromUrl) {
            setGuidance("⚠️ Network error loading shared project.");
          }
        }
      };

      loadProject();
    }
  }, [authLoading, user]); // Run when auth state changes

  // Handle page visibility changes (wake from sleep, tab focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[App] Page became visible - checking project state");

        // Page became visible - check if we need to restore project
        const lastProjectId = localStorage.getItem("zero1_lastProjectId");

        console.log("[App] Visibility check:", {
          hasProjectId: !!lastProjectId,
          hasProject: !!project,
          currentProjectId: project?.id,
          lastProjectId,
          hasUser: !!user,
          authLoading,
        });

        // If we have a lastProjectId but no current project, OR the IDs don't match, restore it
        const needsRestore =
          lastProjectId &&
          user &&
          !authLoading &&
          (!project || project.id !== lastProjectId);

        if (needsRestore) {
          console.log("[App] Restoring project:", lastProjectId);

          const restoreProject = async () => {
            try {
              let response = await fetch(
                `${API_URL}/api/v2/projects/${lastProjectId}`,
              );

              if (!response.ok && response.status === 404) {
                response = await fetch(
                  `${API_URL}/api/projects/${lastProjectId}`,
                );
              }

              const data = await response.json();

              if (response.ok && (data.project || data.id)) {
                const projectData = data.project || data;
                const normalizedProject = normalizeProject(projectData);
                setProject(normalizedProject);
                console.log(
                  "[App] Project restored successfully:",
                  normalizedProject.id,
                );
              } else {
                console.log("[App] Project not found, clearing localStorage");
                localStorage.removeItem("zero1_lastProjectId");
              }
            } catch (error) {
              console.error("[App] Failed to restore project:", error);
            }
          };

          restoreProject();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [project, user, authLoading]);

  // Popup workspace management

  const createPopupWorkspace = async () => {
    if (!project) return;

    const currentPhase = project?.phases?.find(
      (p) => p.phase_number === getPhaseNumber(project.current_phase),
    );

    const workspaceId = Date.now().toString();

    const title = `${currentPhase?.goal || "Current Phase"}`;

    // Create a thread for this workspace

    let threadId: string | undefined;

    try {
      const response = await fetch(`${API_URL}/api/threads`, {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          project_id: project.id,

          title,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        threadId = data.thread?.id;
      }
    } catch {
      // Failed to create thread for workspace
    }

    const newWorkspace: PopupWorkspace = {
      id: workspaceId,

      title,

      position: {
        x: Math.random() * 200 + 100, // Random positioning

        y: Math.random() * 200 + 100,
      },

      messages: [],

      isVisible: true,

      threadId, // Store thread ID for persistence
    };

    setPopupWorkspaces((prev) => {
      const updated = [...prev, newWorkspace];

      // Save to localStorage

      if (project?.id) {
        localStorage.setItem(
          `workspaces_${project.id}`,

          JSON.stringify(updated),
        );
      }

      return updated;
    });
  };

  const closePopupWorkspace = (workspaceId: string) => {
    setPopupWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
  };

  const updateWorkspaceMessages = (
    workspaceId: string,

    messages: ChatMessage[],
  ) => {
    setPopupWorkspaces((prev) =>
      prev.map((w) => (w.id === workspaceId ? { ...w, messages } : w)),
    );
  };

  // Refresh project from API (fetches completed_substeps from Supabase)

  const refreshProject = async () => {
    if (!project?.id) return;

    try {
      // Try V2 endpoint first (new projects)
      let response = await fetch(`${API_URL}/api/v2/projects/${project.id}`);

      // If not found, try V1 endpoint (old projects)
      if (!response.ok && response.status === 404) {
        response = await fetch(`${API_URL}/api/projects/${project.id}`);
      }

      const data = await response.json();

      if (response.ok && (data.project || data.id)) {
        // V2 projects return the project directly, V1 wraps it in data.project
        const projectData = data.project || data;

        // Normalize the project to ensure consistency
        const normalizedProject = normalizeProject(projectData);

        // Fully replace project state to ensure steps array is updated with completion status
        setProject(normalizedProject);

        console.log(
          "[App] Project refreshed - steps updated:",
          normalizedProject.steps?.length || 0,
        );
      }
    } catch {
      // Failed to refresh project
    }
  };

  const handleCreateProject = async (
    goal: string,
    buildApproach?: "code" | "platform" | "auto",
    projectPurpose?: "personal" | "business" | "learning" | "creative",
    coreProof?: string,
    budgetLimit?: "$0" | "$100" | "$1000+",
    clarificationContext?: string,
  ) => {
    if (!goal.trim() || creatingProject) return;

    setCreatingProject(true);
    setGuidance("✨ Creating your project workspace...");

    try {
      const response = await fetch(`${API_URL}/api/v2/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vision: goal.trim(),
          user_id: user?.id, // Send authenticated user ID
          build_approach: buildApproach || "auto",
          project_purpose: projectPurpose || "personal",
          core_proof: coreProof,
          budget_limit: budgetLimit,
          clarification_context: clarificationContext,
        }),
      });

      const data = await response.json();

      if (response.ok && data) {
        // Clear any existing project state first
        setProject(null);
        localStorage.removeItem("zero1_lastProjectId");

        // Small delay to ensure state is cleared
        setTimeout(() => {
          // V2: Project is returned with full roadmap already generated
          setProject(data);
          setGuidance("🎉 Roadmap generated! Ready to start building.");
          setTimeout(() => setGuidance(""), 3000);
        }, 50);

        setCreatingProject(false);
        return; // V2 doesn't need SSE streaming
      } else {
        setGuidance(`Error: ${data?.error || "Failed to create project"}`);
        setCreatingProject(false);
      }
    } catch {
      setGuidance(
        "⚠️ Network error. Please check your connection and try again.",
      );
      setCreatingProject(false);
    }
  };

  const handleInspireMe = async (
    currentGoal: string,

    setThinking: (text: string) => void,
  ) => {
    if (!currentGoal.trim() || inspiring) return;

    setInspiring(true);

    setToolsUsed([]); // Clear previous tools

    try {
      const response = await fetch(`${API_URL}/api/chat/stream`, {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          message: `A crystal-clear vision sentence is the foundation of any successful project. Here's how to refine your idea:



**Original idea:** "${currentGoal}"



**The Vision Formula:** "I want to build ______ so that ______"



**Refinement principles:**

1. **First blank**: Be specific and concrete (not "an app" but "a mobile app for busy parents")

2. **Second blank**: Focus on user benefit, not features (not "has GPS" but "parents never lose track of pickup times")

3. **Clarity test**: Could someone else explain your project after hearing this once?



**Common mistakes to avoid:**

- Too vague ("productivity app")

- Feature-focused ("app with notifications")

- Multiple audiences in one sentence



**Your refined vision statement should use the exact format above and be specific enough that someone could understand your project's value in 5 seconds.**



Return only the refined vision statement using the format "I want to build ______ so that ______."`,

          userId: "vision-generator",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new (window as any).TextDecoder();

      let buffer = "";

      let accumulatedContent = "";

      const allTools: ToolActivity[] = [];

      let receivedDone = false;

      let currentEvent = ""; // persist across chunks

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");

        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line === "") {
            currentEvent = "";

            continue;
          }

          if (line.startsWith(":")) {
            // heartbeat

            continue;
          }

          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();

            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              switch (currentEvent) {
                case "content":
                  accumulatedContent += parsed.delta;

                  setThinking(accumulatedContent);

                  break;

                case "tool_call":
                  allTools.push({
                    type: "tool_start",

                    tool: parsed.tool,

                    args: parsed.args,

                    timestamp: new Date().toISOString(),
                  });

                  setToolsUsed([...allTools]);

                  break;

                case "tool_result":
                  allTools.push({
                    type: "tool_end",

                    tool: parsed.tool,

                    result: parsed.result,

                    timestamp: new Date().toISOString(),
                  });

                  setToolsUsed([...allTools]);

                  break;

                case "tool_error":
                  allTools.push({
                    type: "tool_error",

                    tool: parsed.tool,

                    error: parsed.error,

                    timestamp: new Date().toISOString(),
                  });

                  setToolsUsed([...allTools]);

                  break;

                case "done":
                  // Inspire stream complete

                  receivedDone = true;

                  break;

                case "error":
                  throw new Error(parsed.message || "Streaming error");
              }
            } catch {
              // Failed to parse SSE data - ignore
            }
          }
        }

        if (receivedDone) {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancel errors
          }

          break;
        }
      }
    } catch {
      // Inspire error occurred

      setGuidance("⚠️ Network error. Please try again.");

      setTimeout(() => setGuidance(""), 3000);
    } finally {
      setInspiring(false);
    }
  };

  // Maintain SSE subscription for the active project to receive unlock/refresh events
  useEffect(() => {
    if (!project?.id) {
      if (projectEventSource) {
        projectEventSource.close();
        projectEventSource = null;
      }
      return;
    }

    // V2 projects don't use SSE subscriptions
    // @ts-expect-error - steps property may exist on project
    if (project.steps) {
      return;
    }

    // If an EventSource is already open for this project, keep it
    if (projectEventSource) return;

    try {
      const es = new (window as any).EventSource(
        `${API_URL}/api/projects/stream/${project.id}`,
      );
      projectEventSource = es;

      es.addEventListener("phase_unlocked", (e: Event) => {
        try {
          const { data } = e as any;
          JSON.parse(data);
          // Legacy toast notification - removed setPopupToast (V1 only)
        } catch {
          // Ignore parsing errors
        }
      });

      es.addEventListener("project_refresh_request", async () => {
        // Refresh project from API to pick up latest roadmap/pointers
        try {
          // Try V2 endpoint first (new projects)
          let response = await fetch(
            `${API_URL}/api/v2/projects/${project.id}`,
          );

          // If not found, try V1 endpoint (old projects)
          if (!response.ok && response.status === 404) {
            response = await fetch(`${API_URL}/api/projects/${project.id}`);
          }

          const data = await response.json();
          if (data?.project || data?.id) {
            const projectData = data.project || data;
            setProject(normalizeProject(projectData));
          }
        } catch {
          // Ignore fetch errors
        }
      });

      es.onerror = () => {
        try {
          es.close();
        } catch {
          // Ignore close errors
        }
        projectEventSource = null;
      };
    } catch {
      // Ignore SSE setup errors
    }

    return () => {
      if (projectEventSource) {
        try {
          projectEventSource.close();
        } catch {
          // Ignore close errors
        }
        projectEventSource = null;
      }
    };
  }, [project?.id]);

  // Navigation handlers
  const handleShowAuthModal = () => setShowAuthModal(true);
  const handleCloseAuthModal = () => setShowAuthModal(false);

  const handleSignOut = () => {
    // Clear project state
    setProject(null);
    setUserProjects([]);
    // Clear localStorage
    localStorage.removeItem("zero1_lastProjectId");
    localStorage.removeItem("zero1_userId"); // Clean up legacy userId if it exists
    // Reset the project load ref so next login can restore projects
    hasLoadedProjectRef.current = false;
    // Navigate to landing
    setCurrentView("landing");
  };

  const handleSelectProject = async (projectId: string) => {
    // Load the selected project
    try {
      // Try V2 endpoint first (new projects)
      let response = await fetch(`${API_URL}/api/v2/projects/${projectId}`);

      // If not found, try V1 endpoint (old projects)
      if (!response.ok && response.status === 404) {
        response = await fetch(`${API_URL}/api/projects/${projectId}`);
      }

      const data = await response.json();
      if (response.ok && (data.project || data.id)) {
        // V2 projects return the project directly, V1 wraps it in data.project
        const projectData = data.project || data;
        const normalizedProject = normalizeProject(projectData);

        // Store the project ID for auto-resume
        localStorage.setItem("zero1_lastProjectId", projectId);

        setProject(normalizedProject);
        setCurrentView("workspace");
      }
    } catch {
      // Failed to load project
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!user) return;

    try {
      const token = await getAccessToken();
      const response = await fetch(`${API_URL}/api/v2/projects/${projectId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Remove from local state
        setUserProjects((prev) => prev.filter((p) => p.id !== projectId));
        // If this was the active project, clear it
        if (project?.id === projectId) {
          setProject(null);
          localStorage.removeItem("zero1_lastProjectId");
        }
      }
    } catch {
      // Failed to delete project
    }
  };

  const handleCreateNewFromLibrary = () => {
    setProject(null);
    localStorage.removeItem("zero1_lastProjectId");
    setCurrentView("landing");
  };

  const handleCloseLibrary = () => {
    if (project) {
      setCurrentView("workspace");
    } else {
      setCurrentView("landing");
    }
  };

  const handleExitToLibrary = () => {
    // Clear project and return to landing page
    setProject(null);
    localStorage.removeItem("zero1_lastProjectId");
    setCurrentView("landing");
  };

  // Determine current view based on project state
  useEffect(() => {
    if (currentView === "library") return; // Don't auto-switch when in library

    if (project) {
      setCurrentView("workspace");
    } else {
      setCurrentView("landing");
    }
  }, [project]);

  // Show loading while auth initializes
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Render library view
  if (currentView === "library") {
    return (
      <>
        <ProjectLibrary
          onSelectProject={handleSelectProject}
          onCreateNew={handleCreateNewFromLibrary}
          onClose={handleCloseLibrary}
        />
        {showAuthModal && <AuthModal onClose={handleCloseAuthModal} />}
      </>
    );
  }

  // Render workspace or landing view
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950">
      <NavBar
        hasProject={!!project}
        onShowAuthModal={handleShowAuthModal}
        onSignOut={handleSignOut}
        projectCount={userProjects.length}
        projects={userProjects}
        onSelectProject={handleSelectProject}
        onDeleteProject={handleDeleteProject}
      />

      <div className="flex">
        {/* Collapsible Roadmap Sidebar */}
        <RoadmapSidebarV2
          project={project}
          onOpenFileManager={() => setShowFileManager(true)}
          onOpenMemoryManager={() => setShowMemoryManager(true)}
          onAskAI={() => askAIRef.current?.()}
          onRefreshProject={refreshProject}
          onExitToLibrary={handleExitToLibrary}
        />

        {/* Main Workspace */}
        <main className="flex-1 min-h-[calc(100vh-64px)]">
          <UnifiedWorkspace
            project={project}
            onCreateProject={handleCreateProject}
            onInspireMe={handleInspireMe}
            toolsUsed={toolsUsed}
            setToolsUsed={setToolsUsed}
            creating={creatingProject}
            inspiring={inspiring}
            onRefreshProject={refreshProject}
            onAskAIRef={askAIRef}
            onOpenNewWorkspace={createPopupWorkspace}
          />
        </main>
      </div>

      {/* Guidance Toast */}

      {guidance && (
        <Toast
          message={guidance}
          duration={4000}
          onClose={() => setGuidance("")}
          type={
            guidance.includes("G��") || guidance.includes("=�Ļ")
              ? "success"
              : guidance.includes("G��") || guidance.includes("G��")
                ? "error"
                : "info"
          }
        />
      )}

      {/* Popup Workspaces */}

      {popupWorkspaces.map((workspace) => (
        <PopupWorkspaceComponent
          key={workspace.id}
          workspace={workspace}
          project={project}
          onClose={() => closePopupWorkspace(workspace.id)}
          onUpdateMessages={updateWorkspaceMessages}
        />
      ))}

      {/* Master Control Modal */}

      {project && (
        <MasterControl
          project={project}
          isOpen={showMasterControl}
          onClose={() => setShowMasterControl(false)}
          onProjectUpdate={refreshProject}
        />
      )}

      {/* File Manager Modal */}

      <FileManager
        isOpen={showFileManager}
        onClose={() => setShowFileManager(false)}
      />

      {/* User Memory Manager Modal */}

      <UserMemoryManager
        isOpen={showMemoryManager}
        userId={userId}
        onClose={() => setShowMemoryManager(false)}
      />

      {/* Auth Modal */}

      {showAuthModal && <AuthModal onClose={handleCloseAuthModal} />}
    </div>
  );
}

export default App;
