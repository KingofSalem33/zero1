const AUTH_REQUIRED_HINTS = [
  "authentication required",
  "api request failed (401)",
  "jwt",
  "not authenticated",
];

// Keep auth-required redirects on root so sign-in flow does not depend on
// deep-link route rewrites at the CDN edge.
export const WEB_SIGN_IN_PATH = "/";

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
