/**
 * Base application error class
 *
 * All custom errors should extend this class for consistent error handling
 */

export abstract class AppError extends Error {
  public readonly isOperational: boolean;
  public readonly timestamp: Date;

  constructor(
    message: string,
    public readonly code: string,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.isOperational = isOperational;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp.toISOString(),
    };
  }
}
