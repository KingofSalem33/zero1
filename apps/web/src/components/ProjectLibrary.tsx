/**
 * Project Library Component
 * Displays all user projects with search, filter, and quick actions
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

interface ProjectItem {
  id: string;
  goal: string;
  status: string;
  created_at: string;
  current_phase?: number;
  last_accessed_at?: string;
  completion_percentage?: number;
}

interface ProjectLibraryProps {
  onSelectProject: (projectId: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}

export function ProjectLibrary({
  onSelectProject,
  onCreateNew,
  onClose,
}: ProjectLibraryProps) {
  const { user, getAccessToken } = useAuth();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [user]);

  const loadProjects = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      const response = await fetch(`${API_URL}/api/v2/projects`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      } else {
        setError("Failed to load projects");
      }
    } catch (err) {
      console.error("Error loading projects:", err);
      setError("Network error loading projects");
    } finally {
      setLoading(false);
    }
  };

  // Filter projects by search query
  const filteredProjects = projects.filter((p) =>
    p.goal.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Sort by last accessed or created date
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const dateA = new Date(a.last_accessed_at || a.created_at).getTime();
    const dateB = new Date(b.last_accessed_at || b.created_at).getTime();
    return dateB - dateA; // Most recent first
  });

  // Get phase display
  const getPhaseDisplay = (phase?: number) => {
    if (phase === undefined || phase === null) return "P0";
    return `P${phase}`;
  };

  // Format date as "2d ago", "1w ago", etc.
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffWeeks < 4) return `${diffWeeks}w ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors"
              title="Back"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="text-2xl font-bold">My Projects</h1>
            <span className="text-sm text-neutral-400">
              ({projects.length})
            </span>
          </div>

          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Project
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400">
            {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && sortedProjects.length === 0 && (
          <div className="text-center py-20">
            <svg
              className="w-20 h-20 mx-auto mb-4 text-neutral-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <h3 className="text-xl font-semibold text-neutral-300 mb-2">
              {searchQuery ? "No projects found" : "No projects yet"}
            </h3>
            <p className="text-neutral-500 mb-6">
              {searchQuery
                ? "Try a different search term"
                : "Create your first project to get started"}
            </p>
            {!searchQuery && (
              <button
                onClick={onCreateNew}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
              >
                Create Project
              </button>
            )}
          </div>
        )}

        {/* Projects Grid */}
        {!loading && !error && sortedProjects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className="group text-left p-5 bg-neutral-900 border border-neutral-700 hover:border-neutral-600 rounded-xl transition-all hover:scale-102"
              >
                {/* Project Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate mb-1 group-hover:text-blue-400 transition-colors">
                      {project.goal}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md font-medium">
                        {getPhaseDisplay(project.current_phase)}
                      </span>
                      {project.completion_percentage !== undefined && (
                        <span>"</span>
                      )}
                      {project.completion_percentage !== undefined && (
                        <span>{project.completion_percentage}%</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                {project.completion_percentage !== undefined && (
                  <div className="mb-3">
                    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${project.completion_percentage}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Project Footer */}
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span className="capitalize">{project.status}</span>
                  <span>
                    {formatDate(project.last_accessed_at || project.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
