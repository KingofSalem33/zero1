/**
 * Cache abstraction interface
 * Supports in-memory, Redis, Memcached, etc.
 */
export interface ICache {
  /**
   * Get value from cache
   * @returns null if key doesn't exist
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set value in cache
   * @param ttl Time to live in seconds (optional)
   */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * Delete key from cache
   */
  delete(key: string): Promise<void>;

  /**
   * Check if key exists in cache
   */
  has(key: string): Promise<boolean>;

  /**
   * Clear all cached values
   */
  flush(): Promise<void>;

  /**
   * Get multiple values at once
   */
  mget<T>(keys: string[]): Promise<(T | null)[]>;

  /**
   * Set multiple values at once
   */
  mset(
    entries: Array<{ key: string; value: unknown; ttl?: number }>,
  ): Promise<void>;
}
