import React, { useMemo, useState } from "react";
import "./App.css";

// ---- Utility helpers ----
const cls = (...arr: (string | boolean | undefined)[]) =>
  arr.filter(Boolean).join(" ");

// Get API URL from environment or default to localhost
const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

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

interface ProjectStep {
  step_number: number;
  title: string;
  why_text: string;
  substeps: ProjectSubstep[];
  all_substeps_complete: boolean;
  completed: boolean;
  created_at: string;
}

interface Project {
  id: string;
  goal: string;
  status: "clarifying" | "active" | "completed" | "paused";
  current_step: number;
  steps: ProjectStep[];
  history: unknown[];
  clarification_context?: string;
  created_at: string;
  updated_at: string;
}

function NavBar() {
  return (
    <div className="backdrop-blur-xl bg-black/90 border-b border-gray-800/60 sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center font-bold text-white shadow-lg shadow-emerald-500/25">
              A
            </div>
            <div className="absolute -inset-1 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl opacity-20 blur"></div>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
              Accomplish AI
            </h1>
            <p className="text-xs text-gray-400 -mt-0.5">0→1 Prompt Coach</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 rounded-xl text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800/60 transition-all duration-200 border border-gray-700/60 hover:border-gray-600">
            Docs
          </button>
          <button className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 transition-all duration-200 shadow-lg shadow-emerald-500/25">
            Feedback
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [latestMakerNotes, setLatestMakerNotes] = useState("");
  const [clarifyingBusy, setClarifyingBusy] = useState(false);
  const [thinking, setThinking] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [clarificationQuestion, setClarificationQuestion] = useState("");
  const [clarificationAnswer, setClarificationAnswer] = useState("");

  const handleClarify = async (thinkingText: string) => {
    if (!thinkingText.trim()) return;

    setClarifyingBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thinking: thinkingText,
          projectId: project?.id || "",
        }),
      });

      const data = await response.json();

      if (data?.ok && data.clarifications) {
        setLatestMakerNotes(data.clarifications);
      } else {
        setLatestMakerNotes(
          `Error: ${data?.error || "Failed to get clarification"}`,
        );
      }
    } catch {
      setLatestMakerNotes(
        "Network error. Please check your connection and try again.",
      );
    } finally {
      setClarifyingBusy(false);
    }
  };

  const handleCreateProject = async (goal: string) => {
    if (!goal.trim()) return;

    setCreatingProject(true);
    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim() }),
      });

      const data = await response.json();

      if (data?.ok && data.project) {
        setProject(data.project);
        setThinking("");

        // If project is in clarifying status, automatically start clarification
        if (data.project.status === "clarifying") {
          setLatestMakerNotes(
            "🎉 Project created! Let me ask some questions to understand your project better...",
          );
          // Trigger first clarification question
          handleClarification(data.project.id);
        } else {
          setLatestMakerNotes(
            "🎉 Project created! Follow the action plan below to make progress.",
          );
        }
      } else {
        setLatestMakerNotes(
          `❌ Error creating project: ${data?.error || "Unknown error"}`,
        );
      }
    } catch {
      setLatestMakerNotes(
        "🔌 Network error. Please check your connection and try again.",
      );
    } finally {
      setCreatingProject(false);
    }
  };

  const handleClarification = async (
    projectId: string,
    userResponse?: string,
  ) => {
    if (!projectId) return;

    setClarifyingBusy(true);
    try {
      const response = await fetch(
        `${API_URL}/api/projects/${projectId}/clarify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_response: userResponse }),
        },
      );

      const data = await response.json();

      if (data?.ok) {
        setProject(data.project);

        if (data.is_complete) {
          // Clarification complete, action plan generated
          setLatestMakerNotes(
            "🎯 Perfect! I've created your action plan with expert prompts. Copy and paste the prompts below into the Thinking Space above to get detailed guidance!",
          );
          setClarificationQuestion("");
          setClarificationAnswer("");
        } else if (data.question) {
          // Show clarification question
          setClarificationQuestion(data.question);
          setLatestMakerNotes(
            `💭 ${data.message}\n\nQuestion: ${data.question}`,
          );
        }
      } else {
        setLatestMakerNotes(
          `❌ Error: ${data?.error || "Failed to get clarification"}`,
        );
      }
    } catch {
      setLatestMakerNotes(
        "🔌 Network error. Please check your connection and try again.",
      );
    } finally {
      setClarifyingBusy(false);
    }
  };

  const progress = useMemo(() => {
    if (!project?.steps?.length) return 0;
    const done = project.steps.filter((c) => c.completed).length;
    return Math.round((done / Math.max(project.steps.length, 1)) * 100);
  }, [project]);

  const onSubstepComplete = async (stepNumber: number, substepId: string) => {
    if (!project) return;

    try {
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/advance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            substep_id: substepId,
            user_feedback: `Completed substep ${substepId}`,
            context_update: `Substep ${substepId} completed successfully`,
          }),
        },
      );

      const data = await response.json();

      if (data?.ok && data.project) {
        setProject(data.project);
        setLatestMakerNotes(
          data.message || "✅ Substep completed successfully!",
        );
      } else {
        setLatestMakerNotes(
          `❌ Error: ${data?.error || "Failed to complete substep"}`,
        );
      }
    } catch {
      setLatestMakerNotes("🔌 Network error. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950">
      <NavBar />

      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 h-[calc(100vh-120px)]">
            {/* Left Panel - Thinking Space */}
            <div className="bg-gradient-to-br from-gray-900/95 to-black/90 backdrop-blur-xl rounded-3xl border border-gray-700/60 shadow-2xl shadow-black/60 flex flex-col overflow-hidden">
              <div className="p-8 pb-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-white"
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
                    <h2 className="text-2xl font-bold text-white">
                      Thinking Space
                    </h2>
                    <p className="text-gray-400 text-sm">
                      Share your ideas and get AI-powered guidance
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={thinking}
                    onChange={(e) => setThinking(e.target.value)}
                    placeholder="I want to build a mobile app for dog walkers, create a SaaS product for small businesses, learn machine learning..."
                    className="w-full h-48 bg-gray-900/60 border border-gray-600/60 rounded-2xl p-6 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 resize-none backdrop-blur-sm"
                    disabled={clarifyingBusy || creatingProject}
                  />
                  <div className="absolute bottom-4 right-4 text-xs text-gray-500">
                    {thinking.length}/2000
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => handleClarify(thinking)}
                    disabled={
                      clarifyingBusy || !thinking.trim() || creatingProject
                    }
                    className={cls(
                      "flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
                      "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500",
                      "text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02]",
                      "disabled:hover:scale-100 disabled:shadow-blue-500/25",
                    )}
                  >
                    {clarifyingBusy ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Getting Help...
                      </span>
                    ) : (
                      "💡 Get Help"
                    )}
                  </button>

                  <button
                    onClick={() => handleCreateProject(thinking)}
                    disabled={
                      creatingProject || !thinking.trim() || clarifyingBusy
                    }
                    className={cls(
                      "flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
                      "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500",
                      "text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02]",
                      "disabled:hover:scale-100 disabled:shadow-emerald-500/25",
                    )}
                  >
                    {creatingProject ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Creating...
                      </span>
                    ) : (
                      "🚀 Create Project"
                    )}
                  </button>
                </div>

                {/* Clarification UI */}
                {project?.status === "clarifying" && clarificationQuestion && (
                  <div className="mt-6 p-4 bg-yellow-950/30 border border-yellow-700/40 rounded-xl">
                    <h4 className="text-yellow-400 font-semibold mb-3 flex items-center gap-2">
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
                          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Clarification Needed
                    </h4>
                    <p className="text-yellow-100 mb-4">
                      {clarificationQuestion}
                    </p>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={clarificationAnswer}
                        onChange={(e) => setClarificationAnswer(e.target.value)}
                        placeholder="Type your answer here..."
                        className="flex-1 px-4 py-2 bg-gray-900/60 border border-gray-600/60 rounded-lg text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50"
                        disabled={clarifyingBusy}
                        onKeyPress={(e) => {
                          if (
                            e.key === "Enter" &&
                            clarificationAnswer.trim() &&
                            !clarifyingBusy &&
                            project
                          ) {
                            handleClarification(
                              project.id,
                              clarificationAnswer.trim(),
                            );
                            setClarificationAnswer("");
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (project && clarificationAnswer.trim()) {
                            handleClarification(
                              project.id,
                              clarificationAnswer.trim(),
                            );
                            setClarificationAnswer("");
                          }
                        }}
                        disabled={clarifyingBusy || !clarificationAnswer.trim()}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {clarifyingBusy ? "..." : "Answer"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 p-8 pt-4 min-h-0">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.001 8.001 0 01-7.319-4.74c-.04-.094-.061-.196-.061-.3 0-.553.448-1 1-1h14.72c.8 0 1.28.968.76 1.645A8.001 8.001 0 0113 20c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8c0 .344.026.678.077 1"
                    />
                  </svg>
                  Maker Space
                </h3>
                <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-700/40 rounded-2xl p-6 h-full overflow-y-auto">
                  {latestMakerNotes ? (
                    <div className="prose prose-slate prose-invert max-w-none">
                      <p className="text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">
                        {latestMakerNotes}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center py-8">
                      <div className="w-12 h-12 rounded-full bg-gray-800/60 flex items-center justify-center mb-4">
                        <svg
                          className="w-6 h-6 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.001 8.001 0 01-7.319-4.74c-.04-.094-.061-.196-.061-.3 0-.553.448-1 1-1h14.72c.8 0 1.28.968.76 1.645A8.001 8.001 0 0113 20c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8c0 .344.026.678.077 1"
                          />
                        </svg>
                      </div>
                      <p className="text-gray-400 text-sm">
                        Your AI responses will appear here - this is your
                        workspace for building
                      </p>
                      <p className="text-gray-500 text-xs mt-2">
                        💡 Copy expert prompts from your action plan and paste
                        them in Thinking Space above
                      </p>
                      <p className="text-gray-500 text-xs mt-1">
                        📋 AI responses will help you build your project step by
                        step
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel - Project Steps */}
            <div className="bg-gradient-to-br from-gray-900/95 to-black/90 backdrop-blur-xl rounded-3xl border border-gray-700/60 shadow-2xl shadow-black/60 flex flex-col overflow-hidden">
              <div className="p-8 pb-6 border-b border-gray-700/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        Action Plan
                      </h2>
                      <p className="text-gray-400 text-sm">
                        Step-by-step guidance to success
                      </p>
                    </div>
                  </div>

                  {project && (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Progress</p>
                        <p className="text-sm font-semibold text-white">
                          {progress}%
                        </p>
                      </div>
                      <div className="w-20 h-2 bg-gray-800/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-700 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 p-8 pt-6 overflow-y-auto">
                {!project ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <div className="relative mb-8">
                      <div className="w-20 h-20 bg-gradient-to-br from-emerald-400/20 to-green-600/20 rounded-3xl flex items-center justify-center">
                        <svg
                          className="w-10 h-10 text-emerald-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      </div>
                      <div className="absolute -inset-4 bg-gradient-to-br from-emerald-400/10 to-green-600/10 rounded-full blur-xl"></div>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-3">
                      Ready to Build Something Amazing?
                    </h3>
                    <p className="text-gray-400 max-w-md leading-relaxed">
                      Share your vision in the thinking space and I'll help you
                      break it down into actionable steps.
                    </p>
                    <div className="mt-8 flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        Get clarity
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse delay-150"></div>
                        Create project
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse delay-300"></div>
                        Take action
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {project.steps.map((step) => (
                      <div
                        key={step.step_number}
                        className={cls(
                          "group relative bg-gray-900/40 backdrop-blur-sm border rounded-2xl p-6 transition-all duration-300",
                          step.completed
                            ? "border-emerald-500/30 bg-emerald-950/20"
                            : "border-gray-700/40 hover:border-gray-600/60 hover:bg-gray-900/60",
                        )}
                      >
                        {/* Step Header */}
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div
                              className={cls(
                                "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shadow-lg",
                                step.completed
                                  ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white"
                                  : "bg-gradient-to-br from-blue-500 to-purple-600 text-white",
                              )}
                            >
                              {step.completed ? "✓" : step.step_number}
                            </div>
                            <div>
                              <h4 className="font-bold text-white text-lg">
                                {step.title}
                              </h4>
                              <p className="text-gray-400 text-sm mt-1">
                                {step.why_text}
                              </p>
                            </div>
                          </div>

                          <span
                            className={cls(
                              "px-3 py-1 rounded-full text-xs font-medium border",
                              step.completed
                                ? "bg-emerald-950/50 text-emerald-400 border-emerald-500/30"
                                : "bg-gray-900/60 text-gray-400 border-gray-600/40",
                            )}
                          >
                            {step.completed ? "Completed" : "In Progress"}
                          </span>
                        </div>

                        {/* Substeps */}
                        <div className="space-y-4">
                          {step.substeps.map((substep) => (
                            <div
                              key={substep.substep_id}
                              className={cls(
                                "p-5 rounded-xl border transition-all duration-200",
                                substep.completed
                                  ? "bg-emerald-950/20 border-emerald-500/30"
                                  : "bg-gray-900/40 border-gray-700/40 hover:border-gray-600/60",
                              )}
                            >
                              <div className="flex items-center justify-between mb-4">
                                <h5 className="font-semibold text-white">
                                  {substep.label}
                                </h5>
                                <button
                                  onClick={() =>
                                    onSubstepComplete(
                                      step.step_number,
                                      substep.substep_id,
                                    )
                                  }
                                  disabled={substep.completed}
                                  className={cls(
                                    "px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200",
                                    substep.completed
                                      ? "bg-emerald-600 text-white cursor-default"
                                      : "bg-blue-600 hover:bg-blue-500 text-white hover:scale-105",
                                  )}
                                >
                                  {substep.completed ? "✓ Done" : "Mark Done"}
                                </button>
                              </div>

                              {/* Main Prompt to Send */}
                              <div className="mb-4 bg-gradient-to-r from-purple-950/40 to-blue-950/40 border border-purple-700/30 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs font-medium uppercase tracking-wider text-purple-400">
                                    📝 SEND THIS PROMPT:
                                  </div>
                                  <button
                                    onClick={() =>
                                      window.navigator.clipboard.writeText(
                                        substep.prompt_to_send,
                                      )
                                    }
                                    className="px-2 py-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 rounded text-xs text-purple-300 transition-all duration-200 hover:scale-105"
                                    title="Copy prompt to clipboard"
                                  >
                                    📋 Copy
                                  </button>
                                </div>
                                <p className="text-purple-100 font-medium leading-relaxed">
                                  {substep.prompt_to_send}
                                </p>
                              </div>

                              {substep.commands && (
                                <div className="mb-3 bg-black/60 border border-gray-700/40 rounded-lg p-3">
                                  <div className="text-xs font-medium uppercase tracking-wider text-orange-400 mb-2">
                                    💻 COMMANDS:
                                  </div>
                                  <pre className="text-sm text-orange-200 font-mono">
                                    {substep.commands}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Completion Indicator */}
                        {step.completed && (
                          <div className="absolute -inset-px bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-2xl pointer-events-none"></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
