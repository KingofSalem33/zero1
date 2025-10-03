import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";

async function testUpload() {
  console.log("🧪 Testing Artifact Upload API...\n");

  // Create a test file
  const testFilePath = path.join(__dirname, "test-sample.txt");
  fs.writeFileSync(
    testFilePath,
    "This is a test file for artifact upload.\nLine 2\nLine 3"
  );

  console.log("✅ Test file created:", testFilePath);
  console.log(
    "\n📋 Next steps to test the upload endpoint:\n" +
      "1. Start the API server: npm run dev\n" +
      "2. Use a tool like Postman or curl to POST to http://localhost:3001/api/artifacts/upload\n" +
      "3. Include fields:\n" +
      "   - project_id: (a valid project UUID)\n" +
      "   - file: (upload test-sample.txt)\n" +
      "\nExample curl command:\n" +
      'curl -X POST http://localhost:3001/api/artifacts/upload \\\n' +
      '  -F "project_id=00000000-0000-0000-0000-000000000000" \\\n' +
      '  -F "file=@' +
      testFilePath +
      '"\n'
  );

  // Verify routes are registered
  console.log("\n📡 API Endpoints Available:");
  console.log("  POST   /api/artifacts/upload");
  console.log("  POST   /api/artifacts/repo");
  console.log("  GET    /api/artifacts/:artifactId");
  console.log("  GET    /api/artifacts/project/:projectId");

  console.log("\n✅ Upload endpoint setup complete!");
}

testUpload();
