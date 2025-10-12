import fs from "fs/promises";
import path from "path";

export interface ThreadMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface UserMemory {
  facts: string[];
  thread: ThreadMessage[];
}

export interface MemoryStore {
  [userId: string]: UserMemory;
}

const MEMORY_FILE = path.join(process.cwd(), "data", "memory.json");

// In-memory cache
let memoryStore: MemoryStore = {};
let isLoaded = false;
let loadPromise: Promise<void> | null = null; // ✅ Fix race condition

// ✅ Fix #6: Debounced saves to reduce disk I/O
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 5000; // Save after 5 seconds of inactivity
let hasPendingChanges = false;

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
    };
  }
  return memoryStore[userId];
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
    userMemory.facts.push(fact.trim());
    await saveMemoryStoreDebounced(); // ✅ Use debounced save
    console.log(`Added fact for user ${userId}: ${fact}`);
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
