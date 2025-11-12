/**
 * Avatar Menu Component
 * Displays user avatar with dropdown menu for authenticated users
 * Shows "Sign In" button for unauthenticated users
 */

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

interface Project {
  id: string;
  goal: string;
  created_at?: string;
  updated_at?: string;
}

interface AvatarMenuProps {
  onShowAuthModal: () => void;
  onSignOut?: () => void;
  projectCount?: number;
  projects?: Project[];
  onSelectProject?: (project: Project) => void;
  onDeleteProject?: (projectId: string) => void;
}

export function AvatarMenu({
  onShowAuthModal,
  onSignOut,
  projectCount = 0,
  projects = [],
  onSelectProject,
  onDeleteProject,
}: AvatarMenuProps) {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (
        menuRef.current &&
        event.target &&
        !menuRef.current.contains(event.target as never)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get user initials for avatar
  const getInitials = () => {
    if (!user?.email) return "?";
    return user.email.split("@")[0].substring(0, 2).toUpperCase();
  };

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
    onSignOut?.(); // Clear app state
  };

  // Not authenticated - show sign in button
  if (!user) {
    return (
      <button
        onClick={onShowAuthModal}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm"
      >
        Sign In
      </button>
    );
  }

  // Authenticated - show avatar menu
  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-neutral-800 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
          {getInitials()}
        </div>
        <svg
          className={`w-4 h-4 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden z-50">
          {/* User Info Section */}
          <div className="px-4 py-3 border-b border-neutral-700">
            <div className="text-sm font-medium text-white truncate">
              {user.email}
            </div>
            <div className="text-xs text-neutral-400 mt-0.5">
              {projectCount} {projectCount === 1 ? "project" : "projects"}
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {/* My Projects Toggle */}
            <button
              onClick={() => setShowProjects(!showProjects)}
              className="w-full px-4 py-2.5 text-left text-sm text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center gap-3"
            >
              <svg
                className="w-5 h-5 text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <div className="flex-1">
                <div className="font-medium">My Projects</div>
                <div className="text-xs text-neutral-500">
                  {projectCount} {projectCount === 1 ? "project" : "projects"}
                </div>
              </div>
              <svg
                className={`w-4 h-4 text-neutral-400 transition-transform ${showProjects ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Projects Dropdown */}
            {showProjects && (
              <div className="max-h-64 overflow-y-auto bg-neutral-800/50">
                {projects.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-neutral-500 text-center">
                    No projects yet
                  </div>
                ) : (
                  projects.map((project) => (
                    <div
                      key={project.id}
                      className="px-4 py-2.5 hover:bg-neutral-700/50 transition-colors flex items-center gap-2 group"
                    >
                      <button
                        onClick={() => {
                          onSelectProject?.(project);
                          setIsOpen(false);
                          setShowProjects(false);
                        }}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="text-sm text-neutral-200 truncate">
                          {project.goal}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {project.updated_at
                            ? new Date(project.updated_at).toLocaleDateString()
                            : project.created_at
                              ? new Date(
                                  project.created_at,
                                ).toLocaleDateString()
                              : ""}
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            window.confirm(
                              `Delete "${project.goal.substring(0, 50)}${project.goal.length > 50 ? "..." : ""}"?`,
                            )
                          ) {
                            onDeleteProject?.(project.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded transition-all"
                        title="Delete project"
                      >
                        <svg
                          className="w-4 h-4 text-red-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-neutral-700 my-1" />

            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-neutral-800 transition-colors flex items-center gap-3"
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
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
