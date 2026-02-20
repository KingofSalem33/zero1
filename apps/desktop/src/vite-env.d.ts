/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_STRICT_ENV?: string;
  readonly VITE_MAGIC_LINK_REDIRECT_TO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DesktopBridge {
  getVersion: () => Promise<string>;
  authStore?: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
    isSecurePersistence: () => Promise<boolean>;
  };
  diagnostics?: {
    getStatus: () => Promise<{
      diagnosticsPath: string;
      exists: boolean;
    }>;
  };
}

interface Window {
  desktop?: DesktopBridge;
}
