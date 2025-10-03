import * as dotenv from "dotenv";
dotenv.config();

import * as path from "path";
import { analyzeDirectory } from "../src/services/artifact-analyzer";
import { analyzeArtifactWithLLM } from "../src/services/llm-artifact-analyzer";

async function testLLMAnalysis() {
  console.log("🧪 Testing LLM-Powered Artifact Analysis...\n");

  // Analyze the current project (apps directory)
  const projectPath = path.join(__dirname, "..", "..");
  console.log(`📂 Analyzing: ${projectPath}\n`);

  try {
    // Step 1: Static analysis
    console.log("🔍 Step 1: Running static analysis...");
    const signals = await analyzeDirectory(projectPath);

    console.log("\n📊 Static Analysis Results:");
    console.log("   Files:", signals.file_count);
    console.log("   Tech Stack:", signals.tech_stack.join(", "));
    console.log("   Has Tests:", signals.has_tests);
    console.log("   Has TypeScript:", signals.has_typescript);
    console.log("   Git Commits:", signals.commit_count);

    // Step 2: LLM analysis
    console.log("\n\n🤖 Step 2: Running LLM analysis...");
    console.log("(This may take 10-30 seconds)\n");

    const llmAnalysis = await analyzeArtifactWithLLM(projectPath, signals, {
      vision_sentence: "I want to build a zero-to-one project builder",
      current_phase: "P2",
      roadmap: {},
    });

    console.log("\n" + "=".repeat(70));
    console.log("✅ LLM ANALYSIS COMPLETE");
    console.log("=".repeat(70));

    console.log("\n📋 Project Vision:");
    console.log(`   ${llmAnalysis.vision}`);

    console.log("\n🛠️  Tech Stack:");
    llmAnalysis.tech_stack.forEach((tech) => {
      console.log(`   • ${tech}`);
    });

    console.log("\n📐 Implementation State:");
    console.log(`   ${llmAnalysis.implementation_state}`);

    console.log("\n⭐ Quality Score:");
    console.log(`   ${llmAnalysis.quality_score}/10`);

    console.log("\n❌ Missing Elements:");
    if (llmAnalysis.missing_elements.length === 0) {
      console.log("   None");
    } else {
      llmAnalysis.missing_elements.forEach((item) => {
        console.log(`   • ${item}`);
      });
    }

    console.log("\n🐛 Bugs/Errors:");
    if (llmAnalysis.bugs_or_errors.length === 0) {
      console.log("   None detected");
    } else {
      llmAnalysis.bugs_or_errors.forEach((bug) => {
        console.log(`   • ${bug}`);
      });
    }

    console.log("\n🎯 Actual Phase:");
    console.log(`   ${llmAnalysis.actual_phase}`);

    console.log("\n🔀 Decision:");
    const decisionEmoji: Record<string, string> = {
      CONTINUE: "✅",
      BACKTRACK: "⏪",
      PIVOT: "🔄",
      RESCUE: "🚨",
    };
    console.log(
      `   ${decisionEmoji[llmAnalysis.decision]} ${llmAnalysis.decision}`
    );

    console.log("\n🔧 Roadmap Adjustments:");
    if (llmAnalysis.roadmap_adjustments.length === 0) {
      console.log("   None needed");
    } else {
      llmAnalysis.roadmap_adjustments.forEach((adj) => {
        console.log(`   • ${adj.action.toUpperCase()} ${adj.phase_id}`);
        console.log(`     ${adj.details}`);
      });
    }

    console.log("\n➡️  Next Steps:");
    llmAnalysis.next_steps.forEach((step, i) => {
      console.log(`   ${i + 1}. ${step}`);
    });

    console.log("\n" + "=".repeat(70));
    console.log("🎉 Test Complete!");
    console.log("=".repeat(70));
  } catch (err: any) {
    console.error("\n❌ Test failed:", err.message);
    console.error(err.stack);
  }
}

testLLMAnalysis();
