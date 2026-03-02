const AUTH_REQUIRED_HINTS = [
  "authentication required",
  "api request failed (401)",
  "jwt",
  "not authenticated",
];

export const WEB_SIGN_IN_PATH = "/ops/shared-probe";

export function isAuthenticationRequiredError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return AUTH_REQUIRED_HINTS.some((hint) => message.includes(hint));
  }
  if (typeof error === "string") {
    const message = error.toLowerCase();
    return AUTH_REQUIRED_HINTS.some((hint) => message.includes(hint));
  }
  return false;
}
