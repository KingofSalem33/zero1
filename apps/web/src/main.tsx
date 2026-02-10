import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
// import * as Sentry from "@sentry/react";
import "./index.css";
import { router } from "./router.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";

// Sentry disabled for performance optimization
// TODO: Re-enable with lazy loading after hydration
// Sentry.init({
//   dsn: import.meta.env.VITE_SENTRY_DSN,
//   environment: import.meta.env.MODE,
//   enabled: import.meta.env.PROD,
//   integrations: [
//     Sentry.browserTracingIntegration(),
//     Sentry.replayIntegration({
//       maskAllText: false,
//       blockAllMedia: false,
//     }),
//   ],
//   tracesSampleRate: 1.0,
//   replaysSessionSampleRate: 0.1,
//   replaysOnErrorSampleRate: 1.0,
// });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
