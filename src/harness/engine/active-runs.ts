declare global {
  // eslint-disable-next-line no-var
  var __jarvisActiveRuns: Map<string, AbortController> | undefined;
}

export function getActiveRuns(): Map<string, AbortController> {
  if (!globalThis.__jarvisActiveRuns) {
    globalThis.__jarvisActiveRuns = new Map<string, AbortController>();
  }
  return globalThis.__jarvisActiveRuns;
}
