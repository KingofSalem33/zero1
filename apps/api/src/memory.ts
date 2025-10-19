import fs from "fs/promises";
import path from "path";

export interface ThreadMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface UserMemory {
  facts: string[];
  thread: ThreadMessage[];
  lastAccessTime?: number; // Track last access for cleanup
}

export interface MemoryStore {
  [userId: string]: UserMemory;
}

const MEMORY_FILE = path.join(process.cwd(), "data", "memory.json");

// Memory limits to prevent unbounded growth
const MAX_FACTS_PER_USER = 100;
const MAX_USERS_IN_MEMORY = 1000;
const USER_INACTIVITY_TIMEOUT = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// In-memory cache
let memoryStore: MemoryStore = {};
let isLoaded = false;
let loadPromise: Promise<void> | null = null; // ✅ Fix race condition

// ✅ Fix #6: Debounced saves to reduce disk I/O
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 5000; // Save after 5 seconds of inactivity
let hasPendingChanges = false;

// Cleanup interval to prevent memory leaks
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// Ensure data directory exists
async function ensureDataDir(): Promise<void> {
  const dataDir = path.dirname(MEMORY_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Load memory store from disk (race-condition safe)
async function loadMemoryStore(): Promise<void> {
  // ✅ If loading is in progress, wait for it
  if (loadPromise) {
    return loadPromise;
  }

  // ✅ If already loaded, return immediately
  if (isLoaded) {
    return;
  }

  // ✅ Cache the loading promise to prevent concurrent loads
  loadPromise = (async () => {
    try {
      await ensureDataDir();
      const data = await fs.readFile(MEMORY_FILE, "utf-8");
      memoryStore = JSON.parse(data);
      console.log("Memory store loaded from disk");
    } catch {
      // File doesn't exist or is corrupted, start with empty store
      memoryStore = {};
      console.log("Starting with empty memory store");
    }
    isLoaded = true;
  })();

  await loadPromise;
  loadPromise = null; // Clear after completion
}

// Save memory store to disk (immediate)
async function saveMemoryStore(): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(MEMORY_FILE, JSON.stringify(memoryStore, null, 2));
    hasPendingChanges = false;
  } catch (error) {
    console.error("Failed to save memory store:", error);
  }
}

// ✅ Fix #6: Debounced save - reduces disk I/O by batching writes
async function saveMemoryStoreDebounced(): Promise<void> {
  hasPendingChanges = true;

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    if (hasPendingChanges) {
      await saveMemoryStore();
    }
    saveTimeout = null;
  }, SAVE_DEBOUNCE_MS);
}

// Force immediate save of pending changes (for critical operations)
export async function flushMemoryStore(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (hasPendingChanges) {
    await saveMemoryStore();
  }
}

// Get user memory, creating if doesn't exist
function getUserMemory(userId: string): UserMemory {
  if (!memoryStore[userId]) {
    memoryStore[userId] = {
      facts: [],
      thread: [],
      lastAccessTime: Date.now(),
    };
  } else {
    // Update last access time
    memoryStore[userId].lastAccessTime = Date.now();
  }
  return memoryStore[userId];
}

/**
 * Clean up inactive users to prevent unbounded memory growth
 */
async function cleanupInactiveUsers(): Promise<void> {
  const now = Date.now();
  const userIds = Object.keys(memoryStore);

  // If under limit, only remove truly inactive users (7+ days)
  if (userIds.length <= MAX_USERS_IN_MEMORY) {
    for (const userId of userIds) {
      const lastAccess = memoryStore[userId].lastAccessTime || 0;
      if (now - lastAccess > USER_INACTIVITY_TIMEOUT) {
        console.log(`Removing inactive user from memory: ${userId}`);
        delete memoryStore[userId];
        hasPendingChanges = true;
      }
    }
    return;
  }

  // If over limit, remove least recently used users
  console.log(
    `Memory limit exceeded (${userIds.length}/${MAX_USERS_IN_MEMORY}), cleaning up...`,
  );

  const sortedUsers = userIds
    .map((id) => ({
      id,
      lastAccess: memoryStore[id].lastAccessTime || 0,
    }))
    .sort((a, b) => a.lastAccess - b.lastAccess);

  const toRemove = sortedUsers.slice(0, userIds.length - MAX_USERS_IN_MEMORY);

  for (const user of toRemove) {
    console.log(`Evicting user from memory: ${user.id}`);
    delete memoryStore[user.id];
  }

  hasPendingChanges = true;
  await saveMemoryStore(); // Immediate save after cleanup
}

/**
 * Start periodic cleanup of inactive users
 */
export function startMemoryCleanup(): void {
  if (cleanupInterval) {
    return; // Already started
  }

  // Run cleanup every hour
  cleanupInterval = setInterval(
    async () => {
      try {
        await cleanupInactiveUsers();
      } catch (error) {
        console.error("Error during memory cleanup:", error);
      }
    },
    60 * 60 * 1000,
  ); // 1 hour

  console.log("Memory cleanup interval started");
}

/**
 * Stop periodic cleanup (for graceful shutdown)
 */
export function stopMemoryCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log("Memory cleanup interval stopped");
  }
}

// Get user facts
export async function getFacts(userId: string): Promise<string[]> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  return [...userMemory.facts]; // Return a copy
}

// Add a fact for a user
export async function addFact(userId: string, fact: string): Promise<void> {
  await loadMemoryStore();

  const userMemory = getUserMemory(userId);

  // Avoid duplicate facts (case-insensitive)
  const factLower = fact.toLowerCase().trim();
  const isDuplicate = userMemory.facts.some(
    (existingFact) => existingFact.toLowerCase().trim() === factLower,
  );

  if (!isDuplicate && fact.trim()) {
    // Enforce maximum facts per user to prevent unbounded growth
    if (userMemory.facts.length >= MAX_FACTS_PER_USER) {
      userMemory.facts.shift(); // Remove oldest fact
      console.log(
        `Removed oldest fact for user ${userId} (limit: ${MAX_FACTS_PER_USER})`,
      );
    }

    userMemory.facts.push(fact.trim());
    await saveMemoryStoreDebounced(); // ✅ Use debounced save
    console.log(`Added fact for user ${userId}: ${fact}`);
  }

  // Trigger cleanup check if approaching limit
  const userCount = Object.keys(memoryStore).length;
  if (userCount > MAX_USERS_IN_MEMORY * 0.9) {
    // 90% threshold
    console.log(
      `Approaching user limit (${userCount}/${MAX_USERS_IN_MEMORY}), triggering cleanup...`,
    );
    await cleanupInactiveUsers();
  }
}

// Get conversation thread for a user
export async function getThread(userId: string): Promise<ThreadMessage[]> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  return [...userMemory.thread]; // Return a copy
}

// Push message to user's thread, keeping last 20 pairs (40 messages max)
export async function pushToThread(
  userId: string,
  message: ThreadMessage,
): Promise<void> {
  await loadMemoryStore();

  const userMemory = getUserMemory(userId);
  userMemory.thread.push(message);

  // Keep only last 40 messages (20 user-assistant pairs)
  if (userMemory.thread.length > 40) {
    userMemory.thread = userMemory.thread.slice(-40);
  }

  await saveMemoryStoreDebounced(); // ✅ Use debounced save
}

// Clear all facts for a user
export async function clearFacts(userId: string): Promise<void> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  userMemory.facts = [];
  await saveMemoryStore();
  console.log(`Cleared facts for user ${userId}`);
}

// Clear thread for a user
export async function clearThread(userId: string): Promise<void> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  userMemory.thread = [];
  await saveMemoryStore();
  console.log(`Cleared thread for user ${userId}`);
}

// Get all user IDs that have memory
export async function getAllUserIds(): Promise<string[]> {
  await loadMemoryStore();
  return Object.keys(memoryStore);
}
