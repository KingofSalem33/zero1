/**
 * Logger interface
 *
 * Abstracts logging implementation so we can swap Pino for Winston, etc.
 */

export interface ILogger {
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
  fatal(message: string, error?: Error, context?: Record<string, any>): void;

  child(bindings: Record<string, any>): ILogger;
}
