import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

// Create Supabase client
export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);

// Database types (will be auto-generated later)
export type Database = {
  projects: {
    id: string;
    user_id: string | null;
    goal: string | null;
    status: string | null;
    current_phase: string | null;
    completed_phases: string[];
    completed_substeps: string[];
    roadmap: Record<string, any>;
    created_at: string;
  };
  artifacts: {
    id: string;
    project_id: string;
    type: "single" | "zip" | "repo";
    file_path: string | null;
    file_name: string | null;
    repo_url: string | null;
    repo_branch: string | null;
    size_bytes: number | null;
    uploaded_at: string;
    analyzed_at: string | null;
    signals: Record<string, any>;
    analysis: Record<string, any>;
    status: "uploaded" | "analyzing" | "analyzed" | "failed";
    error_message: string | null;
  };
  artifact_signals: {
    artifact_id: string;
    has_tests: boolean;
    has_linter: boolean;
    has_typescript: boolean;
    has_prettier: boolean;
    has_git: boolean;
    last_commit_time: string | null;
    commit_count: number | null;
    has_deploy_config: boolean;
    deploy_platform: string | null;
    file_count: number;
    folder_depth: number;
    readme_length: number;
    has_documentation: boolean;
    tech_stack: string[];
    created_at: string;
  };
  checkpoints: {
    id: string;
    project_id: string;
    name: string | null;
    reason: string | null;
    created_by: string;
    current_phase: string | null;
    completed_substeps: string[];
    roadmap_snapshot: Record<string, any>;
    project_state_hash: string | null;
    artifact_ids: string[];
    created_at: string;
  };
};

// Helper function to test connection
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("projects").select("count");
    if (error) {
      console.error("[DB] Connection test failed:", error.message);
      return false;
    }
    console.log("[DB] Connection successful");
    return true;
  } catch (err) {
    console.error("[DB] Connection test error:", err);
    return false;
  }
}