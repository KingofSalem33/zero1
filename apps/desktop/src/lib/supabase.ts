import { createSupabaseBrowserClient } from "@zero1/shared-client";
import { DESKTOP_ENV } from "./env";
import { createDesktopAuthStorage } from "./desktopAuthStorage";

const supabaseUrl = DESKTOP_ENV.SUPABASE_URL;
const supabaseAnonKey = DESKTOP_ENV.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Desktop Supabase] Missing credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

const desktopAuthStorage = createDesktopAuthStorage();

export const supabase = createSupabaseBrowserClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    storage: desktopAuthStorage.storage,
  },
);

export const DESKTOP_AUTH_STORAGE_MODE = desktopAuthStorage.mode;
export const getDesktopSecurePersistenceStatus =
  desktopAuthStorage.isSecurePersistence;
