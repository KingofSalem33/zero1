/**
 * Static File Analysis Utilities
 * Analyzes uploaded files without LLM to extract structural signals
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export type ArtifactType =
  | "code"
  | "document"
  | "design"
  | "plan"
  | "content"
  | "unknown";

export interface ArtifactSignals {
  // Artifact type
  artifact_type: ArtifactType;
  primary_file_types: string[];

  // Code quality indicators
  has_tests: boolean;
  has_linter: boolean;
  has_typescript: boolean;
  has_prettier: boolean;

  // Version control
  has_git: boolean;
  last_commit_time: Date | null;
  commit_count: number;

  // Deployment
  has_deploy_config: boolean;
  deploy_platform: string | null;

  // Project structure
  file_count: number;
  folder_depth: number;
  readme_length: number;
  has_documentation: boolean;

  // Tech stack
  tech_stack: string[];

  // Content hash for diff detection
  content_hash?: string;
}

/**
 * Detect artifact type based on file extensions and content
 */
export function detectArtifactType(
  filePath: string,
  fileTypes: string[],
): ArtifactType {
  const extension = path.extname(filePath).toLowerCase();

  // Single file detection
  if (fs.statSync(filePath).isFile()) {
    if ([".pdf", ".doc", ".docx"].includes(extension)) return "document";
    if (
      [".png", ".jpg", ".jpeg", ".svg", ".gif", ".psd", ".ai"].includes(
        extension,
      )
    )
      return "design";
    if ([".md", ".txt"].includes(extension)) {
      // Check if it's a business plan or content
      const content = fs.readFileSync(filePath, "utf-8").toLowerCase();
      if (
        content.includes("business model") ||
        content.includes("revenue") ||
        content.includes("market analysis")
      ) {
        return "plan";
      }
      return "content";
    }
  }

  // Directory detection - analyze file type distribution
  const codeExtensions = [
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
  ];
  const documentExtensions = [".pdf", ".doc", ".docx"];
  const designExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".psd",
    ".ai",
    ".fig",
  ];
  const contentExtensions = [".md", ".txt", ".html"];

  const codeCount = fileTypes.filter((ext) =>
    codeExtensions.includes(ext),
  ).length;
  const docCount = fileTypes.filter((ext) =>
    documentExtensions.includes(ext),
  ).length;
  const designCount = fileTypes.filter((ext) =>
    designExtensions.includes(ext),
  ).length;
  const contentCount = fileTypes.filter((ext) =>
    contentExtensions.includes(ext),
  ).length;

  const total = codeCount + docCount + designCount + contentCount;
  if (total === 0) return "unknown";

  // Return majority type
  if (codeCount / total > 0.5) return "code";
  if (docCount / total > 0.3) return "document";
  if (designCount / total > 0.3) return "design";
  if (contentCount / total > 0.3) return "content";

  return "unknown";
}

/**
 * Generate content hash for diff detection
 */
export function generateContentHash(filePath: string): string {
  const hash = crypto.createHash("sha256");

  if (fs.statSync(filePath).isDirectory()) {
    // Hash directory structure and key files
    const files = getAllFilesSync(filePath).sort();
    files.forEach((file) => {
      const relativePath = path.relative(filePath, file);
      const stats = fs.statSync(file);
      hash.update(`${relativePath}:${stats.size}:${stats.mtimeMs}`);
    });
  } else {
    // Hash single file content
    const content = fs.readFileSync(filePath);
    hash.update(content);
  }

  return hash.digest("hex");
}

/**
 * Synchronous version of getAllFiles for hashing
 */
function getAllFilesSync(dirPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name === "node_modules" || entry.name === ".git") continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return files;
}

/**
 * Recursively analyze a directory and extract signals
 */
export async function analyzeDirectory(
  dirPath: string,
): Promise<ArtifactSignals> {
  const files = await getAllFiles(dirPath);
  const fileExtensions = files.map((f) => path.extname(f).toLowerCase());

  const signals: ArtifactSignals = {
    artifact_type: detectArtifactType(dirPath, fileExtensions),
    primary_file_types: [...new Set(fileExtensions)].slice(0, 10),
    has_tests: false,
    has_linter: false,
    has_typescript: false,
    has_prettier: false,
    has_git: false,
    last_commit_time: null,
    commit_count: 0,
    has_deploy_config: false,
    deploy_platform: null,
    file_count: files.length,
    folder_depth: calculateMaxDepth(files, dirPath),
    readme_length: 0,
    has_documentation: false,
    tech_stack: [],
    content_hash: generateContentHash(dirPath),
  };

  // Analyze each file
  for (const file of files) {
    const filename = path.basename(file).toLowerCase();
    const ext = path.extname(file).toLowerCase();

    // Test detection
    if (
      filename.includes("test") ||
      filename.includes("spec") ||
      file.includes("__tests__") ||
      file.includes("/tests/")
    ) {
      signals.has_tests = true;
    }

    // Linter detection
    if (
      filename === ".eslintrc" ||
      filename === ".eslintrc.js" ||
      filename === ".eslintrc.json" ||
      filename === "eslint.config.js"
    ) {
      signals.has_linter = true;
    }

    // TypeScript detection
    if (ext === ".ts" || ext === ".tsx" || filename === "tsconfig.json") {
      signals.has_typescript = true;
    }

    // Prettier detection
    if (
      filename === ".prettierrc" ||
      filename === ".prettierrc.js" ||
      filename === ".prettierrc.json" ||
      filename === "prettier.config.js"
    ) {
      signals.has_prettier = true;
    }

    // Git detection
    if (file.includes(".git")) {
      signals.has_git = true;
    }

    // Deploy config detection
    if (
      filename === "vercel.json" ||
      filename === "netlify.toml" ||
      filename === "dockerfile" ||
      filename === "docker-compose.yml" ||
      filename === ".platform.app.yaml" ||
      filename === "railway.json"
    ) {
      signals.has_deploy_config = true;
      signals.deploy_platform = detectDeployPlatform(filename);
    }

    // README detection
    if (filename.startsWith("readme")) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        signals.readme_length = content.length;
        signals.has_documentation = content.length > 100;
      } catch {
        // Ignore read errors
      }
    }

    // Documentation folder detection
    if (file.includes("/docs/") || file.includes("/documentation/")) {
      signals.has_documentation = true;
    }
  }

  // Tech stack detection from package.json files (search recursively)
  const packageJsonFiles = files.filter((f) => f.endsWith("package.json"));
  const techStack = new Set<string>();

  for (const pkgFile of packageJsonFiles) {
    // Skip node_modules package.json files
    if (pkgFile.includes("node_modules")) continue;

    try {
      const packageJson = JSON.parse(fs.readFileSync(pkgFile, "utf-8"));
      const techs = detectTechStack(packageJson);
      techs.forEach((tech) => techStack.add(tech));
    } catch {
      // Ignore parsing errors
    }
  }

  signals.tech_stack = Array.from(techStack);

  // Git commit analysis
  if (signals.has_git) {
    const gitStats = await analyzeGitHistory(dirPath);
    signals.last_commit_time = gitStats.lastCommit;
    signals.commit_count = gitStats.commitCount;
  }

  return signals;
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  function walkSync(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules and .git internals
        if (
          entry.name === "node_modules" ||
          entry.name === ".next" ||
          entry.name === "dist" ||
          entry.name === "build"
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          walkSync(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  walkSync(dirPath);
  return files;
}

/**
 * Calculate maximum folder depth
 */
function calculateMaxDepth(files: string[], basePath: string): number {
  let maxDepth = 0;

  for (const file of files) {
    const relative = path.relative(basePath, file);
    const depth = relative.split(path.sep).length;
    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

/**
 * Detect deploy platform from config file
 */
function detectDeployPlatform(filename: string): string | null {
  if (filename === "vercel.json") return "vercel";
  if (filename === "netlify.toml") return "netlify";
  if (filename === "dockerfile" || filename === "docker-compose.yml")
    return "docker";
  if (filename === ".platform.app.yaml") return "platform.sh";
  if (filename === "railway.json") return "railway";
  return null;
}

/**
 * Detect tech stack from package.json dependencies
 */
function detectTechStack(packageJson: any): string[] {
  const stack: Set<string> = new Set();

  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  // Framework detection
  if (allDeps["react"]) stack.add("react");
  if (allDeps["vue"]) stack.add("vue");
  if (allDeps["angular"]) stack.add("angular");
  if (allDeps["svelte"]) stack.add("svelte");
  if (allDeps["next"]) stack.add("nextjs");
  if (allDeps["nuxt"]) stack.add("nuxt");
  if (allDeps["express"]) stack.add("express");
  if (allDeps["fastify"]) stack.add("fastify");
  if (allDeps["nestjs"]) stack.add("nestjs");

  // Database detection
  if (allDeps["prisma"] || allDeps["@prisma/client"]) stack.add("prisma");
  if (allDeps["mongoose"]) stack.add("mongodb");
  if (allDeps["pg"]) stack.add("postgresql");
  if (allDeps["mysql"] || allDeps["mysql2"]) stack.add("mysql");
  if (allDeps["@supabase/supabase-js"]) stack.add("supabase");

  // Testing frameworks
  if (allDeps["jest"]) stack.add("jest");
  if (allDeps["vitest"]) stack.add("vitest");
  if (allDeps["mocha"]) stack.add("mocha");
  if (allDeps["cypress"]) stack.add("cypress");
  if (allDeps["playwright"]) stack.add("playwright");

  // Build tools
  if (allDeps["vite"]) stack.add("vite");
  if (allDeps["webpack"]) stack.add("webpack");
  if (allDeps["turbo"]) stack.add("turborepo");

  // TypeScript
  if (allDeps["typescript"]) stack.add("typescript");

  // Styling
  if (allDeps["tailwindcss"]) stack.add("tailwind");
  if (allDeps["sass"] || allDeps["node-sass"]) stack.add("sass");

  return Array.from(stack);
}

/**
 * Analyze git history for commit stats
 */
async function analyzeGitHistory(
  dirPath: string,
): Promise<{ lastCommit: Date | null; commitCount: number }> {
  const { execSync } = await import("child_process");

  try {
    // Get last commit timestamp
    const lastCommitTimestamp = execSync("git log -1 --format=%ct", {
      cwd: dirPath,
      encoding: "utf-8",
    }).trim();

    const lastCommit = lastCommitTimestamp
      ? new Date(parseInt(lastCommitTimestamp) * 1000)
      : null;

    // Get total commit count
    const commitCount = parseInt(
      execSync("git rev-list --count HEAD", {
        cwd: dirPath,
        encoding: "utf-8",
      }).trim(),
    );

    return { lastCommit, commitCount };
  } catch {
    // Git not initialized or no commits
    return { lastCommit: null, commitCount: 0 };
  }
}

/**
 * Analyze a single uploaded file
 */
export async function analyzeSingleFile(
  filePath: string,
): Promise<ArtifactSignals> {
  const filename = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  const signals: ArtifactSignals = {
    artifact_type: detectArtifactType(filePath, [ext]),
    primary_file_types: [ext],
    has_tests: false,
    has_linter: false,
    has_typescript: ext === ".ts" || ext === ".tsx",
    has_prettier: false,
    has_git: false,
    last_commit_time: null,
    commit_count: 0,
    has_deploy_config: false,
    deploy_platform: null,
    file_count: 1,
    folder_depth: 0,
    readme_length: 0,
    has_documentation: filename.startsWith("readme"),
    tech_stack: [],
    content_hash: generateContentHash(filePath),
  };

  // Detect file type from extension
  const techFromExt = detectTechFromExtension(ext);
  if (techFromExt) {
    signals.tech_stack.push(techFromExt);
  }

  // Check if it's a test file
  if (filename.includes("test") || filename.includes("spec")) {
    signals.has_tests = true;
  }

  // Check if it's a README
  if (filename.startsWith("readme")) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      signals.readme_length = content.length;
      signals.has_documentation = content.length > 100;
    } catch {
      // Ignore read errors
    }
  }

  return signals;
}

/**
 * Detect technology from file extension
 */
function detectTechFromExtension(ext: string): string | null {
  const extMap: Record<string, string> = {
    ".js": "javascript",
    ".jsx": "react",
    ".ts": "typescript",
    ".tsx": "react",
    ".py": "python",
    ".java": "java",
    ".go": "golang",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".vue": "vue",
    ".svelte": "svelte",
  };

  return extMap[ext] || null;
}
