import { useState } from "react";
import "./App.css";
import ThinkingPane from "./components/ThinkingPane";
import PromptPane from "./components/PromptPane";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ProjectStep {
  step_number: number;
  prompt_text: string;
  why_text: string;
  completed: boolean;
  created_at: string;
}

interface ProjectHistory {
  id: string;
  project_id: string;
  input_text: string;
  output_text: string;
  created_at: string;
}

interface Project {
  id: string;
  goal: string;
  status: "active" | "completed" | "paused";
  current_step: number;
  steps: ProjectStep[];
  history: ProjectHistory[];
  created_at: string;
  updated_at: string;
}

function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

  const createProject = async (goal: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          os: "windows",
          skill: "beginner",
        }),
      });
      const data = await response.json();
      if (data.ok && data.project) {
        setProject(data.project);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create project:", error);
    } finally {
      setLoading(false);
    }
  };

  const advanceProject = async (stepNumber: number) => {
    if (!project) return;

    try {
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/advance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completed_step_number: stepNumber,
            user_feedback: `Completed step ${stepNumber}`,
            context_update: `projectId: ${project.id}, Step ${stepNumber} completed successfully`,
          }),
        },
      );
      const data = await response.json();
      if (data.ok && data.project) {
        setProject(data.project);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to advance project:", error);
    }
  };

  // No auto-creation - user starts fresh

  return (
    <div className="h-screen grid grid-cols-2">
      <ThinkingPane
        onCreateProject={createProject}
        loading={loading}
        projectId={project?.id}
      />
      <PromptPane project={project} onStepComplete={advanceProject} />
    </div>
  );
}

export default App;
