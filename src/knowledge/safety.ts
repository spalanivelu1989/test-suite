// The one place that makes every knowledge-base call best-effort (Spec R4/N3,
// Plan D3). All KB access goes through `withKb`: on any error OR timeout it logs
// and returns the caller's fallback — it NEVER rethrows. Deleting this module
// would scatter try/catch across every call site (the deletion test it passes).
//
// Because EVERY KB seam funnels through here, this is also the one place we
// trace them: each call becomes a Langfuse `kb:<op>` span nested under the
// active run trace (so the Discoverer's prior-plan lookup, the Designer's
// cosine-similarity coverage decision, and the Evolver's precedent/playbook
// retrieval all show up alongside the agent generations). The span is a
// non-recording no-op when Langfuse is disabled (no LANGFUSE_* keys), mirroring
// the KB's own graceful degradation — zero overhead, zero behaviour change.

import { startActiveObservation } from "@langfuse/tracing";

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

export interface WithKbOptions<T = unknown> {
  /** Bounded wait so a hung DB never stalls a run (protects N4). */
  timeoutMs?: number;
  /** Notified on failure (for telemetry/event stream). */
  onError?: (op: string, message: string) => void;
  /**
   * Domain detail recorded as the span's input — e.g. `{ appId, scenarios: 8 }`.
   * Purely observational; never affects the operation.
   */
  input?: Record<string, unknown>;
  /**
   * Summarize the result into the span's output — e.g. `{ reuse: 3, new: 5 }`
   * for a coverage decision, `{ precedents: 2 }` for a heal lookup. When omitted,
   * a compact generic summary is used ({@link summarizeResult}) so a span never
   * ships a large payload (a plan's markdown, a copied spec) by accident.
   */
  summarize?: (result: T) => Record<string, unknown>;
}

/** Compact, payload-safe span output when a call site provides no summarizer. */
function summarizeResult(result: unknown): Record<string, unknown> {
  if (result == null) return { found: false };
  if (Array.isArray(result)) return { count: result.length };
  if (typeof result === "string") return { found: true, chars: result.length };
  if (typeof result === "object") return { found: true };
  return { value: result as boolean | number };
}

/**
 * Run a knowledge-base operation best-effort. Returns `fn()`'s value, or
 * `fallback` if it throws or exceeds the timeout. Never throws. Every call is
 * traced as a `kb:<op>` Langfuse span (a no-op when tracing is disabled).
 */
export async function withKb<T>(
  op: string,
  fn: () => Promise<T>,
  fallback: T,
  opts: WithKbOptions<T> = {},
): Promise<T> {
  // `startActiveObservation` makes the `kb:<op>` span the ACTIVE OTel context for
  // the duration of the callback (it awaits the returned promise, then ends the
  // span). That active context is what the pg auto-instrumentation reads, so every
  // SQL statement issued inside `fn` nests under this span. A no-op when tracing
  // is disabled.
  return startActiveObservation(`kb:${op}`, async (span) => {
    if (opts.input) span.update({ input: opts.input });
    try {
      const result = await withTimeout(fn(), opts.timeoutMs ?? 4000);
      span.update({
        output: opts.summarize
          ? opts.summarize(result)
          : summarizeResult(result),
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.onError?.(op, message);
      // Best-effort: log and degrade, exactly like runManager/persistence.ts.
      console.error(
        `[knowledge] ${op} failed (ignored, running cold): ${message}`,
      );
      span.update({
        level: "WARNING",
        statusMessage: message,
        output: { fellBackToCold: true },
      });
      return fallback;
    }
  });
}
