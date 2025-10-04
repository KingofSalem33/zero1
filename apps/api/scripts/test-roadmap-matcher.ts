/**
 * Test Script: Artifact Roadmap Matcher
 *
 * Tests the rule-based substep matching logic with various artifact scenarios
 */

import {
  matchArtifactToRoadmap,
  mergeCompletionResults,
  type Phase,
} from "../src/services/artifact-roadmap-matcher";
import type { ArtifactSignals } from "../src/services/artifact-analyzer";

// Test roadmap (simplified version of actual roadmap)
const testRoadmap: Phase[] = [
  {
    phase_number: 1,
    title: "Build Environment",
    substeps: [
      { substep_number: 1, title: "Identify tools" },
      { substep_number: 2, title: "Install and configure" },
      { substep_number: 3, title: "Create workspace" },
      { substep_number: 4, title: "Hello World" },
    ],
  },
  {
    phase_number: 2,
    title: "Core Loop",
    substeps: [
      { substep_number: 1, title: "Define Input→Process→Output" },
      { substep_number: 2, title: "Implement core loop" },
      { substep_number: 3, title: "Test core loop" },
    ],
  },
  {
    phase_number: 3,
    title: "Layered Expansion",
    substeps: [
      { substep_number: 1, title: "Add feature layer 1" },
      { substep_number: 2, title: "Add feature layer 2" },
    ],
  },
];

// Test Case 1: Beginner project (just started)
console.log("\n" + "=".repeat(60));
console.log("TEST 1: Beginner Project (Just Started)");
console.log("=".repeat(60));

const beginnerSignals: ArtifactSignals = {
  has_tests: false,
  has_linter: false,
  has_typescript: false,
  has_prettier: false,
  has_git: false,
  last_commit_time: null,
  commit_count: 0,
  has_deploy_config: false,
  deploy_platform: null,
  file_count: 3,
  folder_depth: 1,
  readme_length: 50,
  has_documentation: false,
  tech_stack: ["javascript"],
};

const beginnerResult = matchArtifactToRoadmap(beginnerSignals, testRoadmap);

console.log("\nInput:", beginnerSignals);
console.log("\nResult:");
console.log("  Recommended Phase:", beginnerResult.recommended_phase);
console.log("  Completed Substeps:", beginnerResult.completed_substeps.length);
console.log("  Progress:", beginnerResult.progress_percentage + "%");
console.log("\nChanges Summary:");
console.log(beginnerResult.changes_summary);

// Test Case 2: Intermediate project (P1-P2 complete)
console.log("\n" + "=".repeat(60));
console.log("TEST 2: Intermediate Project (Environment + Core Loop)");
console.log("=".repeat(60));

const intermediateSignals: ArtifactSignals = {
  has_tests: true,
  has_linter: true,
  has_typescript: true,
  has_prettier: true,
  has_git: true,
  last_commit_time: new Date(),
  commit_count: 15,
  has_deploy_config: false,
  deploy_platform: null,
  file_count: 25,
  folder_depth: 3,
  readme_length: 350,
  has_documentation: false,
  tech_stack: ["react", "typescript", "nodejs"],
};

const intermediateResult = matchArtifactToRoadmap(
  intermediateSignals,
  testRoadmap,
);

console.log("\nInput:", intermediateSignals);
console.log("\nResult:");
console.log("  Recommended Phase:", intermediateResult.recommended_phase);
console.log(
  "  Completed Substeps:",
  intermediateResult.completed_substeps.length,
);
console.log("  Progress:", intermediateResult.progress_percentage + "%");
console.log("\nChanges Summary:");
console.log(intermediateResult.changes_summary);

// Test Case 3: Advanced project (ready to launch)
console.log("\n" + "=".repeat(60));
console.log("TEST 3: Advanced Project (Ready to Launch)");
console.log("=".repeat(60));

const advancedSignals: ArtifactSignals = {
  has_tests: true,
  has_linter: true,
  has_typescript: true,
  has_prettier: true,
  has_git: true,
  last_commit_time: new Date(),
  commit_count: 87,
  has_deploy_config: true,
  deploy_platform: "vercel",
  file_count: 65,
  folder_depth: 5,
  readme_length: 1500,
  has_documentation: true,
  tech_stack: ["react", "typescript", "nodejs", "postgresql", "tailwind"],
};

const advancedResult = matchArtifactToRoadmap(advancedSignals, testRoadmap);

console.log("\nInput:", advancedSignals);
console.log("\nResult:");
console.log("  Recommended Phase:", advancedResult.recommended_phase);
console.log("  Completed Substeps:", advancedResult.completed_substeps.length);
console.log("  Progress:", advancedResult.progress_percentage + "%");
console.log("\nChanges Summary:");
console.log(advancedResult.changes_summary);

// Test Case 4: Merge completion results
console.log("\n" + "=".repeat(60));
console.log("TEST 4: Merge Completion Results");
console.log("=".repeat(60));

const existing = [
  {
    phase_number: 1,
    substep_number: 1,
    status: "complete" as const,
    evidence: "Previously completed",
    confidence: 100,
    timestamp: "2025-01-01T00:00:00Z",
  },
];

const newCompletions = [
  {
    phase_number: 1,
    substep_number: 1,
    status: "complete" as const,
    evidence: "Re-detected with higher confidence",
    confidence: 100,
    timestamp: new Date().toISOString(),
  },
  {
    phase_number: 2,
    substep_number: 1,
    status: "complete" as const,
    evidence: "Newly detected",
    confidence: 85,
    timestamp: new Date().toISOString(),
  },
];

const merged = mergeCompletionResults(existing, newCompletions);

console.log("\nExisting completions:", existing.length);
console.log("New completions:", newCompletions.length);
console.log("Merged result:", merged.length);
console.log("\nMerged completions:");
merged.forEach((c) => {
  console.log(
    `  P${c.phase_number}.${c.substep_number}: ${c.evidence} (confidence: ${c.confidence}%)`,
  );
});

console.log("\n" + "=".repeat(60));
console.log("✅ All tests complete!");
console.log("=".repeat(60) + "\n");
