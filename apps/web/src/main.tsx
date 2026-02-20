import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import * as Sentry from "@sentry/react";
import "./index.css";
import { router } from "./router.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { WEB_ENV } from "./lib/env";

const sentryDsn = WEB_ENV.SENTRY_DSN;
const sentryEnabled = WEB_ENV.IS_PRODUCTION && Boolean(sentryDsn);

Sentry.init({
  dsn: sentryDsn,
  environment: WEB_ENV.MODE,
  enabled: sentryEnabled,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
