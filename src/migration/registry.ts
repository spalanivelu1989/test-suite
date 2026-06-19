// Process-wide registry of in-flight migration checks → their AbortController, so
// a cancel request from one route can stop a run started by another. On
// globalThis because Next.js duplicates module instances across route files.

const g = globalThis as unknown as {
  __migrationAborts?: Map<string, AbortController>;
};

function registry(): Map<string, AbortController> {
  if (!g.__migrationAborts) g.__migrationAborts = new Map();
  return g.__migrationAborts;
}

/** Register a new run and return its controller. */
export function registerRun(id: string): AbortController {
  const controller = new AbortController();
  registry().set(id, controller);
  return controller;
}

/** Abort a running check. Returns false if it's unknown (already done/never existed). */
export function abortRun(id: string): boolean {
  const controller = registry().get(id);
  if (!controller) return false;
  controller.abort();
  return true;
}

/** Drop a run from the registry once it's terminal. */
export function finishRun(id: string): void {
  registry().delete(id);
}
