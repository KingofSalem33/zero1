/**
 * Core error classes for consistent error handling
 */

export { BaseError } from "./BaseError";
export {
  DatabaseError,
  ConnectionError,
  QueryError,
  TransactionError,
} from "./DatabaseError";
export { ValidationError, InvalidReferenceError } from "./ValidationError";
export { NotFoundError, VerseNotFoundError } from "./NotFoundError";
