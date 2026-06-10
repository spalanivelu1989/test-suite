/**
 * Next.js instrumentation hook — runs once at server startup, before any route
 * handler. We initialise Langfuse tracing here so the Anthropic SDK is patched
 * before the first run executes.
 *
 * Guarded to the Node.js runtime: the OpenTelemetry NodeSDK uses Node-only APIs
 * and must never load in the edge runtime. The import is dynamic so the OTel
 * packages are never bundled into an edge build.
 *
 * Docs: https://langfuse.com/docs/observability/sdk/typescript/setup
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initObservability } = await import("./src/observability/langfuse");
    initObservability();
  }
}
