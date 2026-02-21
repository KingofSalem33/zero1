import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const explicitUserDataDir = (process.env.DESKTOP_USER_DATA_DIR || "").trim();
if (explicitUserDataDir.length > 0) {
  app.setPath("userData", explicitUserDataDir);
} else if (!app.isPackaged) {
  app.setPath(
    "userData",
    path.join(app.getPath("appData"), "zero1-desktop-dev"),
  );
}
app.setPath("sessionData", path.join(app.getPath("userData"), "session-data"));
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const desktopWebAppUrl = (process.env.DESKTOP_WEB_APP_URL || "").trim();
const updateChannel = process.env.DESKTOP_UPDATE_CHANNEL || "latest";
const autoUpdateEnabled = process.env.DESKTOP_AUTO_UPDATE_ENABLED !== "false";
const updateFeedUrl = process.env.DESKTOP_UPDATE_FEED_URL;
const allowPlaintextSessionFallback =
  process.env.DESKTOP_ALLOW_PLAINTEXT_SESSION_FALLBACK === "true";
const authStoreFilename = "desktop-auth-session.json";
const diagnosticsFilename = "desktop-diagnostics.log";

type AuthStoreRecord = Record<string, string>;

function getAuthStorePath(): string {
  return path.join(app.getPath("userData"), authStoreFilename);
}

function getDiagnosticsPath(): string {
  return path.join(app.getPath("userData"), diagnosticsFilename);
}

async function appendDiagnostic(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      payload,
    });
    const diagnosticsPath = getDiagnosticsPath();
    await fs.mkdir(path.dirname(diagnosticsPath), { recursive: true });
    await fs.appendFile(diagnosticsPath, `${line}\n`, "utf8");
  } catch (error) {
    console.error("[Diagnostics] Failed to write diagnostic log:", error);
  }
}

function assertValidAuthStoreKey(key: string): void {
  if (typeof key !== "string" || key.trim().length === 0 || key.length > 256) {
    throw new Error("Invalid auth storage key");
  }
}

function encodeAuthStoreValue(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(value);
    return `enc:${encrypted.toString("base64")}`;
  }

  if (!allowPlaintextSessionFallback) {
    throw new Error(
      "Secure storage unavailable and plaintext fallback is disabled.",
    );
  }

  return `plain:${Buffer.from(value, "utf8").toString("base64")}`;
}

function decodeAuthStoreValue(value: string): string {
  if (value.startsWith("enc:")) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure storage unavailable for encrypted payload.");
    }
    const rawBuffer = Buffer.from(value.slice(4), "base64");
    return safeStorage.decryptString(rawBuffer);
  }

  if (value.startsWith("plain:")) {
    return Buffer.from(value.slice(6), "base64").toString("utf8");
  }

  return value;
}

async function loadAuthStore(): Promise<AuthStoreRecord> {
  try {
    const raw = await fs.readFile(getAuthStorePath(), "utf8");
    const parsed = JSON.parse(raw) as AuthStoreRecord;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveAuthStore(store: AuthStoreRecord): Promise<void> {
  const storePath = getAuthStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store), "utf8");
}

function setupSecureAuthStoreHandlers(): void {
  ipcMain.handle("auth-store:get", async (_event, key: string) => {
    assertValidAuthStoreKey(key);
    const store = await loadAuthStore();
    const encoded = store[key];
    if (typeof encoded !== "string") {
      return null;
    }
    return decodeAuthStoreValue(encoded);
  });

  ipcMain.handle(
    "auth-store:set",
    async (_event, key: string, value: string): Promise<void> => {
      assertValidAuthStoreKey(key);
      const store = await loadAuthStore();
      store[key] = encodeAuthStoreValue(value);
      await saveAuthStore(store);
    },
  );

  ipcMain.handle("auth-store:remove", async (_event, key: string) => {
    assertValidAuthStoreKey(key);
    const store = await loadAuthStore();
    delete store[key];
    await saveAuthStore(store);
  });

  ipcMain.handle("auth-store:is-secure", async () => {
    return safeStorage.isEncryptionAvailable();
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl) => {
      void appendDiagnostic("did-fail-load", {
        errorCode,
        errorDescription,
        validatedUrl,
      });
    },
  );

  window.once("ready-to-show", () => {
    window.show();
  });

  if (desktopWebAppUrl) {
    void window.loadURL(desktopWebAppUrl);
    if (devServerUrl) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else if (devServerUrl) {
    void window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(path.resolve(__dirname, "..", "dist", "index.html"));
  }

  return window;
}

function setupCrashDiagnostics(): void {
  process.on("uncaughtException", (error) => {
    void appendDiagnostic("uncaughtException", {
      message: error.message,
      stack: error.stack,
    });
  });

  process.on("unhandledRejection", (reason) => {
    void appendDiagnostic("unhandledRejection", {
      reason:
        reason instanceof Error
          ? { message: reason.message, stack: reason.stack }
          : String(reason),
    });
  });

  app.on("render-process-gone", (_event, webContents, details) => {
    void appendDiagnostic("render-process-gone", {
      url: webContents.getURL(),
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });

  app.on("child-process-gone", (_event, details) => {
    void appendDiagnostic("child-process-gone", {
      type: details.type,
      reason: details.reason,
      serviceName: details.serviceName || null,
      name: details.name || null,
      exitCode: details.exitCode,
    });
  });

  ipcMain.handle("diagnostics:get-status", async () => {
    const diagnosticsPath = getDiagnosticsPath();
    let exists = false;
    try {
      await fs.access(diagnosticsPath);
      exists = true;
    } catch {
      exists = false;
    }

    return {
      diagnosticsPath,
      exists,
    };
  });
}

function setupAutoUpdate(): void {
  if (!app.isPackaged || !autoUpdateEnabled) {
    return;
  }

  autoUpdater.channel = updateChannel;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  if (updateFeedUrl) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: updateFeedUrl,
    });
  }

  autoUpdater.on("error", (error) => {
    console.error("[AutoUpdate] Error:", error);
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdate] Update available:", info.version);
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[AutoUpdate] No update available");
  });

  autoUpdater.on("update-downloaded", async () => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "Update ready",
      message: "A new version has been downloaded.",
      detail: "Restart Zero1 now to apply the update?",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  void autoUpdater.checkForUpdatesAndNotify();

  const sixHoursMs = 6 * 60 * 60 * 1000;
  setInterval(() => {
    void autoUpdater.checkForUpdates();
  }, sixHoursMs);
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.zero1.desktop");
  ipcMain.handle("app:getVersion", () => app.getVersion());
  setupSecureAuthStoreHandlers();
  setupCrashDiagnostics();

  createMainWindow();
  setupAutoUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
