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
    Boolean(build.production),
    build.production ? "ok" : "missing build.production",
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
