import React, { useState, useEffect } from "react";
import "./App.css";

// ---- Utility helpers ----
const cls = (...arr: (string | boolean | undefined)[]) =>
  arr.filter(Boolean).join(" ");

// Get API URL from environment or default to localhost
const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

// ---- Enhanced Animation Components ----
interface AnimatedCardProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

const AnimatedCard: React.FC<AnimatedCardProps> = ({ children, delay = 0, className = "" }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div className={cls(
      "transition-all duration-700 ease-out",
      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      className
    )}>
      {children}
    </div>
  );
};

const PulseLoader = () => (
  <div className="flex items-center gap-1">
    {[0, 1, 2].map(i => (
      <div
        key={i}
        className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"
        style={{ animationDelay: `${i * 0.2}s` }}
      />
    ))}
  </div>
);

// ---- Types ----
interface ProjectSubstep {
  substep_id: string;
  step_number: number;
  label: string;
  prompt_to_send: string;
  commands?: string;
  completed: boolean;
  created_at: string;
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
}

const MasterControl: React.FC<MasterControlProps> = ({ project, isOpen, onClose }) => {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

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
    if (phase.completed) return { icon: "✅", label: "Complete", color: "text-green-400" };
    if (phase.phase_number === project.current_phase) return { icon: "🔄", label: "Active", color: "text-blue-400" };
    if (phase.locked) return { icon: "🔒", label: "Locked", color: "text-gray-500" };
    return { icon: "⏳", label: "Ready", color: "text-yellow-400" };
  };

  const progress = project.phases.length > 0 
    ? Math.round((project.phases.filter(p => p.completed).length / project.phases.length) * 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700/50 rounded-3xl max-w-5xl w-full max-h-[85vh] overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-8 border-b border-gray-700/50 bg-gradient-to-r from-blue-950/30 to-purple-950/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Project Roadmap</h2>
              <p className="text-blue-400 font-medium">{progress}% Complete • {project.phases.length} Phases</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-gray-800/60 hover:bg-gray-700/60 flex items-center justify-center transition-colors backdrop-blur-sm"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
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
                    : phase.phase_number === project.current_phase
                    ? "border-blue-500/60 bg-gradient-to-br from-blue-950/30 to-purple-950/30"
                    : phase.locked
                    ? "border-gray-600/40 bg-gradient-to-br from-gray-900/40 to-gray-800/40"
                    : "border-yellow-500/40 bg-gradient-to-br from-yellow-950/20 to-orange-950/20"
                )}
              >
                {/* Phase Header */}
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={cls(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border-2",
                      phase.completed 
                        ? "bg-green-500 border-green-400 text-white"
                        : phase.phase_number === project.current_phase
                        ? "bg-blue-500 border-blue-400 text-white"
                        : phase.locked
                        ? "bg-gray-600 border-gray-500 text-gray-300"
                        : "bg-yellow-500 border-yellow-400 text-white"
                    )}>
                      {phase.completed ? "✓" : phase.phase_number}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xl font-bold text-white">{phase.goal}</h3>
                        <div className="flex items-center gap-3">
                          <span className={cls("text-sm font-medium", status.color)}>
                            {status.icon} {status.label}
                          </span>
                          <button
                            onClick={() => togglePhaseExpansion(phase.phase_id)}
                            className="w-8 h-8 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 flex items-center justify-center transition-colors"
                          >
                            <svg 
                              className={cls("w-4 h-4 text-gray-400 transition-transform duration-200", isExpanded && "rotate-180")} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-400 leading-relaxed">{phase.why_it_matters}</p>
                    </div>
                  </div>
                </div>

                {/* Substeps (when expanded) */}
                {isExpanded && phase.substeps && phase.substeps.length > 0 && (
                  <div className="px-6 pb-6">
                    <div className="bg-black/20 border border-gray-700/30 rounded-xl p-4 backdrop-blur-sm">
                      <h4 className="text-gray-300 font-semibold mb-3 text-sm uppercase tracking-wide">Substeps</h4>
                      <div className="space-y-2">
                        {phase.substeps.map((substep, index) => (
                          <div
                            key={substep.substep_id}
                            className={cls(
                              "flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
                              substep.completed
                                ? "bg-green-950/30 border border-green-500/20"
                                : "bg-gray-800/40 border border-gray-600/20"
                            )}
                          >
                            <div className={cls(
                              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                              substep.completed
                                ? "bg-green-500 text-white"
                                : "bg-gray-600 text-gray-300"
                            )}>
                              {substep.completed ? "✓" : index + 1}
                            </div>
                            <span className={cls(
                              "font-medium",
                              substep.completed ? "text-green-400" : "text-white"
                            )}>
                              {substep.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---- Execution Engine (Right Panel) ----
interface ExecutionEngineProps {
  project: Project | null;
  onViewRoadmap: () => void;
  onSubstepComplete: (substepId: string) => void;
}

const ExecutionEngine: React.FC<ExecutionEngineProps> = ({ project, onViewRoadmap, onSubstepComplete }) => {
  const [copiedText, setCopiedText] = useState("");

  const copyToClipboard = async (text: string, label: string = "Text") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(""), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const currentPhase = project?.phases?.find(p => p.phase_number === (project?.current_phase || 1));
  const currentSubstep = currentPhase?.substeps?.find(s => s.step_number === (project?.current_substep || 1));
  const nextPhase = project?.phases?.find(p => p.phase_number === ((project?.current_phase || 1) + 1));

  const phaseProgress = currentPhase ? 
    Math.round((currentPhase.substeps.filter(s => s.completed).length / Math.max(currentPhase.substeps.length, 1)) * 100) : 0;

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <div className="p-6 border-b border-gray-700/50 bg-gradient-to-r from-purple-950/50 to-indigo-950/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Execution Engine</h2>
              <p className="text-purple-400 text-sm font-medium">Expert guidance for action</p>
            </div>
          </div>
          {project && (
            <button
              onClick={onViewRoadmap}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              View Roadmap
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {project && currentPhase ? (
          <div className="space-y-6">
            
            {/* Current Phase Status */}
            <div className="bg-gradient-to-br from-blue-950/30 to-indigo-950/30 border border-blue-500/30 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-blue-400 font-semibold text-sm uppercase tracking-wide">Current Phase</h3>
                  <h4 className="text-white font-bold text-lg">{currentPhase.goal}</h4>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-400">{phaseProgress}%</div>
                  <div className="text-blue-400 text-sm font-medium">Complete</div>
                </div>
              </div>
              
              <p className="text-blue-100 mb-4 leading-relaxed">{currentPhase.why_it_matters}</p>
              
              {/* Phase Progress Bar */}
              <div className="bg-blue-950/40 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700"
                  style={{ width: `${phaseProgress}%` }}
                />
              </div>
            </div>

            {/* Current Substep */}
            {currentSubstep && (
              <div className="bg-gradient-to-br from-emerald-950/30 to-green-950/30 border border-emerald-500/30 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-emerald-400 font-semibold text-sm uppercase tracking-wide">Active Substep</h3>
                    <h4 className="text-white font-bold">{currentSubstep.label}</h4>
                  </div>
                  <button
                    onClick={() => onSubstepComplete(currentSubstep.substep_id)}
                    className="w-10 h-10 rounded-xl bg-green-600 hover:bg-green-700 flex items-center justify-center transition-all duration-200 hover:scale-105 shadow-lg shadow-green-500/30"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>

                <button
                  onClick={() => copyToClipboard(currentSubstep.prompt_to_send, "Master Prompt")}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-medium transition-colors"
                >
                  Copy Master Prompt
                </button>
              </div>
            )}

            {/* Phase Substeps Overview */}
            <div className="bg-gradient-to-br from-gray-900/50 to-black/50 border border-gray-600/30 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-gray-400 font-semibold text-sm uppercase tracking-wide mb-4">Phase Progress</h3>
              <div className="space-y-3">
                {currentPhase.substeps.map((substep) => (
                  <div
                    key={substep.substep_id}
                    className={cls(
                      "flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
                      substep.completed
                        ? "bg-green-950/30 border border-green-500/20"
                        : substep.substep_id === currentSubstep?.substep_id
                        ? "bg-blue-950/30 border border-blue-500/30"
                        : "bg-gray-800/40 border border-gray-600/20"
                    )}
                  >
                    <div className={cls(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                      substep.completed
                        ? "bg-green-500 text-white"
                        : substep.substep_id === currentSubstep?.substep_id
                        ? "bg-blue-500 text-white"
                        : "bg-gray-600 text-gray-300"
                    )}>
                      {substep.completed ? "✓" : substep.step_number}
                    </div>
                    <span className={cls(
                      "font-medium",
                      substep.completed ? "text-green-400" : 
                      substep.substep_id === currentSubstep?.substep_id ? "text-blue-400" : "text-gray-300"
                    )}>
                      {substep.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Next Phase Preview */}
            {nextPhase && (
              <div className="bg-gradient-to-br from-yellow-950/20 to-orange-950/20 border border-yellow-500/20 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-yellow-600/20 flex items-center justify-center">
                    <svg className="w-3 h-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-yellow-400 font-semibold text-sm uppercase tracking-wide">Next Phase</h3>
                </div>
                <h4 className="text-white font-bold mb-2">{nextPhase.goal}</h4>
                <p className="text-yellow-200 text-sm leading-relaxed">{nextPhase.why_it_matters}</p>
                <div className="mt-3 text-xs text-yellow-400/80 font-medium">
                  🔒 Complete current phase to unlock
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/20 to-indigo-600/20 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Ready to Execute</h3>
            <p className="text-gray-400 font-medium leading-relaxed max-w-md">
              Create your project to see execution steps and start building with AI-powered guidance.
            </p>
          </div>
        )}
      </div>

      {copiedText && (
        <div className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-10">
          ✓ {copiedText} copied!
        </div>
      )}
    </div>
  );
};

// ---- Ideation Hub (Left Panel) ----
interface IdeationHubProps {
  project: Project | null;
  onCreateProject: (goal: string) => void;
  onInspireMe: (goal: string) => void;
  creating: boolean;
  inspiring: boolean;
}

const IdeationHub: React.FC<IdeationHubProps> = ({ project, onCreateProject, onInspireMe, creating, inspiring }) => {
  const [thinking, setThinking] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isWorkspace, setIsWorkspace] = useState(false);

  // Switch to workspace mode when project is created
  useEffect(() => {
    if (project && !isWorkspace) {
      setIsWorkspace(true);
      // Initialize with first master prompt if available
      const currentPhase = project.phases?.find(p => p.phase_number === project.current_phase);
      const currentSubstep = currentPhase?.substeps?.find(s => s.step_number === project.current_substep);
      if (currentSubstep) {
        setMessages([{
          id: "initial",
          type: "user",
          content: currentSubstep.prompt_to_send,
          timestamp: new Date()
        }]);
      }
    }
  }, [project, isWorkspace]);

  const handleSendMessage = () => {
    if (!currentInput.trim()) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: currentInput.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setCurrentInput("");

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: "I'll help you work through this step. Here's what I recommend...",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
    }, 1000);
  };

  if (isWorkspace) {
    return (
      <div className="h-full flex flex-col">
        {/* Workspace Header */}
        <div className="p-6 border-b border-gray-700/50 bg-gradient-to-r from-blue-950/50 to-purple-950/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Execution Workspace</h2>
                <p className="text-blue-400 text-sm font-medium">AI-powered guidance & collaboration</p>
              </div>
            </div>
            <button
              onClick={() => {setIsWorkspace(false); setMessages([]);}}
              className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              ← Back to Ideation
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={cls("flex", message.type === "user" ? "justify-end" : "justify-start")}>
              <div className={cls(
                "max-w-[80%] rounded-2xl p-4",
                message.type === "user" 
                  ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white"
                  : "bg-gradient-to-br from-gray-800 to-gray-700 text-gray-100 border border-gray-600/50"
              )}>
                <p className="leading-relaxed">{message.content}</p>
                <div className={cls("text-xs mt-2", message.type === "user" ? "text-blue-100" : "text-gray-400")}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-gray-700/50">
          <div className="flex gap-3">
            <textarea
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              placeholder="Continue working on your current substep..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-xl p-4 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-20"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!currentInput.trim()}
              className="w-12 h-20 bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-600 rounded-xl flex items-center justify-center transition-all duration-200"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-700/50 bg-gradient-to-r from-emerald-950/50 to-green-950/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Ideation Hub</h2>
            <p className="text-emerald-400 text-sm font-medium">Creative thinking & vision refinement</p>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-1 p-6 flex flex-col">
        <div className="flex-1 mb-6">
          <textarea
            value={thinking}
            onChange={(e) => setThinking(e.target.value)}
            placeholder="I want to build a SaaS platform for freelancers to manage their clients and invoices..."
            className="w-full h-full bg-gradient-to-br from-gray-800/90 to-gray-900/90 border border-gray-600/50 rounded-2xl p-6 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500/60 transition-all duration-300 resize-none backdrop-blur-sm font-medium leading-relaxed shadow-lg"
            disabled={creating || inspiring}
          />
        </div>

        {/* Action Buttons */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onInspireMe(thinking)}
              disabled={!thinking.trim() || creating || inspiring}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-700 disabled:to-gray-600 text-white py-3 px-4 rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-purple-500/20"
            >
              {inspiring ? (
                <div className="flex items-center justify-center gap-2">
                  <PulseLoader />
                  <span>Inspiring...</span>
                </div>
              ) : (
                "Inspire Me"
              )}
            </button>
            
            <button
              onClick={() => onCreateProject(thinking)}
              disabled={!thinking.trim() || creating || inspiring}
              className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-gray-700 disabled:to-gray-600 text-white py-3 px-4 rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/20"
            >
              {creating ? (
                <div className="flex items-center justify-center gap-2">
                  <PulseLoader />
                  <span>Creating...</span>
                </div>
              ) : (
                "Create Project"
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              className="bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 py-2 px-4 rounded-lg text-sm font-medium transition-colors backdrop-blur-sm"
              disabled={creating || inspiring}
            >
              Save Draft
            </button>
            <button 
              className="bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 py-2 px-4 rounded-lg text-sm font-medium transition-colors backdrop-blur-sm"
              disabled={creating || inspiring}
              onClick={() => setThinking("")}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- Navigation Component ----
const NavBar = () => (
  <nav className="bg-black/95 backdrop-blur-xl border-b border-gray-800/50 shadow-2xl">
    <div className="max-w-7xl mx-auto px-6">
      <div className="flex items-center justify-between h-16">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-purple-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Zero-to-One Builder</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm font-medium">AI-Powered Project Scaffolding</span>
        </div>
      </div>
    </div>
  </nav>
);

// ---- Main App Component ----
function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [guidance, setGuidance] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [inspiring, setInspiring] = useState(false);
  const [showMasterControl, setShowMasterControl] = useState(false);

  const handleCreateProject = async (goal: string) => {
    if (!goal.trim() || creatingProject) return;

    setCreatingProject(true);
    setGuidance("🚀 Creating your project workspace...");

    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.project) {
        setProject(data.project);
        setGuidance("🎯 Generating your action plan...");
        setTimeout(() => handleGeneratePhases(data.project.id), 500);
      } else {
        setGuidance(`❌ Error: ${data?.error || "Failed to create project"}`);
      }
    } catch {
      setGuidance("🔌 Network error. Please check your connection and try again.");
    } finally {
      setCreatingProject(false);
    }
  };

  const handleInspireMe = async (currentGoal: string) => {
    if (!currentGoal.trim() || inspiring) return;

    setInspiring(true);
    setGuidance("✨ Finding inspiration for your idea...");

    try {
      // Simulate AI inspiration API call
      setTimeout(() => {
        const inspirations = [
          "Transform your idea into a platform that uses AI to automate client onboarding and smart invoice predictions...",
          "Expand into a comprehensive freelancer ecosystem with integrated payment processing and client collaboration tools...",
          "Focus on a niche-specific solution for creative freelancers with portfolio integration and project showcase features...",
          "Build a mobile-first platform with time tracking, expense management, and real-time client communication..."
        ];
        
        const randomInspiration = inspirations[Math.floor(Math.random() * inspirations.length)];
        setGuidance(`💡 Inspiration: ${randomInspiration}`);
        setInspiring(false);
      }, 2000);

    } catch {
      setGuidance("🔌 Network error. Please try again.");
      setInspiring(false);
    }
  };

  const handleGeneratePhases = async (projectId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (response.ok) {
        // Simulate progressive revelation: Phase 1 fully expanded, others locked
        const processedProject = {
          ...data.project,
          current_phase: 1,
          current_substep: 1,
          phases: data.project.phases.map((phase: ProjectPhase, index: number) => ({
            ...phase,
            phase_number: index + 1,
            expanded: index === 0, // Only first phase expanded
            locked: index > 0, // Lock future phases
            substeps: index === 0 ? (phase.substeps || []).map((substep: ProjectSubstep, subIndex: number) => ({
              ...substep,
              step_number: subIndex + 1,
              completed: false
            })) : []
          }))
        };

        setProject(processedProject);
        setGuidance("🎯 Perfect! Your action plan is ready. Start with the first master prompt in your execution workspace!");
      } else {
        setGuidance(`❌ Error: ${data?.error || "Failed to generate action plan"}`);
      }
    } catch {
      setGuidance("🔌 Network error. Please check your connection and try again.");
    }
  };

  const handleSubstepComplete = async (substepId: string) => {
    if (!project) return;

    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          substep_id: substepId,
          user_feedback: `Completed substep ${substepId}`,
        }),
      });

      const data = await response.json();

      if (response.ok && data.project) {
        // Update project with completed substep and advance to next
        const updatedProject = { ...project };
        const currentPhase = updatedProject.phases.find(p => p.phase_number === project.current_phase);
        
        if (currentPhase) {
          // Mark substep as complete
          const substep = currentPhase.substeps.find(s => s.substep_id === substepId);
          if (substep) {
            substep.completed = true;
          }

          // Check if all substeps in current phase are complete
          const allSubstepsComplete = currentPhase.substeps.every(s => s.completed);
          
          if (allSubstepsComplete) {
            // Complete current phase and unlock next phase
            currentPhase.completed = true;
            const nextPhase = updatedProject.phases.find(p => p.phase_number === project.current_phase + 1);
            if (nextPhase) {
              nextPhase.locked = false;
              nextPhase.expanded = true;
              updatedProject.current_phase = nextPhase.phase_number;
              updatedProject.current_substep = 1;
              setGuidance(`🎉 Phase ${currentPhase.phase_number} completed! Starting Phase ${nextPhase.phase_number}...`);
            } else {
              setGuidance("🏆 Congratulations! All phases completed. Your project is ready!");
            }
          } else {
            // Advance to next substep in current phase
            const nextSubstep = currentPhase.substeps.find(s => !s.completed);
            if (nextSubstep) {
              updatedProject.current_substep = nextSubstep.step_number;
              setGuidance(`✅ Substep completed! Moving to: ${nextSubstep.label}`);
            }
          }
        }

        setProject(updatedProject);
      } else {
        setGuidance(`❌ Error: ${data?.error || "Failed to complete substep"}`);
      }
    } catch {
      setGuidance("🔌 Network error. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950">
      <NavBar />

      <main className="flex-1 p-6 pb-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 h-[calc(100vh-140px)]">

            {/* Left Panel - Ideation Hub */}
            <AnimatedCard className="bg-gradient-to-br from-gray-900/98 to-black/95 backdrop-blur-xl rounded-3xl border border-gray-700/50 shadow-2xl shadow-black/60 flex flex-col overflow-hidden">
              <IdeationHub
                project={project}
                onCreateProject={handleCreateProject}
                onInspireMe={handleInspireMe}
                creating={creatingProject}
                inspiring={inspiring}
              />
            </AnimatedCard>

            {/* Right Panel - Execution Engine */}
            <AnimatedCard delay={200} className="bg-gradient-to-br from-gray-900/98 to-black/95 backdrop-blur-xl rounded-3xl border border-gray-700/50 shadow-2xl shadow-black/60 flex flex-col overflow-hidden">
              <ExecutionEngine
                project={project}
                onViewRoadmap={() => setShowMasterControl(true)}
                onSubstepComplete={handleSubstepComplete}
              />
            </AnimatedCard>

          </div>

          {/* Guidance Toast */}
          {guidance && (
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-blue-500/30 backdrop-blur-sm border border-blue-400/30 max-w-md text-center font-medium">
              {guidance}
            </div>
          )}
        </div>
      </main>

      {/* Master Control Modal */}
      {project && (
        <MasterControl
          project={project}
          isOpen={showMasterControl}
          onClose={() => setShowMasterControl(false)}
        />
      )}
    </div>
  );
}

export default App;