import { ILogger } from "../ILogger";

/**
 * Mock logger for testing
 *
 * Captures all log calls for assertion in tests
 */
export class MockLogger implements ILogger {
  public debugCalls: Array<{ message: string; context?: Record<string, any> }> =
    [];
  public infoCalls: Array<{ message: string; context?: Record<string, any> }> =
    [];
  public warnCalls: Array<{ message: string; context?: Record<string, any> }> =
    [];
  public errorCalls: Array<{
    message: string;
    error?: Error;
    context?: Record<string, any>;
  }> = [];
  public fatalCalls: Array<{
    message: string;
    error?: Error;
    context?: Record<string, any>;
  }> = [];

  debug(message: string, context?: Record<string, any>): void {
    this.debugCalls.push({ message, context });
  }

  info(message: string, context?: Record<string, any>): void {
    this.infoCalls.push({ message, context });
  }

  warn(message: string, context?: Record<string, any>): void {
    this.warnCalls.push({ message, context });
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.errorCalls.push({ message, error, context });
  }

  fatal(message: string, error?: Error, context?: Record<string, any>): void {
    this.fatalCalls.push({ message, error, context });
  }

  child(_bindings: Record<string, any>): ILogger {
    return new MockLogger();
  }

  clear(): void {
    this.debugCalls = [];
    this.infoCalls = [];
    this.warnCalls = [];
    this.errorCalls = [];
    this.fatalCalls = [];
  }
}
