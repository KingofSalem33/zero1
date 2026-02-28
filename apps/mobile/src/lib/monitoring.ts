import { MOBILE_ENV } from "./env";

let initialized = false;

export function initMobileMonitoring() {
  if (initialized) return;
  initialized = true;

  const hasDsn = MOBILE_ENV.SENTRY_DSN.trim().length > 0;
  const enabled = MOBILE_ENV.IS_PRODUCTION && hasDsn;

  if (!hasDsn) {
    console.info(
      "[MOBILE MONITORING] Sentry disabled (missing EXPO_PUBLIC_SENTRY_DSN).",
    );
    return;
  }

  void import("@sentry/react-native")
    .then((Sentry) => {
      Sentry.init({
        dsn: MOBILE_ENV.SENTRY_DSN,
        enabled,
        tracesSampleRate: enabled ? 0.1 : 0,
      });
    })
    .catch((error) => {
      console.warn(
        "[MOBILE MONITORING] Sentry initialization failed; continuing without crash reporting.",
        error,
      );
    });
}
