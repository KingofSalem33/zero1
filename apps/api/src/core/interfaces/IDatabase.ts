/**
 * Database abstraction interface
 * Provides vendor-agnostic database operations
 */
export interface IDatabase {
  /**
   * Connect to database
   */
  connect(): Promise<void>;

  /**
   * Disconnect from database
   */
  disconnect(): Promise<void>;

  /**
   * Check database health
   */
  isHealthy(): Promise<boolean>;

  /**
   * Execute query and return multiple rows
   */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute query and return single row
   * @returns null if no results
   */
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;

  /**
   * Execute statement without returning results
   */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /**
   * Execute operations in a transaction
   */
  transaction<T>(callback: (tx: ITransaction) => Promise<T>): Promise<T>;
}

/**
 * Transaction interface for atomic operations
 */
export interface ITransaction {
  /**
   * Execute query within transaction
   */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute query and return single row
   */
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;

  /**
   * Execute statement within transaction
   */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /**
   * Commit transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback transaction
   */
  rollback(): Promise<void>;
}
