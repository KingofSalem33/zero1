import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const envPaths = [
  path.resolve(__dirname, "..", ".env"),
  path.resolve(__dirname, "..", "..", ".env"),
  path.resolve(__dirname, "..", "..", "..", ".env"),
];
for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Missing Supabase admin credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function parseFileArg(): string | null {
  const flag = process.argv.find((arg) => arg.startsWith("--file="));
  if (!flag) return null;
  return flag.slice("--file=".length).trim() || null;
}

async function resolveMigrationPath(): Promise<string> {
  const migrationsDir = path.resolve(__dirname, "..", "migrations");
  const requested = parseFileArg();

  if (requested) {
    if (requested.endsWith(".sql")) {
      return path.join(migrationsDir, requested);
    }
    return path.join(migrationsDir, `${requested}.sql`);
  }

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error("No migration SQL files found.");
  }

  return path.join(migrationsDir, files[files.length - 1]);
}

async function executeSql(sql: string): Promise<void> {
  const attempts: Array<{
    label: string;
    run: () => Promise<{ error: { message: string } | null }>;
  }> = [
    {
      label: "execute_sql(query)",
      run: async () =>
        await supabase.rpc("execute_sql", {
          query: sql,
        }),
    },
    {
      label: "execute_sql(sql)",
      run: async () =>
        await supabase.rpc("execute_sql", {
          sql: sql,
        }),
    },
    {
      label: "exec_sql(query)",
      run: async () =>
        await supabase.rpc("exec_sql", {
          query: sql,
        }),
    },
    {
      label: "exec_sql(sql_query)",
      run: async () =>
        await supabase.rpc("exec_sql", {
          sql_query: sql,
        }),
    },
    {
      label: "exec(sql)",
      run: async () =>
        await supabase.rpc("exec", {
          sql: sql,
        }),
    },
    {
      label: "exec(query)",
      run: async () =>
        await supabase.rpc("exec", {
          query: sql,
        }),
    },
  ];

  let lastError: string | null = null;
  for (const attempt of attempts) {
    const { error } = await attempt.run();
    if (!error) return;
    console.warn(`[Migration] ${attempt.label} failed: ${error.message}`);
    lastError = error.message;
  }

  throw new Error(lastError || "Unknown SQL execution error");
}

async function main() {
  const migrationPath = await resolveMigrationPath();
  const sql = await fs.readFile(migrationPath, "utf-8");
  const fileName = path.basename(migrationPath);

  console.log(`Applying migration: ${fileName}`);
  console.log(`SQL size: ${sql.length} chars`);

  await executeSql(sql);

  console.log(`Migration applied successfully: ${fileName}`);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
