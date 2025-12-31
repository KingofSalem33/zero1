import { chromium } from "playwright";
import { writeFileSync } from "fs";

interface HesitationPoint {
  timestamp: number;
  timeFromStart: number;
  type: "visual" | "interaction" | "loading" | "confusion" | "redundant";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  screenshot?: string;
  metrics?: {
    elementsVisible?: number;
    interactiveElements?: number;
    loadingIndicators?: number;
    emptyStates?: number;
  };
}

interface UserJourneyMetrics {
  startTime: number;
  timeToFirstPaint: number;
  timeToInteractive: number;
  timeToFirstInteraction: number;
  totalLoadingStates: number;
  hesitationPoints: HesitationPoint[];
  userActions: Array<{
    timestamp: number;
    action: string;
    target: string;
    success: boolean;
  }>;
}

async function analyzeFirstTimeUser() {
  const baseUrl = "http://localhost:5174";
  const startTime = Date.now();

  console.log("🎭 Starting First-Time User Simulation...\n");

  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const metrics: UserJourneyMetrics = {
    startTime,
    timeToFirstPaint: 0,
    timeToInteractive: 0,
    timeToFirstInteraction: 0,
    totalLoadingStates: 0,
    hesitationPoints: [],
    userActions: [],
  };

  // Track console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      metrics.hesitationPoints.push({
        timestamp: Date.now(),
        timeFromStart: Date.now() - startTime,
        type: "confusion",
        severity: "high",
        description: `Console error: ${msg.text()}`,
      });
    }
  });

  console.log("📍 Step 1: Landing on the page...");
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const firstPaintTime = Date.now() - startTime;
  metrics.timeToFirstPaint = firstPaintTime;
  console.log(`   ⏱️  First paint: ${firstPaintTime}ms`);

  // Wait for hydration
  await page.waitForLoadState("networkidle");
  const interactiveTime = Date.now() - startTime;
  metrics.timeToInteractive = interactiveTime;
  console.log(`   ⏱️  Interactive: ${interactiveTime}ms`);

  // Take initial screenshot
  await page.screenshot({
    path: "user-journey-01-landing.png",
    fullPage: false,
  });

  // HESITATION POINT 1: Check for loading indicators
  const loadingIndicators = await page.locator(".animate-spin").count();
  if (loadingIndicators > 0) {
    metrics.totalLoadingStates++;
    metrics.hesitationPoints.push({
      timestamp: Date.now(),
      timeFromStart: Date.now() - startTime,
      type: "loading",
      severity: "medium",
      description: `Loading spinner visible on landing (${loadingIndicators} found)`,
      screenshot: "user-journey-01-landing.png",
      metrics: { loadingIndicators },
    });
    console.log(`   ⚠️  HESITATION: Loading spinner visible`);
    await page.waitForSelector(".animate-spin", {
      state: "hidden",
      timeout: 10000,
    });
  }

  // HESITATION POINT 2: Visual scan - what can I do?
  console.log("\n📍 Step 2: First impression - what can I do here?");

  const visibleElements = await page.evaluate(() => {
    const buttons = document.querySelectorAll("button:not([disabled])").length;
    const links = document.querySelectorAll("a[href]").length;
    const inputs = document.querySelectorAll("input, textarea").length;
    const headings = document.querySelectorAll("h1, h2, h3").length;
    const emptyStates = document.querySelectorAll('[class*="empty"]').length;

    return { buttons, links, inputs, headings, emptyStates };
  });

  console.log(
    `   👁️  Visible: ${visibleElements.buttons} buttons, ${visibleElements.inputs} inputs, ${visibleElements.headings} headings`,
  );

  // Check if there's any onboarding or welcome message
  const welcomeMessage = await page
    .locator("text=/welcome|getting started|hello|introduce/i")
    .count();
  if (welcomeMessage === 0) {
    metrics.hesitationPoints.push({
      timestamp: Date.now(),
      timeFromStart: Date.now() - startTime,
      type: "confusion",
      severity: "high",
      description: "No welcome message or onboarding guidance visible",
      screenshot: "user-journey-01-landing.png",
      metrics: visibleElements,
    });
    console.log(`   ⚠️  HESITATION: No onboarding or welcome message`);
  }

  // Check for empty state or placeholder content
  if (visibleElements.emptyStates > 0 || visibleElements.inputs > 0) {
    console.log(
      `   ✅ Found ${visibleElements.inputs} input(s) - suggests I can type something`,
    );
  } else {
    metrics.hesitationPoints.push({
      timestamp: Date.now(),
      timeFromStart: Date.now() - startTime,
      type: "confusion",
      severity: "medium",
      description: "No clear call-to-action or input field visible",
      screenshot: "user-journey-01-landing.png",
    });
    console.log(`   ⚠️  HESITATION: No clear starting point`);
  }

  await page.screenshot({
    path: "user-journey-02-first-scan.png",
    fullPage: true,
  });

  // STEP 3: Try to find the main input
  console.log("\n📍 Step 3: Looking for where to type...");

  const mainInput = page.locator('textarea, input[type="text"]').first();
  const inputExists = (await mainInput.count()) > 0;

  if (!inputExists) {
    metrics.hesitationPoints.push({
      timestamp: Date.now(),
      timeFromStart: Date.now() - startTime,
      type: "confusion",
      severity: "critical",
      description: "Cannot find main input field to start interaction",
      screenshot: "user-journey-02-first-scan.png",
    });
    console.log(`   ❌ CRITICAL: No input field found!`);
  } else {
    const inputPlaceholder = await mainInput.getAttribute("placeholder");
    console.log(`   ✅ Found input with placeholder: "${inputPlaceholder}"`);

    if (!inputPlaceholder || inputPlaceholder.length < 10) {
      metrics.hesitationPoints.push({
        timestamp: Date.now(),
        timeFromStart: Date.now() - startTime,
        type: "confusion",
        severity: "medium",
        description: `Input placeholder is unclear or missing: "${inputPlaceholder}"`,
        screenshot: "user-journey-02-first-scan.png",
      });
      console.log(`   ⚠️  HESITATION: Placeholder doesn't explain what to do`);
    }
  }

  // STEP 4: Attempt first interaction
  console.log("\n📍 Step 4: Attempting first interaction...");

  if (inputExists) {
    const firstInteractionStart = Date.now();

    try {
      await mainInput.click();
      await mainInput.fill("Hello, what can you help me with?");

      metrics.timeToFirstInteraction = Date.now() - startTime;
      console.log(
        `   ⏱️  First interaction: ${metrics.timeToFirstInteraction}ms from page load`,
      );

      metrics.userActions.push({
        timestamp: Date.now(),
        action: "type",
        target: "main input",
        success: true,
      });

      await page.screenshot({
        path: "user-journey-03-typed-message.png",
        fullPage: false,
      });

      // Look for submit button
      console.log("\n📍 Step 5: Looking for how to submit...");

      const submitButtons = await page
        .locator(
          'button:has-text("Send"), button:has-text("Submit"), button[type="submit"]',
        )
        .count();

      if (submitButtons === 0) {
        metrics.hesitationPoints.push({
          timestamp: Date.now(),
          timeFromStart: Date.now() - startTime,
          type: "confusion",
          severity: "high",
          description: "No clear submit button visible after typing",
          screenshot: "user-journey-03-typed-message.png",
        });
        console.log(`   ⚠️  HESITATION: How do I send this message?`);

        // Check if Enter key works
        console.log(`   🔍 Trying Enter key...`);
        await mainInput.press("Enter");
        await page.waitForTimeout(1000);

        const responseAppeared =
          (await page.locator("text=/thinking|processing|loading/i").count()) >
          0;
        if (responseAppeared) {
          console.log(`   ✅ Enter key worked!`);
        } else {
          metrics.hesitationPoints.push({
            timestamp: Date.now(),
            timeFromStart: Date.now() - startTime,
            type: "confusion",
            severity: "critical",
            description: "Enter key did not submit message",
            screenshot: "user-journey-04-no-submit.png",
          });
          console.log(`   ❌ CRITICAL: Enter key did not work`);
        }
      } else {
        const submitButton = page
          .locator(
            'button:has-text("Send"), button:has-text("Submit"), button[type="submit"]',
          )
          .first();
        const buttonText = await submitButton.textContent();
        console.log(`   ✅ Found submit button: "${buttonText}"`);

        await submitButton.click();
        metrics.userActions.push({
          timestamp: Date.now(),
          action: "click",
          target: "submit button",
          success: true,
        });

        console.log(`   ⏱️  Clicked submit at: ${Date.now() - startTime}ms`);
      }

      await page.screenshot({
        path: "user-journey-04-submitted.png",
        fullPage: false,
      });

      // STEP 6: Wait for response
      console.log("\n📍 Step 6: Waiting for response...");

      const responseStart = Date.now();
      try {
        await page.waitForSelector("text=/thinking|typing|processing/i", {
          timeout: 5000,
        });
        console.log(`   ✅ Loading indicator appeared`);
        metrics.totalLoadingStates++;
      } catch {
        console.log(`   ⚠️  No loading indicator - unclear if processing`);
        metrics.hesitationPoints.push({
          timestamp: Date.now(),
          timeFromStart: Date.now() - startTime,
          type: "confusion",
          severity: "medium",
          description: "No feedback after submitting message",
          screenshot: "user-journey-04-submitted.png",
        });
      }

      // Wait for actual response
      await page.waitForTimeout(5000);
      await page.screenshot({
        path: "user-journey-05-response.png",
        fullPage: true,
      });

      const responseTime = Date.now() - responseStart;
      console.log(`   ⏱️  Response time: ${responseTime}ms`);
    } catch (error) {
      console.error(`   ❌ ERROR: ${error}`);
      metrics.hesitationPoints.push({
        timestamp: Date.now(),
        timeFromStart: Date.now() - startTime,
        type: "confusion",
        severity: "critical",
        description: `Failed to complete interaction: ${error}`,
      });
    }
  }

  // STEP 7: Explore UI elements
  console.log("\n📍 Step 7: Exploring available features...");

  const navItems = await page
    .locator(
      '[role="navigation"] button, [role="navigation"] a, nav button, nav a',
    )
    .count();
  console.log(`   👁️  Navigation items: ${navItems}`);

  if (navItems === 0) {
    metrics.hesitationPoints.push({
      timestamp: Date.now(),
      timeFromStart: Date.now() - startTime,
      type: "confusion",
      severity: "medium",
      description: "No visible navigation or menu",
    });
    console.log(`   ⚠️  HESITATION: No visible navigation`);
  }

  await page.screenshot({
    path: "user-journey-06-final-state.png",
    fullPage: true,
  });

  // Close browser
  await browser.close();

  // Generate report
  console.log("\n" + "=".repeat(60));
  console.log("📊 FIRST-TIME USER EXPERIENCE REPORT");
  console.log("=".repeat(60));

  console.log(`\n⏱️  TIMING METRICS:`);
  console.log(`   First Paint: ${metrics.timeToFirstPaint}ms`);
  console.log(`   Interactive: ${metrics.timeToInteractive}ms`);
  console.log(`   First Interaction: ${metrics.timeToFirstInteraction}ms`);
  console.log(`   Loading States: ${metrics.totalLoadingStates}`);

  console.log(
    `\n⚠️  HESITATION POINTS (${metrics.hesitationPoints.length} total):`,
  );

  const critical = metrics.hesitationPoints.filter(
    (h) => h.severity === "critical",
  );
  const high = metrics.hesitationPoints.filter((h) => h.severity === "high");
  const medium = metrics.hesitationPoints.filter(
    (h) => h.severity === "medium",
  );
  const low = metrics.hesitationPoints.filter((h) => h.severity === "low");

  console.log(`   🔴 Critical: ${critical.length}`);
  console.log(`   🟠 High: ${high.length}`);
  console.log(`   🟡 Medium: ${medium.length}`);
  console.log(`   🟢 Low: ${low.length}`);

  console.log(`\n📋 DETAILED HESITATION POINTS:`);
  metrics.hesitationPoints.forEach((point, index) => {
    const icon =
      point.severity === "critical"
        ? "🔴"
        : point.severity === "high"
          ? "🟠"
          : point.severity === "medium"
            ? "🟡"
            : "🟢";
    console.log(
      `\n${index + 1}. ${icon} [${point.type.toUpperCase()}] ${point.description}`,
    );
    console.log(`   Time: ${point.timeFromStart}ms from start`);
    if (point.screenshot) {
      console.log(`   Screenshot: ${point.screenshot}`);
    }
  });

  console.log(`\n👤 USER ACTIONS (${metrics.userActions.length} total):`);
  metrics.userActions.forEach((action, index) => {
    const icon = action.success ? "✅" : "❌";
    console.log(
      `   ${index + 1}. ${icon} ${action.action} on "${action.target}" at ${action.timestamp - startTime}ms`,
    );
  });

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    metrics,
    summary: {
      totalHesitations: metrics.hesitationPoints.length,
      criticalIssues: critical.length,
      highIssues: high.length,
      mediumIssues: medium.length,
      lowIssues: low.length,
      userActionsCompleted: metrics.userActions.filter((a) => a.success).length,
      timeToFirstInteractionMs: metrics.timeToFirstInteraction,
    },
    recommendations: generateRecommendations(metrics),
  };

  writeFileSync("first-time-user-report.json", JSON.stringify(report, null, 2));
  console.log(`\n💾 Detailed report saved to: first-time-user-report.json`);
  console.log(`📸 Screenshots saved to: user-journey-*.png\n`);
}

function generateRecommendations(metrics: UserJourneyMetrics): string[] {
  const recommendations: string[] = [];

  const critical = metrics.hesitationPoints.filter(
    (h) => h.severity === "critical",
  );
  const high = metrics.hesitationPoints.filter((h) => h.severity === "high");

  if (critical.length > 0) {
    recommendations.push(
      "🔴 CRITICAL: Address blocking issues that prevent basic interaction",
    );
    critical.forEach((h) => recommendations.push(`   - ${h.description}`));
  }

  if (high.length > 0) {
    recommendations.push("🟠 HIGH PRIORITY: Improve user guidance and clarity");
    high.forEach((h) => recommendations.push(`   - ${h.description}`));
  }

  if (metrics.timeToFirstInteraction > 3000) {
    recommendations.push("⚡ Reduce time-to-first-interaction (currently >3s)");
  }

  if (metrics.totalLoadingStates === 0) {
    recommendations.push("🔄 Add loading indicators for better feedback");
  }

  const noOnboarding = metrics.hesitationPoints.some(
    (h) =>
      h.description.includes("welcome") || h.description.includes("onboarding"),
  );
  if (noOnboarding) {
    recommendations.push("👋 Add welcome message or onboarding flow");
  }

  return recommendations;
}

analyzeFirstTimeUser().catch(console.error);
