// The one place that makes every knowledge-base call best-effort (Spec R4/N3,
// Plan D3). All KB access goes through `withKb`: on any error OR timeout it logs
// and returns the caller's fallback — it NEVER rethrows. Deleting this module
// would scatter try/catch across every call site (the deletion test it passes).

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface WithKbOptions {
  /** Bounded wait so a hung DB never stalls a run (protects N4). */
  timeoutMs?: number;
  /** Notified on failure (for telemetry/event stream). */
  onError?: (op: string, message: string) => void;
}

/**
 * Run a knowledge-base operation best-effort. Returns `fn()`'s value, or
 * `fallback` if it throws or exceeds the timeout. Never throws.
 */
export async function withKb<T>(
  op: string,
  fn: () => Promise<T>,
  fallback: T,
  opts: WithKbOptions = {},
): Promise<T> {
  try {
    return await withTimeout(fn(), opts.timeoutMs ?? 4000);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    opts.onError?.(op, message);
    // Best-effort: log and degrade, exactly like runManager/persistence.ts.
    console.error(
      `[knowledge] ${op} failed (ignored, running cold): ${message}`,
    );
    return fallback;
  }
}
