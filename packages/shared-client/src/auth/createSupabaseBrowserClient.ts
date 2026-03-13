import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildSupabaseAuthOptions,
  type SupabaseBrowserClientOptions,
} from "./buildSupabaseAuthOptions";

export function createSupabaseBrowserClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  options: SupabaseBrowserClientOptions = {},
): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: buildSupabaseAuthOptions(options),
  });
}
