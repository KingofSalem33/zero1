/**
 * Base error class for all application errors
 * Provides consistent error structure and metadata
 */
export abstract class BaseError extends Error {
  public code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON response format
   */
  toJSON() {
    const result: {
      error: {
        message: string;
        type: string;
        code: string;
        details?: unknown;
      };
    } = {
      error: {
        message: this.message,
        type: this.name,
        code: this.code,
      },
    };

    if (this.details) {
      result.error.details = this.details;
    }

    return result;
  }
}
