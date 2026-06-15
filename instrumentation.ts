/**
 * Next.js instrumentation hook — runs once at server startup, before any route
 * handler. We use it to (1) initialise Langfuse tracing so the Anthropic SDK is
 * patched before the first run executes, and (2) auto-apply Knowledge Layer
 * migrations so a forgotten `npm run knowledge:migrate` can't silently break
 * ingestion (e.g. a column the writer expects).
 *
 * Guarded to the Node.js runtime: the OpenTelemetry NodeSDK and `pg` use
 * Node-only APIs and must never load in the edge runtime. Imports are dynamic so
 * those packages are never bundled into an edge build.
 *
 * Docs: https://langfuse.com/docs/observability/sdk/typescript/setup
 */
export async function register(): Promise<void> {
  // IMPORTANT: keep node-only dynamic imports INSIDE this positive
  // `=== "nodejs"` block. Next replaces process.env.NEXT_RUNTIME with a literal
  // per build, so for the Edge bundle this becomes `if (false) { … }` and webpack
  // drops the imports below — they pull OTel/grpc (`stream`) and `pg`/`node:fs`,
  // which don't exist in the Edge runtime. Do NOT rewrite this as an early-return
  // guard (`if (… !== "nodejs") return`): that moves the imports out of the dead
  // branch, so webpack bundles them for Edge and the build fails.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initObservability } = await import("./src/observability/langfuse");
    initObservability();

    await autoMigrateKnowledge();
  }
}

/**
 * Best-effort Knowledge Layer migration at startup. A failure logs and continues
 * — the knowledge layer degrades safely on its own, and persistRun has a
 * column-presence guard as a second line of defense.
 */
async function autoMigrateKnowledge(): Promise<void> {
  // Same rule as register(): the node-only imports live inside a positive
  // `=== "nodejs"` block so they are eliminated from the Edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const url = process.env.KNOWLEDGE_DATABASE_URL;
    if (!url) return; // knowledge layer disabled (cold) — nothing to migrate.

    try {
      const { join } = await import("node:path");
      const { migrate } = await import("./src/knowledge/store/migrate");

      // Resolve the .sql folder from the project root, NOT import.meta.url —
      // under Next's compiled output the module lives in .next/server and the
      // migration files are not colocated (see migrate()'s migrationsDir note).
      const migrationsDir = join(
        process.cwd(),
        "src",
        "knowledge",
        "store",
        "migrations",
      );

      const applied = await migrate(url, migrationsDir);
      console.log(
        applied.length
          ? `[knowledge] auto-migrate applied ${applied.length}: ${applied.join(", ")}`
          : "[knowledge] schema up to date",
      );
    } catch (err) {
      console.error(
        "[knowledge] auto-migrate failed (continuing; run `npm run knowledge:migrate`):",
        err instanceof Error ? err.message : err,
      );
    }
  }
}
