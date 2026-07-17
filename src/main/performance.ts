export function createLaunchTimer(clock: () => number = () => performance.now()): () => number {
  const startedAt = clock();
  return () => Math.max(0, clock() - startedAt);
}
