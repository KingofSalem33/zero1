import {
  createClient,
  SupabaseClient as SupabaseClientType,
} from "@supabase/supabase-js";
import { injectable, inject } from "tsyringe";
import { IConfig } from "../../../shared/config/IConfig";
import { TYPES } from "../../../di/types";

/**
 * Supabase Client Wrapper
 *
 * Provides configured Supabase client instance
 */
@injectable()
export class SupabaseClient {
  private client: SupabaseClientType;

  constructor(@inject(TYPES.Config) config: IConfig) {
    this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false, // Server-side doesn't need session persistence
      },
      db: {
        schema: "public",
      },
      global: {
        headers: {
          "X-Client-Info": "zero1-api-refactored",
        },
      },
    });
  }

  getClient(): SupabaseClientType {
    return this.client;
  }
}
