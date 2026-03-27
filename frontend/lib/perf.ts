export function startPerf(label: string) {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  return () => {
    const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    // Keep dev-only timing light and easy to grep while tuning the workspace.
    console.info(`[perf] ${label}: ${Math.round(endedAt - startedAt)}ms`);
  };
}
