import { useState } from "react";

interface ProjectStep {
  step_number: number;
  prompt_text: string;
  why_text: string;
  completed: boolean;
  created_at: string;
}

interface Project {
  id: string;
  goal: string;
  status: "active" | "completed" | "paused";
  current_step: number;
  steps: ProjectStep[];
  created_at: string;
  updated_at: string;
}

interface PromptPaneProps {
  project?: Project;
  onStepComplete: (stepNumber: number) => Promise<void>;
}

export default function PromptPane({
  project,
  onStepComplete,
}: PromptPaneProps) {
  const [completingStep, setCompletingStep] = useState<number | null>(null);

  const copyToClipboard = async (text: string) => {
    try {
      await window.navigator.clipboard.writeText(text);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to copy text: ", err);
    }
  };

  const handleMarkComplete = async (stepNumber: number) => {
    setCompletingStep(stepNumber);
    try {
      await onStepComplete(stepNumber);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to complete step:", error);
    } finally {
      setCompletingStep(null);
    }
  };

  const currentStep = project?.steps.find(
    (step) => step.step_number === project.current_step,
  );
  const displaySteps = project?.steps || [];

  return (
    <div className="h-full flex flex-col p-6 bg-white">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Project Steps
        </h2>
        {project ? (
          <div className="space-y-2">
            <p className="text-gray-600 text-sm">Goal: {project.goal}</p>
            <p className="text-gray-600 text-sm">
              Step {project.current_step} of {project.steps.length} • Status:{" "}
              {project.status}
            </p>
          </div>
        ) : (
          <p className="text-gray-600 text-sm">
            Create a project to see guided steps
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {!project ? (
          <div className="max-w-lg mx-auto py-8 px-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-blue-600"
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
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Welcome to Project Coach
              </h3>
              <p className="text-gray-600 mb-6">
                Your AI-powered project planning assistant that breaks down your
                ideas into actionable steps.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-blue-900 mb-2">How it works:</h4>
              <ol className="text-sm text-blue-800 space-y-2">
                <li className="flex items-start">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-medium mr-2 mt-0.5">
                    1
                  </span>
                  <span>Describe your project idea in the thinking space</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-medium mr-2 mt-0.5">
                    2
                  </span>
                  <span>Get clarifying questions to refine your vision</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-medium mr-2 mt-0.5">
                    3
                  </span>
                  <span>
                    Click "Create Project" to generate your action plan
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-medium mr-2 mt-0.5">
                    4
                  </span>
                  <span>
                    Follow step-by-step guidance tailored to your project
                  </span>
                </li>
              </ol>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Perfect for:</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Building web or mobile applications</li>
                <li>• Planning business or creative projects</li>
                <li>• Learning new technologies or skills</li>
                <li>• Organizing complex multi-step endeavors</li>
              </ul>
            </div>

            <div className="text-center mt-6">
              <p className="text-sm text-gray-500">
                👈 Start by sharing your project idea in the thinking space
              </p>
            </div>
          </div>
        ) : currentStep ? (
          <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-medium">
                  {currentStep.step_number}
                </span>
                <h3 className="text-sm font-medium text-gray-900">
                  Current Step
                </h3>
              </div>
              <p className="text-sm text-gray-700 mb-2">
                <strong>Why this step matters:</strong> {currentStep.why_text}
              </p>
            </div>

            <div className="mb-3">
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                Prompt:
              </h3>
              <div className="relative">
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto whitespace-pre-wrap border">
                  {currentStep.prompt_text}
                </pre>
                <button
                  onClick={() => copyToClipboard(currentStep.prompt_text)}
                  className="absolute top-2 right-2 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                  title="Copy to clipboard"
                >
                  Copy
                </button>
              </div>
            </div>

            <button
              onClick={() => handleMarkComplete(currentStep.step_number)}
              disabled={completingStep === currentStep.step_number}
              className="px-3 py-1 text-sm rounded transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {completingStep === currentStep.step_number
                ? "Completing..."
                : "Mark Complete"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-green-600 font-medium">
              🎉 All steps completed!
            </p>
          </div>
        )}

        {project && project.steps.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              All Steps
            </h3>
            <div className="space-y-2">
              {displaySteps.map((step) => (
                <div
                  key={step.step_number}
                  className={`border rounded p-3 text-sm transition-all ${
                    step.completed
                      ? "bg-green-50 border-green-200"
                      : step.step_number === project.current_step
                        ? "bg-blue-50 border-blue-200"
                        : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium ${
                        step.completed
                          ? "bg-green-600 text-white"
                          : step.step_number === project.current_step
                            ? "bg-blue-600 text-white"
                            : "bg-gray-400 text-white"
                      }`}
                    >
                      {step.completed ? "✓" : step.step_number}
                    </span>
                    <span className="text-gray-700">{step.why_text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
