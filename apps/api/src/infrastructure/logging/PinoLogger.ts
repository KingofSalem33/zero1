import pino from "pino";
import { injectable } from "tsyringe";
import { ILogger } from "./ILogger";

/**
 * Pino logger implementation
 */
@injectable()
export class PinoLogger implements ILogger {
  private logger: pino.Logger;

  constructor(name = "api") {
    this.logger = pino({
      name,
      level: process.env.LOG_LEVEL || "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                ignore: "pid,hostname",
                translateTime: "SYS:standard",
              },
            }
          : undefined,
    });
  }

  debug(message: string, context?: Record<string, any>): void {
    this.logger.debug(context || {}, message);
  }

  info(message: string, context?: Record<string, any>): void {
    this.logger.info(context || {}, message);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.logger.warn(context || {}, message);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.logger.error(
      {
        ...context,
        err: error,
      },
      message,
    );
  }

  fatal(message: string, error?: Error, context?: Record<string, any>): void {
    this.logger.fatal(
      {
        ...context,
        err: error,
      },
      message,
    );
  }

  child(bindings: Record<string, any>): ILogger {
    const childLogger = new PinoLogger();
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }
}
