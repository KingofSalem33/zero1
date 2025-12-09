import { BaseError } from "./BaseError";

/**
 * Resource not found errors
 */
export class NotFoundError extends BaseError {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`, "not_found_error", 404, {
      resource,
      identifier,
    });
  }
}

/**
 * Verse not found error
 */
export class VerseNotFoundError extends NotFoundError {
  constructor(reference: string) {
    super("Verse", reference);
    this.code = "verse_not_found";
  }
}
