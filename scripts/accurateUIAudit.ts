import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function auditUI() {
  console.log("🔍 Starting Accurate UI Audit...\n");

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const findings: any = {
    timestamp: new Date().toISOString(),
    features: {},
    issues: [],
    working: [],
  };

  // Navigate
  console.log("📍 Loading app...");
  await page.goto("http://localhost:5174");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000); // Extra wait for hydration

  console.log("✅ App loaded\n");

  // Take initial screenshot
  await page.screenshot({ path: "audit-01-initial.png", fullPage: true });

  // CHECK 1: Sidebar navigation
  console.log("🔍 Checking sidebar navigation...");
  const sidebarButtons = await page
    .locator('aside button, [role="navigation"] button, nav button')
    .all();
  console.log(`   Found ${sidebarButtons.length} navigation buttons`);

  for (const button of sidebarButtons) {
    const text = await button.textContent();
    const isVisible = await button.isVisible();
    if (isVisible && text) {
      findings.working.push(`Navigation button: "${text.trim()}"`);
      console.log(`   ✅ "${text.trim()}"`);
    }
  }

  // CHECK 2: Main input field
  console.log("\n🔍 Checking main input field...");
  const textarea = page.locator("textarea").first();
  const textareaExists = (await textarea.count()) > 0;

  if (textareaExists) {
    const placeholder = await textarea.getAttribute("placeholder");
    const isVisible = await textarea.isVisible();
    console.log(`   ✅ Input found: "${placeholder}"`);
    console.log(`   Visible: ${isVisible}`);
    findings.features.mainInput = { placeholder, visible: isVisible };
    findings.working.push(`Main input with placeholder: "${placeholder}"`);
  } else {
    console.log(`   ❌ No input found`);
    findings.issues.push("No main input field visible");
  }

  // CHECK 3: Enter key functionality
  console.log("\n🔍 Testing Enter key submit...");
  if (textareaExists) {
    await textarea.click();
    await textarea.fill("Test message for Enter key");
    await page.waitForTimeout(500);

    // Take screenshot before Enter
    await page.screenshot({ path: "audit-02-before-enter.png" });

    const messagesBefore = await page
      .locator('[class*="message"], [class*="chat"]')
      .count();
    console.log(`   Messages before: ${messagesBefore}`);

    await textarea.press("Enter");
    await page.waitForTimeout(2000);

    // Take screenshot after Enter
    await page.screenshot({ path: "audit-03-after-enter.png" });

    const messagesAfter = await page
      .locator('[class*="message"], [class*="chat"]')
      .count();
    console.log(`   Messages after: ${messagesAfter}`);

    if (messagesAfter > messagesBefore) {
      console.log(`   ✅ Enter key works! Message submitted.`);
      findings.working.push("Enter key submits message");
    } else {
      // Check if there's a loading indicator
      const loading = await page
        .locator('[class*="loading"], [class*="thinking"], [class*="spinner"]')
        .count();
      if (loading > 0) {
        console.log(`   ✅ Enter key triggered (loading indicator visible)`);
        findings.working.push(
          "Enter key triggers submission (loading state visible)",
        );
      } else {
        console.log(`   ❌ Enter key did not work`);
        findings.issues.push("Enter key does not submit message");
      }
    }
  }

  // CHECK 4: Submit button
  console.log("\n🔍 Checking for submit/send button...");
  const sendButtons = await page
    .locator(
      'button:has-text("Send"), button:has-text("Submit"), button[aria-label*="send" i], button[aria-label*="submit" i]',
    )
    .all();
  console.log(`   Found ${sendButtons.length} send/submit buttons`);

  for (const button of sendButtons) {
    const text = await button.textContent();
    const ariaLabel = await button.getAttribute("aria-label");
    const isVisible = await button.isVisible();
    if (isVisible) {
      console.log(`   ✅ Send button: "${text?.trim() || ariaLabel}"`);
      findings.working.push(
        `Send button visible: "${text?.trim() || ariaLabel}"`,
      );
    }
  }

  // CHECK 5: Welcome/onboarding
  console.log("\n🔍 Checking for welcome/onboarding...");
  const welcomeText = await page
    .locator("text=/welcome|getting started|hello|hi there|introduction/i")
    .count();
  if (welcomeText > 0) {
    console.log(`   ✅ Found ${welcomeText} welcome/onboarding element(s)`);
    findings.working.push("Welcome/onboarding message present");
  } else {
    console.log(`   ⚠️  No explicit welcome message`);
  }

  // CHECK 6: Tooltips or help text
  console.log("\n🔍 Checking for help/guidance...");
  const tooltips = await page
    .locator('[role="tooltip"], [class*="tooltip"], [aria-describedby]')
    .count();
  console.log(`   Found ${tooltips} tooltip elements`);
  if (tooltips > 0) {
    findings.working.push(`${tooltips} tooltip(s) available`);
  }

  // CHECK 7: Loading indicators
  console.log("\n🔍 Checking for loading indicators...");
  const spinners = await page
    .locator('.animate-spin, [class*="loading"], [class*="spinner"]')
    .count();
  console.log(`   Found ${spinners} loading indicator(s)`);
  if (spinners > 0) {
    findings.working.push(`${spinners} loading indicator(s) present`);
  }

  // CHECK 8: Sidebar features
  console.log("\n🔍 Checking sidebar features...");
  const sidebarContent = await page.evaluate(() => {
    const sidebar = document.querySelector('aside, [role="navigation"], nav');
    if (!sidebar) return null;

    return {
      hasNewChatButton:
        sidebar.textContent?.includes("New") ||
        sidebar.textContent?.includes("Chat"),
      hasBibleButton: sidebar.textContent?.includes("Bible"),
      hasOratoryButton: sidebar.textContent?.includes("Oratory"),
      hasHighlightsButton: sidebar.textContent?.includes("Highlights"),
      visible: sidebar.getBoundingClientRect().width > 50,
    };
  });

  if (sidebarContent) {
    console.log("   Sidebar features:");
    if (sidebarContent.hasNewChatButton) {
      console.log("   ✅ New Chat button");
      findings.working.push("New Chat button in sidebar");
    }
    if (sidebarContent.hasBibleButton) {
      console.log("   ✅ Bible button");
      findings.working.push("Bible reader button in sidebar");
    }
    if (sidebarContent.hasOratoryButton) {
      console.log("   ✅ Oratory button");
      findings.working.push("Oratory mode button in sidebar");
    }
    if (sidebarContent.hasHighlightsButton) {
      console.log("   ✅ Highlights button");
      findings.working.push("Highlights library button in sidebar");
    }
    if (sidebarContent.visible) {
      console.log("   ✅ Sidebar is visible");
      findings.working.push("Sidebar is visible and accessible");
    }
  }

  // CHECK 9: Click Bible button if exists
  console.log("\n🔍 Testing Bible Reader...");
  const bibleButton = page
    .locator('button:has-text("Bible"), button[aria-label*="bible" i]')
    .first();
  const bibleExists = (await bibleButton.count()) > 0;

  if (bibleExists) {
    await bibleButton.click();
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "audit-04-bible-reader.png",
      fullPage: true,
    });

    const bibleContent = await page
      .locator("text=/Genesis|Exodus|Matthew|John|Chapter|Verse/i")
      .count();
    if (bibleContent > 0) {
      console.log("   ✅ Bible Reader loaded successfully");
      findings.working.push("Bible Reader feature works");
    }

    // Go back
    const backButton = page
      .locator('button:has-text("Chat"), button:has-text("Back")')
      .first();
    if ((await backButton.count()) > 0) {
      await backButton.click();
      await page.waitForTimeout(1000);
    }
  }

  // Final screenshot
  await page.screenshot({ path: "audit-05-final.png", fullPage: true });

  await browser.close();

  // Generate report
  console.log("\n" + "=".repeat(60));
  console.log("📊 ACCURATE UI AUDIT RESULTS");
  console.log("=".repeat(60));

  console.log(`\n✅ WORKING FEATURES (${findings.working.length}):`);
  findings.working.forEach((item: string, i: number) => {
    console.log(`   ${i + 1}. ${item}`);
  });

  if (findings.issues.length > 0) {
    console.log(`\n❌ ISSUES FOUND (${findings.issues.length}):`);
    findings.issues.forEach((item: string, i: number) => {
      console.log(`   ${i + 1}. ${item}`);
    });
  } else {
    console.log(`\n✅ NO ISSUES FOUND - All tested features working!`);
  }

  writeFileSync("accurate-ui-audit.json", JSON.stringify(findings, null, 2));
  console.log(`\n💾 Report saved to: accurate-ui-audit.json`);
  console.log(`📸 Screenshots: audit-*.png\n`);
}

auditUI().catch(console.error);
