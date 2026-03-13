import fs from "fs/promises";
import path from "path";
import pino from "pino";

const logger = pino({ name: "memory" });

export interface ThreadMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

/**
 * Short-term memory - recent conversation context
 * Window: Last 6 messages (~3 exchanges)
 */
export interface ShortTermMemory {
  recentMessages: ThreadMessage[];
  activeContext: string; // Current study focus/topic
}

/**
 * Session memory - current study session state
 * Persists across messages but resets on new session
 */
export interface SessionMemory {
  goals: string[];
  studyFocus?: string;
  startedAt: number;
  threadSummary?: string; // Condensed summary when thread gets long
}

/**
 * Long-term memory - persistent user profile
 * Facts, preferences, frequently studied topics
 */
export interface LongTermMemory {
  facts: string[];
  frequentTopics: string[];
  lastStudiedVerses: string[];
  preferences?: {
    responseLength?: "short" | "medium" | "long";
    focusAreas?: string[];
  };
}

/**
 * 3-tier user memory structure
 */
export interface UserMemory {
  shortTerm: ShortTermMemory;
  session: SessionMemory;
  longTerm: LongTermMemory;
  lastAccessTime: number;

  // Legacy compatibility - maps to longTerm.facts and full thread
  facts?: string[];
  thread?: ThreadMessage[];
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

// Short-term memory window size
const SHORT_TERM_MESSAGE_LIMIT = 6;

/**
 * Migrate legacy memory structure to 3-tier
 */
function migrateUserMemory(existing: any): UserMemory {
  // Already migrated
  if (existing.shortTerm && existing.session && existing.longTerm) {
    return existing as UserMemory;
  }

  // Migrate from legacy structure
  const legacyFacts = existing.facts || [];
  const legacyThread = existing.thread || [];

  logger.info({ userId: "migration" }, "Migrating legacy memory structure");

  return {
    shortTerm: {
      recentMessages: legacyThread.slice(-SHORT_TERM_MESSAGE_LIMIT),
      activeContext: "",
    },
    session: {
      goals: [],
      startedAt: existing.lastAccessTime || Date.now(),
    },
    longTerm: {
      facts: legacyFacts,
      frequentTopics: [],
      lastStudiedVerses: [],
    },
    lastAccessTime: existing.lastAccessTime || Date.now(),
    // Keep legacy fields for backward compatibility
    facts: legacyFacts,
    thread: legacyThread,
  };
}

/**
 * Create fresh user memory
 */
function createUserMemory(): UserMemory {
  const now = Date.now();
  return {
    shortTerm: {
      recentMessages: [],
      activeContext: "",
    },
    session: {
      goals: [],
      startedAt: now,
    },
    longTerm: {
      facts: [],
      frequentTopics: [],
      lastStudiedVerses: [],
    },
    lastAccessTime: now,
    // Legacy compatibility
    facts: [],
    thread: [],
  };
}

// Get user memory, creating if doesn't exist
function getUserMemory(userId: string): UserMemory {
  if (!memoryStore[userId]) {
    memoryStore[userId] = createUserMemory();
  } else {
    // Migrate if needed
    memoryStore[userId] = migrateUserMemory(memoryStore[userId]);
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

// Get user facts (from long-term memory)
export async function getFacts(userId: string): Promise<string[]> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  return [...userMemory.longTerm.facts]; // Return a copy
}

// Add a fact for a user (to long-term memory)
export async function addFact(userId: string, fact: string): Promise<void> {
  await loadMemoryStore();

  const userMemory = getUserMemory(userId);

  // Avoid duplicate facts (case-insensitive)
  const factLower = fact.toLowerCase().trim();
  const isDuplicate = userMemory.longTerm.facts.some(
    (existingFact) => existingFact.toLowerCase().trim() === factLower,
  );

  if (!isDuplicate && fact.trim()) {
    // Enforce maximum facts per user to prevent unbounded growth
    if (userMemory.longTerm.facts.length >= MAX_FACTS_PER_USER) {
      userMemory.longTerm.facts.shift(); // Remove oldest fact
      logger.info(
        { userId, limit: MAX_FACTS_PER_USER },
        "Removed oldest fact due to limit",
      );
    }

    userMemory.longTerm.facts.push(fact.trim());
    // Sync legacy field
    userMemory.facts = userMemory.longTerm.facts;

    await saveMemoryStoreDebounced();
    logger.info({ userId, fact: fact.substring(0, 50) }, "Added fact");
  }

  // Trigger cleanup check if approaching limit
  const userCount = Object.keys(memoryStore).length;
  if (userCount > MAX_USERS_IN_MEMORY * 0.9) {
    logger.info(
      { userCount, limit: MAX_USERS_IN_MEMORY },
      "Approaching user limit, triggering cleanup",
    );
    await cleanupInactiveUsers();
  }
}

// Get conversation thread for a user (full thread from legacy field)
export async function getThread(userId: string): Promise<ThreadMessage[]> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  return [...(userMemory.thread || [])]; // Return a copy
}

// Get short-term (recent) messages only
export async function getShortTermMessages(
  userId: string,
): Promise<ThreadMessage[]> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  return [...userMemory.shortTerm.recentMessages];
}

// Push message to user's thread, managing both short-term and full thread
export async function pushToThread(
  userId: string,
  message: ThreadMessage,
): Promise<void> {
  await loadMemoryStore();

  const userMemory = getUserMemory(userId);

  // Add timestamp
  const timestampedMessage = {
    ...message,
    timestamp: Date.now(),
  };

  // Push to full thread (legacy compatibility)
  if (!userMemory.thread) {
    userMemory.thread = [];
  }
  userMemory.thread.push(timestampedMessage);

  // Keep only last 40 messages in full thread
  if (userMemory.thread.length > 40) {
    userMemory.thread = userMemory.thread.slice(-40);
  }

  // Push to short-term memory (last 6 messages)
  userMemory.shortTerm.recentMessages.push(timestampedMessage);
  if (userMemory.shortTerm.recentMessages.length > SHORT_TERM_MESSAGE_LIMIT) {
    userMemory.shortTerm.recentMessages =
      userMemory.shortTerm.recentMessages.slice(-SHORT_TERM_MESSAGE_LIMIT);
  }

  // Extract active context from user messages
  if (message.role === "user") {
    // Update active context with recent topic (simplified extraction)
    const versePattern = /\b(?:\d\s)?[A-Z][a-z]+\s+\d+:\d+/;
    const match = message.content.match(versePattern);
    if (match) {
      userMemory.shortTerm.activeContext = match[0];

      // Track in long-term studied verses
      if (!userMemory.longTerm.lastStudiedVerses.includes(match[0])) {
        userMemory.longTerm.lastStudiedVerses.push(match[0]);
        // Keep last 20 studied verses
        if (userMemory.longTerm.lastStudiedVerses.length > 20) {
          userMemory.longTerm.lastStudiedVerses.shift();
        }
      }
    }
  }

  await saveMemoryStoreDebounced();
}

// Clear all facts for a user
export async function clearFacts(userId: string): Promise<void> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  userMemory.longTerm.facts = [];
  userMemory.facts = []; // Sync legacy
  await saveMemoryStore();
  logger.info({ userId }, "Cleared facts");
}

// Clear thread for a user (clears both short-term and full thread)
export async function clearThread(userId: string): Promise<void> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  userMemory.thread = [];
  userMemory.shortTerm.recentMessages = [];
  userMemory.shortTerm.activeContext = "";
  await saveMemoryStore();
  logger.info({ userId }, "Cleared thread");
}

// Get user context for prompt composition
export async function getUserContext(userId: string): Promise<{
  shortTerm: ShortTermMemory;
  session: SessionMemory;
  longTerm: LongTermMemory;
  composedContext: string;
}> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);

  // Compose context string for prompt inclusion
  const contextParts: string[] = [];

  // Long-term facts
  if (userMemory.longTerm.facts.length > 0) {
    contextParts.push(
      `Known about user: ${userMemory.longTerm.facts.slice(-5).join("; ")}`,
    );
  }

  // Active study context
  if (userMemory.shortTerm.activeContext) {
    contextParts.push(
      `Currently studying: ${userMemory.shortTerm.activeContext}`,
    );
  }

  // Session goals
  if (userMemory.session.goals.length > 0) {
    contextParts.push(`Session goals: ${userMemory.session.goals.join(", ")}`);
  }

  // Recent verses studied
  if (userMemory.longTerm.lastStudiedVerses.length > 0) {
    const recentVerses = userMemory.longTerm.lastStudiedVerses.slice(-5);
    contextParts.push(`Recently studied: ${recentVerses.join(", ")}`);
  }

  return {
    shortTerm: userMemory.shortTerm,
    session: userMemory.session,
    longTerm: userMemory.longTerm,
    composedContext: contextParts.length > 0 ? contextParts.join("\n") : "",
  };
}

// Set session study focus
export async function setStudyFocus(
  userId: string,
  focus: string,
): Promise<void> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  userMemory.session.studyFocus = focus;
  await saveMemoryStoreDebounced();
}

// Add session goal
export async function addSessionGoal(
  userId: string,
  goal: string,
): Promise<void> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  if (!userMemory.session.goals.includes(goal)) {
    userMemory.session.goals.push(goal);
    await saveMemoryStoreDebounced();
  }
}

// Reset session (start new study session)
export async function resetSession(userId: string): Promise<void> {
  await loadMemoryStore();
  const userMemory = getUserMemory(userId);
  userMemory.session = {
    goals: [],
    startedAt: Date.now(),
  };
  userMemory.shortTerm.recentMessages = [];
  userMemory.shortTerm.activeContext = "";
  await saveMemoryStore();
  logger.info({ userId }, "Session reset");
}

// Get all user IDs that have memory
export async function getAllUserIds(): Promise<string[]> {
  await loadMemoryStore();
  return Object.keys(memoryStore);
}
