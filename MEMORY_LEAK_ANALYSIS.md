# Memory Leak Analysis Report

**Date:** 2025-01-19
**Analyzed By:** Claude Code
**Codebase:** Zero-to-One Builder API

## Executive Summary

Analyzed the codebase for potential memory leaks and unbounded growth issues. Found **4 critical issues** and **3 moderate concerns** that could lead to memory exhaustion in production.

### Severity Levels

- 🔴 **CRITICAL**: Will definitely cause memory leaks in production
- 🟡 **MODERATE**: May cause issues under high load
- 🟢 **LOW**: Acceptable for current implementation

---

## Critical Issues (🔴)

### 1. Unbounded In-Memory Project Storage

**Location:** `apps/api/src/engine/orchestrator.ts:26`

**Issue:**

```typescript
const projects: Map<string, Project> = new Map();
```

This global Map stores ALL projects in memory with no eviction policy. It grows indefinitely as users create projects.

**Impact:**

- Each project object contains full phase/substep trees
- With 1,000 users creating 10 projects each = 10,000 projects in RAM
- Estimated ~100KB per project = 1GB+ memory usage
- **Server will crash when memory is exhausted**

**Recommendation:**

```typescript
// Option 1: Use Supabase for persistence (already implemented)
// Remove in-memory Map entirely and use SupabaseProjectRepository

// Option 2: Add LRU cache with max size
import LRUCache from "lru-cache";

const projectCache = new LRUCache<string, Project>({
  max: 1000, // Maximum 1000 projects in cache
  ttl: 1000 * 60 * 60, // 1 hour TTL
  updateAgeOnGet: true,
  dispose: async (project) => {
    // Persist to database before eviction
    await saveToDatabase(project);
  },
});
```

**Priority:** HIGH - Implement immediately before production

---

### 2. Unbounded Memory Store Growth

**Location:** `apps/api/src/memory.ts:21`

**Issue:**

```typescript
let memoryStore: MemoryStore = {}; // Global object, never cleared

export async function addFact(userId: string, fact: string): Promise<void> {
  userMemory.facts.push(fact.trim()); // No limit on facts array
}
```

**Impact:**

- `memoryStore` object grows unbounded as users are added
- Each user's `facts` array has no size limit
- `thread` array limited to 40 messages (✅ good), but still grows per user
- With 10,000 users × 100 facts each = 1M+ facts in memory

**Recommendation:**

```typescript
// Add limits and cleanup
const MAX_FACTS_PER_USER = 100;
const MAX_USERS_IN_MEMORY = 1000;
const USER_INACTIVITY_TIMEOUT = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function addFact(userId: string, fact: string): Promise<void> {
  const userMemory = getUserMemory(userId);

  // Limit facts per user
  if (userMemory.facts.length >= MAX_FACTS_PER_USER) {
    userMemory.facts.shift(); // Remove oldest
  }

  userMemory.facts.push(fact.trim());
  userMemory.lastAccessTime = Date.now(); // Track activity

  // Periodic cleanup of inactive users
  await cleanupInactiveUsers();
}

async function cleanupInactiveUsers(): Promise<void> {
  const now = Date.now();
  const userIds = Object.keys(memoryStore);

  if (userIds.length > MAX_USERS_IN_MEMORY) {
    // Remove least recently used users
    const sortedUsers = userIds
      .map((id) => ({ id, lastAccess: memoryStore[id].lastAccessTime || 0 }))
      .sort((a, b) => a.lastAccess - b.lastAccess);

    const toRemove = sortedUsers.slice(0, userIds.length - MAX_USERS_IN_MEMORY);
    for (const user of toRemove) {
      delete memoryStore[user.id];
    }
  }
}
```

**Priority:** HIGH - Implement before production

---

### 3. Database Health Check Cache Never Expires Stale Data

**Location:** `apps/api/src/db.ts:302`

**Issue:**

```typescript
let lastHealthCheck: ConnectionHealth | null = null;

// Returns cached result for 30 seconds, but never clears old data
if (
  !forceRefresh &&
  lastHealthCheck &&
  Date.now() - new Date(lastHealthCheck.timestamp).getTime() < 30000
) {
  return lastHealthCheck; // Can return stale data forever if not called frequently
}
```

**Impact:**

- If health check fails, the error is cached for 30 seconds
- However, if health checks stop being called, stale error data persists indefinitely
- Not a memory leak per se, but can cause incorrect health status

**Recommendation:**

```typescript
let lastHealthCheck: ConnectionHealth | null = null;
let healthCheckTimeout: NodeJS.Timeout | null = null;

export async function checkConnectionHealth(
  forceRefresh = false,
): Promise<ConnectionHealth> {
  const isCacheValid =
    !forceRefresh &&
    lastHealthCheck &&
    Date.now() - new Date(lastHealthCheck.timestamp).getTime() < 30000;

  if (isCacheValid) {
    return lastHealthCheck!;
  }

  // ... perform health check ...

  // Auto-expire cache after 30 seconds
  if (healthCheckTimeout) {
    clearTimeout(healthCheckTimeout);
  }
  healthCheckTimeout = setTimeout(() => {
    lastHealthCheck = null;
    healthCheckTimeout = null;
  }, 30000);

  return lastHealthCheck;
}
```

**Priority:** MEDIUM

---

### 4. SSE Heartbeat Interval Not Cleared on All Error Paths

**Location:** `apps/api/src/ai/runModelStream.ts:260,402,430,574,583`

**Issue:**

```typescript
const heartbeatInterval = setInterval(sendHeartbeat, 15000);

// Cleared in 4 places but could miss edge cases:
// 1. Normal completion: ✅ clearInterval(heartbeatInterval)
// 2. No tool calls: ✅ clearInterval(heartbeatInterval)
// 3. All malformed tools: ✅ clearInterval(heartbeatInterval)
// 4. Max iterations: ✅ clearInterval(heartbeatInterval)
// 5. Catch block: ✅ clearInterval(heartbeatInterval)

// BUT: What if client disconnects mid-stream?
// OR: What if res.write() throws an exception?
```

**Impact:**

- Each orphaned interval holds a reference to the response object
- With 100 concurrent streams × 15-second heartbeats = potential leak
- Timers prevent garbage collection of response objects

**Recommendation:**

```typescript
export async function runModelStream(
  res: Response,
  messages: any[],
  tools: { toolSpecs: any[]; toolMap: ToolMap } = {
    toolSpecs: [],
    toolMap: {},
  },
): Promise<string> {
  let heartbeatInterval: NodeJS.Timeout | null = null;

  try {
    // Set up heartbeat interval
    heartbeatInterval = setInterval(sendHeartbeat, 15000);

    // Handle client disconnect
    res.on("close", () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      logger.info("Client disconnected, cleaned up heartbeat");
    });

    // ... rest of streaming logic ...
  } catch (error) {
    // ... error handling ...
  } finally {
    // ✅ ALWAYS clear interval in finally block
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }
}
```

**Priority:** HIGH - Streaming endpoints are high-risk for leaks

---

## Moderate Issues (🟡)

### 5. Debounced Save Timer Can Accumulate

**Location:** `apps/api/src/memory.ts:26,90`

**Issue:**

```typescript
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

async function saveMemoryStoreDebounced(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout); // ✅ Good: clears previous timer
  }

  saveTimeout = setTimeout(async () => {
    if (hasPendingChanges) {
      await saveMemoryStore();
    }
    saveTimeout = null; // ✅ Good: nulls out reference
  }, SAVE_DEBOUNCE_MS);
}
```

**Status:** ✅ Well-implemented - timer is properly cleared and nulled

**Minor Risk:** If server is shut down abruptly, pending changes may be lost

**Recommendation:**

```typescript
// Add graceful shutdown handler
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, flushing memory store...");
  await flushMemoryStore();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, flushing memory store...");
  await flushMemoryStore();
  process.exit(0);
});
```

---

### 6. Database Retry Promises May Accumulate

**Location:** `apps/api/src/db.ts:190-289`

**Issue:**

```typescript
await new Promise<void>((resolve) => setTimeout(resolve, delay));
```

**Status:** ✅ Properly implemented - promises resolve, no accumulation

**Minor Risk:** Under extreme load, many concurrent retry operations could consume memory

**Recommendation:**

```typescript
// Add max concurrent operations limit
import pLimit from "p-limit";

const dbOperationLimit = pLimit(50); // Max 50 concurrent DB operations

export async function withRetry<T>(
  operation: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  options: RetryOptions = {},
): Promise<T> {
  return dbOperationLimit(async () => {
    // ... existing retry logic ...
  });
}
```

---

### 7. Thread Context Messages Limited

**Location:** `apps/api/src/services/threadService.ts:35,116`

**Issue:**

```typescript
const MAX_HISTORY_MESSAGES = 10;  // ✅ Good: hardcoded limit

async getRecentMessages(threadId: string, limit: number = MAX_HISTORY_MESSAGES) {
  // Queries database with LIMIT, doesn't hold all messages in memory
}
```

**Status:** ✅ Well-implemented - uses database-side LIMIT, trims context with `contextTrimmer`

---

## Low Risk / Acceptable (🟢)

### 8. InMemoryProjectRepository (Test Only)

**Location:** `apps/api/src/infrastructure/persistence/in-memory/InMemoryProjectRepository.ts:10`

**Issue:**

```typescript
private projects: Map<string, Project> = new Map();
```

**Status:** ✅ Acceptable - only used in tests, has `clear()` method

**Note:** Test helper properly clears between tests. Not used in production.

---

## Recommended Action Plan

### Immediate (Before Production)

1. **Remove `orchestrator.ts` in-memory Map** ⚠️ CRITICAL
   - Use SupabaseProjectRepository instead
   - Or implement LRU cache with persistence

2. **Add limits to `memory.ts`** ⚠️ CRITICAL
   - Max facts per user: 100
   - Max users in memory: 1,000
   - Cleanup inactive users: 7-day timeout

3. **Fix SSE heartbeat cleanup** ⚠️ HIGH
   - Add `res.on('close')` handler
   - Use `finally` block for cleanup
   - Prevents timer leaks on disconnects

### Short-term (Next Sprint)

4. **Add graceful shutdown handlers**
   - Flush memory store on SIGTERM/SIGINT
   - Close database connections
   - Clear all timers

5. **Implement monitoring**
   - Track memory usage with `process.memoryUsage()`
   - Alert on unbounded growth
   - Log cache sizes periodically

### Long-term (Next Quarter)

6. **Replace file-based memory store**
   - Use Redis for distributed caching
   - Add proper TTLs and eviction
   - Enable horizontal scaling

7. **Add rate limiting**
   - Limit projects per user
   - Limit facts per user per hour
   - Prevent DoS-style memory exhaustion

---

## Testing Recommendations

### Load Testing

```bash
# Test for memory leaks under load
npm install -g clinic
clinic doctor -- node dist/index.js

# Run load test
ab -n 10000 -c 100 http://localhost:3000/api/projects
```

### Memory Profiling

```bash
# Generate heap snapshot
node --inspect dist/index.js

# In Chrome DevTools:
# 1. Go to chrome://inspect
# 2. Take heap snapshot before/after load
# 3. Compare for retained objects
```

### Automated Monitoring

```typescript
// Add to index.ts
setInterval(() => {
  const usage = process.memoryUsage();
  console.log("Memory usage:", {
    rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    external: `${(usage.external / 1024 / 1024).toFixed(2)} MB`,
  });

  // Alert if heap exceeds threshold
  if (usage.heapUsed > 512 * 1024 * 1024) {
    // 512MB
    console.error("⚠️ High memory usage detected!");
  }
}, 60000); // Every minute
```

---

## Conclusion

The codebase has **4 critical memory leak risks** that must be addressed before production:

1. Unbounded project storage in orchestrator
2. Unbounded memory store growth
3. SSE heartbeat timer leaks on disconnects
4. Stale health check cache

The refactored architecture (DDD with repository pattern) is well-designed and positions the codebase for easy fixes. The InMemoryProjectRepository should only be used for testing, and the SupabaseProjectRepository should be used in production.

**Estimated effort:** 2-3 days to fix all critical issues
**Risk level:** HIGH if deployed without fixes, LOW after implementation
