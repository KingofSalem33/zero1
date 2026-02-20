/**
 * Supabase Client Configuration
 * Client-side Supabase instance for authentication and database operations
 */

import { createSupabaseBrowserClient } from "@zero1/shared-client";
import { WEB_ENV } from "./env";

const supabaseUrl = WEB_ENV.SUPABASE_URL;
const supabaseAnonKey = WEB_ENV.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] Missing credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env",
  );
}

export const supabase = createSupabaseBrowserClient(
  supabaseUrl,
  supabaseAnonKey,
);
