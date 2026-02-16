/**
 * Haptic feedback via the Vibration API (mobile only, no-op on desktop).
 */

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

/** Light tap — highlight created, color selected */
export function hapticTap(): void {
  vibrate(10);
}

/** Medium — share action, export */
export function hapticMedium(): void {
  vibrate(20);
}

/** Success — sync complete, note saved */
export function hapticSuccess(): void {
  vibrate([10, 40, 10]);
}

/** Delete — highlight removed */
export function hapticDelete(): void {
  vibrate([15, 30, 15]);
}
