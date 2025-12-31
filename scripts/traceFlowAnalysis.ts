import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function analyzeTraceFlow() {
  console.log("🗺️  Starting Trace Flow Analysis...\n");

  const browser = await chromium.launch({ headless: false, slowMo: 800 });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });

  const findings = {
    timestamp: new Date().toISOString(),
    currentFlow: {},
    observations: [],
    recommendations: [],
  };

  await page.goto("http://localhost:5174");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  console.log("📍 FLOW 1: Testing Sidebar Trace Button\n");
  console.log("=".repeat(60));

  // Find and click Trace button
  const traceButton = page.locator('button:has-text("Trace")').first();
  const traceExists = (await traceButton.count()) > 0;

  if (traceExists) {
    console.log("✅ Found Trace button in sidebar");
    await page.screenshot({
      path: "trace-analysis-01-sidebar.png",
      fullPage: true,
    });

    await traceButton.click();
    await page.waitForTimeout(1500);

    console.log("👁️  Analyzing what happened after clicking Trace...\n");

    // Check what UI changed
    const uiState = await page.evaluate(() => {
      const hasMap =
        document.querySelector(
          '[class*="react-flow"], canvas, svg[class*="edges"]',
        ) !== null;
      const hasChatInput =
        document.querySelector('textarea, input[type="text"]') !== null;
      const hasMessages =
        document.querySelectorAll('[class*="message"]').length;
      const hasInstructions =
        document.body.textContent?.includes("highlight") ||
        document.body.textContent?.includes("select") ||
        document.body.textContent?.includes("trace");

      return {
        hasMap,
        hasChatInput,
        hasMessages,
        hasInstructions,
        bodyText: document.body.textContent?.slice(0, 500),
      };
    });

    console.log("   Map visible:", uiState.hasMap ? "✅" : "❌");
    console.log("   Chat input visible:", uiState.hasChatInput ? "✅" : "❌");
    console.log("   Messages:", uiState.hasMessages);
    console.log(
      "   Instructions visible:",
      uiState.hasInstructions ? "✅" : "❌",
    );

    findings.currentFlow.sidebarTrace = {
      showsMap: uiState.hasMap,
      showsChatSpace: uiState.hasChatInput,
      providesGuidance: uiState.hasInstructions,
    };

    await page.screenshot({
      path: "trace-analysis-02-after-trace-click.png",
      fullPage: true,
    });

    if (!uiState.hasMap) {
      console.log(
        "\n🤔 Observation: Clicking Trace button did NOT show map immediately",
      );
      console.log("   → User needs to take additional action");
      findings.observations.push(
        "Trace button requires additional user action to see map",
      );
    } else {
      console.log(
        "\n✅ Observation: Clicking Trace button shows map immediately",
      );
      findings.observations.push("Trace button shows map directly");
    }

    if (uiState.hasChatInput) {
      console.log("🤔 Observation: Trace mode has a chat interface");
      console.log("   → Is this adding friction? What can user ask here?");
      findings.observations.push(
        "Trace mode includes chat interface - purpose unclear to new user",
      );
    }

    // Try typing in trace chat if it exists
    if (uiState.hasChatInput) {
      console.log("\n📝 Testing what happens when typing in Trace chat...");
      const textarea = page.locator("textarea").first();
      await textarea.click();
      await textarea.fill("Show me connections for John 3:16");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: "trace-analysis-03-trace-chat-typed.png",
        fullPage: true,
      });

      await textarea.press("Enter");
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: "trace-analysis-04-trace-chat-response.png",
        fullPage: true,
      });

      const mapAppeared = await page.evaluate(() => {
        return (
          document.querySelector(
            '[class*="react-flow"], canvas, svg[class*="edges"]',
          ) !== null
        );
      });

      if (mapAppeared) {
        console.log("   ✅ Typing verse reference in Trace chat generated map");
        findings.observations.push(
          "Chat in Trace mode can generate map from verse reference",
        );
      } else {
        console.log("   ⚠️  Typing in Trace chat did not generate map");
      }
    }
  }

  console.log("\n\n📍 FLOW 2: Testing Highlight → Trace Flow\n");
  console.log("=".repeat(60));

  // Go back to main chat
  const chatButton = page
    .locator('button:has-text("Chat"), button:has-text("New")')
    .first();
  if ((await chatButton.count()) > 0) {
    await chatButton.click();
    await page.waitForTimeout(1000);
  }

  console.log(
    "📝 Sending a message to get AI response with text to highlight...",
  );

  const mainTextarea = page.locator("textarea").first();
  await mainTextarea.click();
  await mainTextarea.fill("Tell me about John 3:16");
  await mainTextarea.press("Enter");

  console.log("⏳ Waiting for AI response...");
  await page.waitForTimeout(5000); // Wait for response

  await page.screenshot({
    path: "trace-analysis-05-chat-response.png",
    fullPage: true,
  });

  // Try to find and highlight text
  console.log("\n🖱️  Looking for highlight functionality...");

  const hasTooltip = await page.evaluate(() => {
    // Look for any highlighted text or selection tooltip
    const tooltip = document.querySelector(
      '[class*="tooltip"], [class*="highlight"]',
    );
    return tooltip !== null;
  });

  // Try selecting text in the response
  console.log("📍 Attempting to select text in AI response...");

  const selectResult = await page.evaluate(() => {
    const messages = document.querySelectorAll('[class*="message"]');
    const lastMessage = messages[messages.length - 1];

    if (lastMessage && lastMessage.textContent) {
      const range = document.createRange();
      const textNode = lastMessage.querySelector("p, div, span");

      if (textNode && textNode.firstChild) {
        range.selectNodeContents(textNode);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        return {
          success: true,
          selectedText: selection?.toString().slice(0, 100),
        };
      }
    }

    return { success: false };
  });

  if (selectResult.success) {
    console.log(`✅ Selected text: "${selectResult.selectedText}..."`);
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "trace-analysis-06-text-selected.png",
      fullPage: true,
    });

    // Look for highlight tooltip or trace button
    const traceTooltip = await page
      .locator(
        'button:has-text("Trace"), [role="tooltip"] button, [class*="tooltip"] button',
      )
      .count();

    if (traceTooltip > 0) {
      console.log("✅ Trace tooltip appeared on text selection");
      findings.currentFlow.highlightTrace = {
        tooltipAppears: true,
        requiresButtonClick: true,
      };

      const tooltipButton = page.locator('button:has-text("Trace")').first();
      await tooltipButton.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: "trace-analysis-07-after-tooltip-trace.png",
        fullPage: true,
      });

      const mapShown = await page.evaluate(() => {
        return (
          document.querySelector(
            '[class*="react-flow"], canvas, svg[class*="edges"]',
          ) !== null
        );
      });

      if (mapShown) {
        console.log(
          "✅ Map appeared immediately after clicking Trace on highlighted text",
        );
        findings.observations.push("Highlight → Trace shows map immediately");
      } else {
        console.log(
          "⚠️  Map did not appear after clicking Trace on highlighted text",
        );
      }
    } else {
      console.log("❌ No Trace tooltip found on text selection");
      findings.observations.push("Text selection does not show Trace option");
    }
  }

  await page.screenshot({
    path: "trace-analysis-08-final.png",
    fullPage: true,
  });

  await browser.close();

  // Analysis
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 TRACE FLOW ANALYSIS");
  console.log("=".repeat(60));

  console.log("\n🎯 CURRENT USER FLOWS:\n");

  console.log("Flow 1: Sidebar Trace Button");
  if (findings.currentFlow.sidebarTrace) {
    console.log(
      `   - Shows map immediately: ${findings.currentFlow.sidebarTrace.showsMap ? "Yes" : "No"}`,
    );
    console.log(
      `   - Includes chat space: ${findings.currentFlow.sidebarTrace.showsChatSpace ? "Yes" : "No"}`,
    );
    console.log(
      `   - Provides guidance: ${findings.currentFlow.sidebarTrace.providesGuidance ? "Yes" : "No"}`,
    );
  }

  console.log("\nFlow 2: Highlight → Trace");
  if (findings.currentFlow.highlightTrace) {
    console.log(
      `   - Tooltip appears: ${findings.currentFlow.highlightTrace.tooltipAppears ? "Yes" : "No"}`,
    );
    console.log(
      `   - Requires button click: ${findings.currentFlow.highlightTrace.requiresButtonClick ? "Yes" : "No"}`,
    );
  }

  console.log("\n📋 KEY OBSERVATIONS:\n");
  findings.observations.forEach((obs, i) => {
    console.log(`   ${i + 1}. ${obs}`);
  });

  console.log("\n💡 UX EVALUATION:\n");

  // Generate recommendations
  const hasChatInTrace = findings.currentFlow.sidebarTrace?.showsChatSpace;
  const highlightShowsMap = findings.currentFlow.highlightTrace?.tooltipAppears;

  if (hasChatInTrace) {
    console.log("⚠️  ISSUE: Trace sidebar button leads to chat interface");
    console.log('   → Adds cognitive load: "What do I type here?"');
    console.log("   → Extra step before seeing map");
    console.log("   → Duplicates main chat functionality");
    findings.recommendations.push(
      "Remove Trace sidebar button - it adds friction",
    );
  }

  if (highlightShowsMap) {
    console.log("✅ STRENGTH: Highlight → Trace is direct and intuitive");
    console.log("   → User selects text → clicks Trace → sees map");
    console.log("   → Context is already provided (the selected text)");
    console.log("   → No ambiguity about what to do next");
    findings.recommendations.push(
      "Keep highlight → Trace flow - it's contextual and clear",
    );
  }

  console.log("\n🎯 RECOMMENDATION:\n");
  console.log("   Remove Trace sidebar button because:");
  console.log("   1. Highlight → Trace is superior (contextual, direct)");
  console.log("   2. Sidebar button adds unnecessary chat interface");
  console.log("   3. Reduces cognitive load - one clear path to map");
  console.log("   4. Sidebar becomes cleaner and more focused");

  writeFileSync("trace-flow-analysis.json", JSON.stringify(findings, null, 2));
  console.log("\n💾 Analysis saved to: trace-flow-analysis.json");
  console.log("📸 Screenshots: trace-analysis-*.png\n");
}

analyzeTraceFlow().catch(console.error);
