type StorageAdapter = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

export interface SupabaseBrowserClientOptions {
  storage?: StorageAdapter;
}

export function buildSupabaseAuthOptions(
  options: SupabaseBrowserClientOptions = {},
) {
  return {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    ...(options.storage ? { storage: options.storage } : {}),
  };
}
