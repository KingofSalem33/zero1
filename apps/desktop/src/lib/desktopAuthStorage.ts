interface DesktopAuthStoreBridge {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  isSecurePersistence: () => Promise<boolean>;
}

interface KeyValueStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

type AuthStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type DesktopAuthStorageMode = "secure_bridge" | "insecure_fallback";

interface DesktopAuthStorageResult {
  storage: AuthStorageAdapter;
  mode: DesktopAuthStorageMode;
  isSecurePersistence: () => Promise<boolean>;
}

function createFallbackStorageAdapter(
  fallbackStorage: KeyValueStorageLike,
): DesktopAuthStorageResult {
  return {
    storage: {
      getItem: async (key: string) => fallbackStorage.getItem(key),
      setItem: async (key: string, value: string) => {
        fallbackStorage.setItem(key, value);
      },
      removeItem: async (key: string) => {
        fallbackStorage.removeItem(key);
      },
    },
    mode: "insecure_fallback",
    isSecurePersistence: async () => false,
  };
}

export function createDesktopAuthStorage(
  bridge?: DesktopAuthStoreBridge,
  fallbackStorage?: KeyValueStorageLike,
): DesktopAuthStorageResult {
  const resolvedBridge =
    bridge || (typeof window !== "undefined" ? window.desktop?.authStore : undefined);
  const resolvedFallbackStorage =
    fallbackStorage ||
    (typeof window !== "undefined" ? window.localStorage : undefined);

  if (resolvedBridge) {
    return {
      storage: {
        getItem: (key: string) => resolvedBridge.getItem(key),
        setItem: (key: string, value: string) =>
          resolvedBridge.setItem(key, value),
        removeItem: (key: string) => resolvedBridge.removeItem(key),
      },
      mode: "secure_bridge",
      isSecurePersistence: () => resolvedBridge.isSecurePersistence(),
    };
  }

  if (resolvedFallbackStorage) {
    console.warn(
      "[Desktop Auth] Secure auth store bridge unavailable; falling back to localStorage.",
    );
    return createFallbackStorageAdapter(resolvedFallbackStorage);
  }

  const inMemoryStore = new Map<string, string>();
  return createFallbackStorageAdapter({
    getItem: (key) => inMemoryStore.get(key) ?? null,
    setItem: (key, value) => {
      inMemoryStore.set(key, value);
    },
    removeItem: (key) => {
      inMemoryStore.delete(key);
    },
  });
}
