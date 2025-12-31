import { chromium } from "playwright";
import { writeFileSync } from "fs";

interface RouteMetrics {
  url: string;
  domComplexity: {
    totalElements: number;
    maxDepth: number;
    interactiveElements: number;
    images: number;
  };
  performance: {
    domContentLoaded: number;
    loadComplete: number;
    hydrationTime: number;
  };
  bundleSize: {
    js: number;
    css: number;
    total: number;
  };
}

async function measureRoute(url: string): Promise<RouteMetrics> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect network resources
  const resources: { url: string; size: number; type: string }[] = [];
  page.on("response", async (response) => {
    try {
      const url = response.url();

      // Determine type from URL, content-type, or path patterns
      const contentType = response.headers()["content-type"] || "";
      let type = "other";

      if (
        url.includes(".js") ||
        url.includes("/@vite/") ||
        url.includes("node_modules") ||
        url.includes("/src/") ||
        contentType.includes("javascript") ||
        contentType.includes("ecmascript")
      ) {
        type = "js";
      } else if (
        url.includes(".css") ||
        url.includes("?inline") ||
        contentType.includes("css")
      ) {
        type = "css";
      }

      // Try to get actual body size, fallback to content-length
      let size = 0;
      try {
        const body = await response.body();
        size = body.length;
      } catch {
        const headers = response.headers();
        const contentLength = headers["content-length"];
        size = contentLength ? parseInt(contentLength) : 0;
      }

      if (size > 0) {
        resources.push({ url, size, type });
      }
    } catch (e) {
      // Ignore errors for failed resources
    }
  });

  // Navigate and wait for network idle
  await page.goto(url, { waitUntil: "networkidle" });

  // Measure performance timing
  const performanceTiming = await page.evaluate(() => {
    const perf = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    return {
      domContentLoaded: perf.domContentLoadedEventEnd - perf.fetchStart,
      loadComplete: perf.loadEventEnd - perf.fetchStart,
    };
  });

  // Measure DOM complexity
  const domMetrics = await page.evaluate(() => {
    const totalElements = document.querySelectorAll("*").length;

    // Calculate max depth iteratively
    let maxDepth = 0;
    const stack = [{ element: document.body, depth: 0 }];

    while (stack.length > 0) {
      const item = stack.pop();
      if (!item) break;

      if (item.depth > maxDepth) {
        maxDepth = item.depth;
      }

      const children = Array.from(item.element.children);
      for (let i = 0; i < children.length; i++) {
        stack.push({ element: children[i], depth: item.depth + 1 });
      }
    }

    const interactiveElements = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [onclick]',
    ).length;

    const images = document.querySelectorAll("img, svg").length;

    return { totalElements, maxDepth, interactiveElements, images };
  });

  // Calculate bundle sizes
  const jsBundles = resources.filter((r) => r.type === "js");
  const cssBundles = resources.filter((r) => r.type === "css");

  const jsSize = jsBundles.reduce((sum, r) => sum + r.size, 0);
  const cssSize = cssBundles.reduce((sum, r) => sum + r.size, 0);

  // Estimate hydration time (time from DOMContentLoaded to first interaction)
  const hydrationTime = await page.evaluate(() => {
    // Check if React has hydrated by looking for React-specific attributes
    const hasReactRoot = document.querySelector("[data-reactroot], #root");
    if (!hasReactRoot) return 0;

    // Estimate based on when interactive elements become active
    return performance.now();
  });

  await browser.close();

  return {
    url,
    domComplexity: domMetrics,
    performance: {
      domContentLoaded: performanceTiming.domContentLoaded,
      loadComplete: performanceTiming.loadComplete,
      hydrationTime: hydrationTime - performanceTiming.domContentLoaded,
    },
    bundleSize: {
      js: jsSize,
      css: cssSize,
      total: jsSize + cssSize,
    },
  };
}

async function crawlApp(baseUrl: string): Promise<RouteMetrics[]> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to base URL and find all routes
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  // Extract unique routes from links
  const routes = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href]"));
    const uniqueRoutes = new Set<string>();

    links.forEach((link) => {
      const href = (link as HTMLAnchorElement).getAttribute("href");
      if (href && href.startsWith("/")) {
        uniqueRoutes.add(href);
      }
    });

    return Array.from(uniqueRoutes);
  });

  await browser.close();

  // Always include base route
  const allRoutes = ["/", ...routes].filter((v, i, a) => a.indexOf(v) === i);

  console.log(`Found ${allRoutes.length} routes to analyze...`);

  // Measure each route
  const metrics: RouteMetrics[] = [];
  for (const route of allRoutes) {
    const fullUrl = `${baseUrl}${route}`;
    console.log(`Analyzing: ${fullUrl}`);
    try {
      const routeMetrics = await measureRoute(fullUrl);
      metrics.push(routeMetrics);
    } catch (error) {
      console.error(`Failed to analyze ${fullUrl}:`, error);
    }
  }

  return metrics;
}

async function generateSitemap() {
  const baseUrl = "http://localhost:5174";

  // For SPAs, manually specify common routes to test
  // Since client-side routing doesn't show up in HTML links
  const manualRoutes = [
    "/",
    // Add more routes here as needed
  ];

  console.log("Starting application crawl...\n");
  const metrics: RouteMetrics[] = [];

  for (const route of manualRoutes) {
    const fullUrl = `${baseUrl}${route}`;
    console.log(`Analyzing: ${fullUrl}`);
    try {
      const routeMetrics = await measureRoute(fullUrl);
      metrics.push(routeMetrics);
    } catch (error) {
      console.error(`Failed to analyze ${fullUrl}:`, error);
    }
  }

  console.log("\n=== SITEMAP ANALYSIS ===\n");
  console.log(
    "Route                 | DOM Elements | Max Depth | Interactive | JS (KB) | CSS (KB) | DOMContentLoaded (ms) | Hydration (ms)",
  );
  console.log(
    "---------------------|--------------|-----------|-------------|---------|----------|----------------------|----------------",
  );

  metrics.forEach((m) => {
    const route = m.url.replace(baseUrl, "") || "/";
    const jsKB = (m.bundleSize.js / 1024).toFixed(1);
    const cssKB = (m.bundleSize.css / 1024).toFixed(1);
    const dcl = m.performance.domContentLoaded.toFixed(0);
    const hydration = m.performance.hydrationTime.toFixed(0);

    console.log(
      `${route.padEnd(20)} | ${String(m.domComplexity.totalElements).padEnd(12)} | ${String(m.domComplexity.maxDepth).padEnd(9)} | ${String(m.domComplexity.interactiveElements).padEnd(11)} | ${jsKB.padEnd(7)} | ${cssKB.padEnd(8)} | ${dcl.padEnd(20)} | ${hydration}`,
    );
  });

  // Summary statistics
  console.log("\n=== SUMMARY ===\n");
  const totalElements = metrics.reduce(
    (sum, m) => sum + m.domComplexity.totalElements,
    0,
  );
  const avgElements = (totalElements / metrics.length).toFixed(0);
  const avgJS = (
    metrics.reduce((sum, m) => sum + m.bundleSize.js, 0) /
    metrics.length /
    1024
  ).toFixed(1);
  const avgCSS = (
    metrics.reduce((sum, m) => sum + m.bundleSize.css, 0) /
    metrics.length /
    1024
  ).toFixed(1);
  const avgDCL = (
    metrics.reduce((sum, m) => sum + m.performance.domContentLoaded, 0) /
    metrics.length
  ).toFixed(0);
  const avgHydration = (
    metrics.reduce((sum, m) => sum + m.performance.hydrationTime, 0) /
    metrics.length
  ).toFixed(0);

  console.log(`Total Routes: ${metrics.length}`);
  console.log(`Average DOM Elements: ${avgElements}`);
  console.log(`Average JS Bundle: ${avgJS} KB`);
  console.log(`Average CSS Bundle: ${avgCSS} KB`);
  console.log(`Average DOMContentLoaded: ${avgDCL} ms`);
  console.log(`Average Hydration Time: ${avgHydration} ms`);

  // Write detailed JSON report
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    totalRoutes: metrics.length,
    routes: metrics,
    summary: {
      avgDOMElements: parseFloat(avgElements),
      avgJSBundle: parseFloat(avgJS),
      avgCSSBundle: parseFloat(avgCSS),
      avgDOMContentLoaded: parseFloat(avgDCL),
      avgHydration: parseFloat(avgHydration),
    },
  };

  writeFileSync("sitemap-analysis.json", JSON.stringify(report, null, 2));

  console.log("\nDetailed report saved to: sitemap-analysis.json");
}

generateSitemap().catch(console.error);
