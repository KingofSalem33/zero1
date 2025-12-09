import { InMemoryCache } from "./InMemoryCache";
import { ICache } from "../../core/interfaces";

/**
 * Global cache instance (singleton)
 * In the future, this can be swapped for Redis without changing dependent code
 */
let cacheInstance: ICache | null = null;

/**
 * Get the global cache instance
 */
export function getCache(): ICache {
  if (!cacheInstance) {
    cacheInstance = new InMemoryCache(60000); // Cleanup every minute
    console.log("[Cache] Initialized InMemoryCache");
  }
  return cacheInstance;
}

/**
 * Destroy the cache instance (for graceful shutdown)
 */
export function destroyCache(): void {
  if (cacheInstance && cacheInstance instanceof InMemoryCache) {
    cacheInstance.destroy();
    cacheInstance = null;
    console.log("[Cache] Destroyed cache instance");
  }
}
