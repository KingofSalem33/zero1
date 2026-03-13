/**
 * Logger abstraction interface
 * Allows swapping logging implementations (Pino, Winston, Console, etc.)
 */
export interface ILogger {
  /**
   * Log informational message
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * Log error message
   */
  error(
    message: string,
    error?: Error | unknown,
    context?: Record<string, unknown>,
  ): void;

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, unknown>): ILogger;
}
