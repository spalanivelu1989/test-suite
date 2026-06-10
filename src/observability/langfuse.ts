import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Langfuse observability bootstrap (LLM tracing).
 *
 * Two LLM surfaces are traced:
 *  - The raw Anthropic SDK (`src/claude/client.ts`, Reporter narrative) — captured
 *    automatically by the OpenInference {@link AnthropicInstrumentation}: model,
 *    token usage, and input/output land in Langfuse with zero call-site changes.
 *  - The Claude Agent SDK subprocess (Planner/Generator/Healer) — its LLM calls
 *    happen out-of-process and cannot be auto-instrumented, so `runAgent` wraps
 *    each run in a manual "agent" observation (see src/agents/runtime.ts).
 *
 * Tracing is OPT-IN via credentials, mirroring the Knowledge Layer's graceful
 * degradation (KNOWLEDGE_DATABASE_URL): with no LANGFUSE_* keys the OTel SDK is
 * never started, every manual span becomes a non-recording no-op, and the app
 * behaves exactly as before. No keys, no behaviour change, no overhead.
 */

let sdk: NodeSDK | undefined;
let processor: LangfuseSpanProcessor | undefined;
let enabled = false;

/** True once {@link initObservability} has started the OTel SDK with valid keys. */
export function isObservabilityEnabled(): boolean {
  return enabled;
}

/** Langfuse is configured only when both API keys are present. */
function hasCredentials(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY,
  );
}

export interface InitObservabilityOptions {
  /**
   * "batched" (default) suits the long-lived Next.js server; "immediate" suits
   * short-lived processes (the CI runner) so spans aren't lost on exit.
   */
  exportMode?: "immediate" | "batched";
}

/**
 * Start OpenTelemetry with the Langfuse exporter and Anthropic auto-instrumentation.
 * Idempotent (safe under Next.js HMR / repeated calls) and a no-op without keys.
 */
export function initObservability(opts: InitObservabilityOptions = {}): void {
  if (sdk) return; // already initialised
  if (!hasCredentials()) return; // tracing disabled — run cold, exactly as before

  // Patch the Anthropic class in place. `manuallyInstrument` works even though the
  // SDK module is already imported elsewhere, so import order doesn't matter here.
  const instrumentation = new AnthropicInstrumentation();
  instrumentation.manuallyInstrument(Anthropic);

  processor = new LangfuseSpanProcessor({
    exportMode: opts.exportMode ?? "batched",
    // Tag traces by deploy environment so prod/dev/test are filterable in the UI.
    environment:
      process.env.LANGFUSE_TRACING_ENVIRONMENT ??
      process.env.NODE_ENV ??
      "development",
  });

  sdk = new NodeSDK({
    spanProcessors: [processor],
    instrumentations: [instrumentation],
  });
  sdk.start();
  enabled = true;

  console.error(
    `[langfuse] tracing enabled (host=${
      process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com"
    }, mode=${opts.exportMode ?? "batched"})`,
  );
}

/**
 * Flush pending spans to Langfuse. Call before a short-lived process exits (the
 * CI runner) so the last traces are delivered. A no-op when tracing is disabled.
 */
export async function flushObservability(): Promise<void> {
  await processor?.forceFlush();
}

/**
 * Bound a string for use as span input/output. Prompts/results here can be large
 * (page content, generated specs); truncating keeps traces readable and avoids
 * shipping megabytes per span. Returns a `{ text, truncated, chars }` envelope so
 * the UI shows the original size even when clipped.
 */
export function boundText(
  value: string,
  max = 8_000,
): {
  text: string;
  truncated: boolean;
  chars: number;
} {
  if (value.length <= max)
    return { text: value, truncated: false, chars: value.length };
  return {
    text: value.slice(0, max) + `… [truncated ${value.length - max} chars]`,
    truncated: true,
    chars: value.length,
  };
}
