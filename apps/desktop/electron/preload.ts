import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getVersion: () => ipcRenderer.invoke("app:getVersion") as Promise<string>,
  authStore: {
    getItem: (key: string) =>
      ipcRenderer.invoke("auth-store:get", key) as Promise<string | null>,
    setItem: (key: string, value: string) =>
      ipcRenderer.invoke("auth-store:set", key, value) as Promise<void>,
    removeItem: (key: string) =>
      ipcRenderer.invoke("auth-store:remove", key) as Promise<void>,
    isSecurePersistence: () =>
      ipcRenderer.invoke("auth-store:is-secure") as Promise<boolean>,
  },
  diagnostics: {
    getStatus: () =>
      ipcRenderer.invoke("diagnostics:get-status") as Promise<{
        diagnosticsPath: string;
        exists: boolean;
      }>,
  },
});
