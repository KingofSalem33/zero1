import { BaseError } from "./BaseError";

/**
 * Database-related errors (connection, query, transaction failures)
 */
export class DatabaseError extends BaseError {
  constructor(message: string, details?: unknown) {
    super(message, "database_error", 500, details);
  }
}

/**
 * Database connection errors
 */
export class ConnectionError extends DatabaseError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.code = "connection_error";
  }
}

/**
 * Query execution errors
 */
export class QueryError extends DatabaseError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.code = "query_error";
  }
}

/**
 * Transaction errors
 */
export class TransactionError extends DatabaseError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.code = "transaction_error";
  }
}
