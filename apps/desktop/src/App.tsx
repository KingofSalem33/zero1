import { SharedAuthProbeView } from "@zero1/shared-client";
import { useEffect, useState } from "react";
import { DESKTOP_ENV } from "./lib/env";
import {
  DESKTOP_AUTH_STORAGE_MODE,
  getDesktopSecurePersistenceStatus,
  supabase,
} from "./lib/supabase";

export default function App() {
  const [desktopVersion, setDesktopVersion] = useState<string>("unknown");
  const [securePersistence, setSecurePersistence] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    void window.desktop?.getVersion().then(setDesktopVersion).catch(() => {
      setDesktopVersion("unknown");
    });

    void getDesktopSecurePersistenceStatus()
      .then(setSecurePersistence)
      .catch(() => setSecurePersistence(false));
  }, []);

  const persistenceLabel = `Session persistence: ${DESKTOP_AUTH_STORAGE_MODE}${
    securePersistence === null
      ? ""
      : securePersistence
        ? " (OS-encrypted)"
        : " (not OS-encrypted)"
  }`;

  return (
    <SharedAuthProbeView
      appLabel="Zero1 Desktop Foundation"
      apiBaseUrl={DESKTOP_ENV.API_URL}
      strictEnv={DESKTOP_ENV.STRICT_ENV}
      runtimeVersionLabel={`Electron v${desktopVersion}`}
      magicLinkRedirectTo={DESKTOP_ENV.MAGIC_LINK_REDIRECT_TO || undefined}
      sessionPersistenceLabel={persistenceLabel}
      supabase={supabase}
    />
  );
}
