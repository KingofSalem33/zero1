import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());

const readJson = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  return JSON.parse(content);
};

const parseDotEnv = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return {};
  const content = fs.readFileSync(absolutePath, "utf8");
  const rows = content.split(/\r?\n/);
  const values = {};
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    values[key] = value;
  }
  return values;
};

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true";
};

const parseCsv = (value) => {
  if (!value || String(value).trim() === "") return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

const parseUrlHost = (value) => {
  if (!value || String(value).trim() === "") return null;
  try {
    return new URL(String(value).trim()).host.toLowerCase();
  } catch {
    return null;
  }
};

const checks = [];
let failed = 0;

const record = (name, passed, detail) => {
  checks.push({ name, passed, detail });
  if (!passed) failed += 1;
};

try {
  const appJson = readJson("app.json");
  const easJson = readJson("eas.json");
  const env = parseDotEnv(".env");

  const expo = appJson.expo || {};
  const ios = expo.ios || {};
  const build = easJson.build || {};
  const submit = easJson.submit || {};
  const productionBuild = build.production || {};
  const productionEnv = productionBuild.env || {};

  record(
    "Bundle identifier configured",
    typeof ios.bundleIdentifier === "string" && ios.bundleIdentifier.length > 0,
    ios.bundleIdentifier || "missing",
  );

  record(
    "Apple Sign In enabled",
    ios.usesAppleSignIn === true,
    `usesAppleSignIn=${String(ios.usesAppleSignIn)}`,
  );

  record(
    "Production build profile exists",
    Boolean(productionBuild),
    productionBuild ? "ok" : "missing build.production",
  );

  record(
    "Production submit profile exists",
    Boolean(submit.production),
    submit.production ? "ok" : "missing submit.production",
  );

  record(
    "Runtime API URL configured",
    Boolean(env.EXPO_PUBLIC_API_URL),
    env.EXPO_PUBLIC_API_URL || "missing EXPO_PUBLIC_API_URL",
  );

  record(
    "Supabase URL configured",
    Boolean(env.EXPO_PUBLIC_SUPABASE_URL),
    env.EXPO_PUBLIC_SUPABASE_URL || "missing EXPO_PUBLIC_SUPABASE_URL",
  );

  record(
    "Supabase anon key configured",
    Boolean(env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
    env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      ? "configured"
      : "missing EXPO_PUBLIC_SUPABASE_ANON_KEY",
  );

  const pinnedWebAppUrl = productionEnv.EXPO_PUBLIC_WEB_APP_URL;
  const localWebAppUrl = env.EXPO_PUBLIC_WEB_APP_URL;
  const effectiveWebAppUrl = pinnedWebAppUrl || localWebAppUrl;
  const effectiveWebHost = parseUrlHost(effectiveWebAppUrl);
  const allowedHosts = parseCsv(
    productionEnv.EXPO_PUBLIC_WEB_APP_ALLOWED_HOSTS ||
      env.EXPO_PUBLIC_WEB_APP_ALLOWED_HOSTS,
  );
  const allowAnyHost = parseBoolean(
    productionEnv.EXPO_PUBLIC_WEB_SHELL_ALLOW_ANY_HOST ??
      env.EXPO_PUBLIC_WEB_SHELL_ALLOW_ANY_HOST,
    false,
  );
  const webShellEnabled = parseBoolean(
    productionEnv.EXPO_PUBLIC_ENABLE_WEB_SHELL ??
      env.EXPO_PUBLIC_ENABLE_WEB_SHELL,
    true,
  );
  const fallbackToNative = parseBoolean(
    productionEnv.EXPO_PUBLIC_WEB_SHELL_FALLBACK_TO_NATIVE ??
      env.EXPO_PUBLIC_WEB_SHELL_FALLBACK_TO_NATIVE,
    false,
  );

  record(
    "Production env pins web app URL",
    Boolean(pinnedWebAppUrl),
    pinnedWebAppUrl || "missing build.production.env.EXPO_PUBLIC_WEB_APP_URL",
  );

  record(
    "Web app URL resolves to valid host",
    Boolean(effectiveWebHost),
    effectiveWebAppUrl || "missing EXPO_PUBLIC_WEB_APP_URL",
  );

  record(
    "Web shell enabled for production",
    webShellEnabled,
    `EXPO_PUBLIC_ENABLE_WEB_SHELL=${String(
      productionEnv.EXPO_PUBLIC_ENABLE_WEB_SHELL ??
        env.EXPO_PUBLIC_ENABLE_WEB_SHELL,
    )}`,
  );

  record(
    "Web host included in allowed hosts",
    Boolean(effectiveWebHost) && allowedHosts.includes(effectiveWebHost),
    `host=${effectiveWebHost || "n/a"}, allowed=${allowedHosts.join(",") || "n/a"}`,
  );

  record(
    "Allow-any-host disabled in production",
    allowAnyHost === false,
    `EXPO_PUBLIC_WEB_SHELL_ALLOW_ANY_HOST=${String(
      productionEnv.EXPO_PUBLIC_WEB_SHELL_ALLOW_ANY_HOST ??
        env.EXPO_PUBLIC_WEB_SHELL_ALLOW_ANY_HOST,
    )}`,
  );

  record(
    "Fallback-to-native disabled for parity builds",
    fallbackToNative === false,
    `EXPO_PUBLIC_WEB_SHELL_FALLBACK_TO_NATIVE=${String(
      productionEnv.EXPO_PUBLIC_WEB_SHELL_FALLBACK_TO_NATIVE ??
        env.EXPO_PUBLIC_WEB_SHELL_FALLBACK_TO_NATIVE,
    )}`,
  );
} catch (error) {
  console.error("[TestFlight Readiness] Fatal error:", error);
  process.exit(1);
}

console.log("[TestFlight Readiness] Results");
for (const check of checks) {
  const label = check.passed ? "PASS" : "FAIL";
  console.log(`- [${label}] ${check.name}: ${check.detail}`);
}

if (failed > 0) {
  console.error(
    `\n[TestFlight Readiness] ${failed} check(s) failed. Fix above before running production build.`,
  );
  process.exit(1);
}

console.log("\n[TestFlight Readiness] All checks passed.");
console.log("\nNext:");
console.log("1) npm --prefix apps/mobile run eas:build:ios:prod");
console.log("2) npm --prefix apps/mobile run eas:submit:ios:prod");
