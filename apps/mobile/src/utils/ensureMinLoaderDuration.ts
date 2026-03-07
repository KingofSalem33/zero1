export async function ensureMinLoaderDuration(
  startedAtMs: number,
  minDurationMs: number,
): Promise<void> {
  const elapsedMs = Date.now() - startedAtMs;
  const remainingMs = minDurationMs - elapsedMs;
  if (remainingMs <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, remainingMs);
  });
}
