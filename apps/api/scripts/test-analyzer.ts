import * as dotenv from "dotenv";
dotenv.config();

import { analyzeDirectory } from "../src/services/artifact-analyzer";
import * as path from "path";

async function testAnalyzer() {
  console.log("🔍 Testing Static File Analyzer...\n");

  // Analyze the current project
  const projectPath = path.join(__dirname, "..", "..");
  console.log(`📂 Analyzing: ${projectPath}\n`);

  try {
    const signals = await analyzeDirectory(projectPath);

    console.log("📊 Analysis Results:");
    console.log("=" .repeat(60));

    console.log("\n🧪 Code Quality:");
    console.log(`   Tests:      ${signals.has_tests ? "✅" : "❌"}`);
    console.log(`   Linter:     ${signals.has_linter ? "✅" : "❌"}`);
    console.log(`   TypeScript: ${signals.has_typescript ? "✅" : "❌"}`);
    console.log(`   Prettier:   ${signals.has_prettier ? "✅" : "❌"}`);

    console.log("\n📁 Version Control:");
    console.log(`   Git:         ${signals.has_git ? "✅" : "❌"}`);
    console.log(`   Commits:     ${signals.commit_count}`);
    console.log(
      `   Last Commit: ${signals.last_commit_time?.toLocaleString() || "N/A"}`
    );

    console.log("\n🚀 Deployment:");
    console.log(`   Config:   ${signals.has_deploy_config ? "✅" : "❌"}`);
    console.log(`   Platform: ${signals.deploy_platform || "None detected"}`);

    console.log("\n📐 Project Structure:");
    console.log(`   Files:        ${signals.file_count}`);
    console.log(`   Max Depth:    ${signals.folder_depth}`);
    console.log(`   README Size:  ${signals.readme_length} chars`);
    console.log(`   Docs:         ${signals.has_documentation ? "✅" : "❌"}`);

    console.log("\n🛠️  Tech Stack:");
    if (signals.tech_stack.length > 0) {
      signals.tech_stack.forEach((tech) => {
        console.log(`   • ${tech}`);
      });
    } else {
      console.log("   None detected");
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Analyzer test complete!");
  } catch (err: any) {
    console.error("❌ Test failed:", err.message);
    console.error(err.stack);
  }
}

testAnalyzer();
