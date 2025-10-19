/**
 * Configuration interface
 *
 * Defines all configuration values needed by the application.
 * Implementations can come from environment variables, files, or config services.
 */

export interface IConfig {
  // Server
  readonly port: number;
  readonly nodeEnv: string;

  // Database
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly supabaseServiceKey: string;

  // AI
  readonly openAiApiKey: string;
  readonly openAiModel: string;

  // External Services
  readonly serperApiKey: string | undefined;
  readonly tavilyApiKey: string | undefined;

  // Features
  readonly enableRateLimiting: boolean;
  readonly enableAuth: boolean;

  // File Storage
  readonly uploadsDir: string;
  readonly maxFileSize: number;

  // Validation
  validate(): void;
}
