import { injectable } from "tsyringe";
import { IConfig } from "./IConfig";

/**
 * Environment-based configuration implementation
 *
 * Reads configuration from process.env and validates on startup
 */
@injectable()
export class EnvConfig implements IConfig {
  readonly port: number;
  readonly nodeEnv: string;

  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly supabaseServiceKey: string;

  readonly openAiApiKey: string;
  readonly openAiModel: string;

  readonly serperApiKey: string | undefined;
  readonly tavilyApiKey: string | undefined;

  readonly enableRateLimiting: boolean;
  readonly enableAuth: boolean;

  readonly uploadsDir: string;
  readonly maxFileSize: number;

  constructor() {
    this.port = parseInt(process.env.PORT || "3001", 10);
    this.nodeEnv = process.env.NODE_ENV || "development";

    this.supabaseUrl = process.env.SUPABASE_URL || "";
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    this.openAiApiKey = process.env.OPENAI_API_KEY || "";
    this.openAiModel = process.env.OPENAI_MODEL || "gpt-4o";

    this.serperApiKey = process.env.SERPER_API_KEY;
    this.tavilyApiKey = process.env.TAVILY_API_KEY;

    this.enableRateLimiting = process.env.ENABLE_RATE_LIMITING !== "false";
    this.enableAuth = process.env.ENABLE_AUTH === "true";

    this.uploadsDir = process.env.UPLOADS_DIR || "./data/uploads";
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "52428800", 10); // 50MB default

    this.validate();
  }

  validate(): void {
    const required = [
      { name: "SUPABASE_URL", value: this.supabaseUrl },
      { name: "SUPABASE_ANON_KEY", value: this.supabaseAnonKey },
      { name: "OPENAI_API_KEY", value: this.openAiApiKey },
    ];

    const missing = required.filter((r) => !r.value);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.map((m) => m.name).join(", ")}`,
      );
    }

    if (this.port < 1 || this.port > 65535) {
      throw new Error(`Invalid PORT: ${this.port}`);
    }
  }
}
