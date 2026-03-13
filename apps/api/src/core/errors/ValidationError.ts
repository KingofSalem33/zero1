import { BaseError } from "./BaseError";

/**
 * Validation errors for invalid input
 */
export class ValidationError extends BaseError {
  constructor(message: string, details?: unknown) {
    super(message, "validation_error", 400, details);
  }
}

/**
 * Invalid reference format errors
 */
export class InvalidReferenceError extends ValidationError {
  constructor(reference: string) {
    super(
      `Invalid verse reference format: "${reference}". Expected format: "Book Chapter:Verse" (e.g., "John 3:16")`,
      { reference },
    );
    this.code = "invalid_reference";
  }
}
