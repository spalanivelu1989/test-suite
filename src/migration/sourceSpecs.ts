// Phase 1 of Migration Check: discover an app's existing, proven specs from prior
// runs so the user can pick which ones to carry to a new deployment.
//
// Read-only. Sources everything from the Run Manager's persisted runs (disk +
// memory), so it works even when the Postgres knowledge layer is disabled.

import type { Run } from "../types";
import type { TestOutcome } from "../types";
import { getRunManager, type RunManager } from "../runManager/manager";
import { normalizeOrigin } from "../knowledge/appId";
import type { SourceApp, SourceSpec, SpecOutcome } from "./types";

/** The slice of the Run Manager we need — narrowed so tests can pass a fake. */
export type RunReader = Pick<RunManager, "list" | "get">;

/** A run is migratable only if it actually produced specs we can clone. */
function hasSpecs(run: Run): boolean {
  return (run.report?.generatedSpecs?.length ?? 0) > 0;
}

/** Map a per-run TestOutcome to the source baseline we surface. */
export function toSpecOutcome(outcome: TestOutcome | undefined): SpecOutcome {
  switch (outcome) {
    case "passed":
      return "passed";
    case "healed":
      return "healed";
    case "failed":
    case "fixme":
      return "failed";
    default:
      // "flaky" or missing → not a trustworthy baseline.
      return "unknown";
  }
}

/** Pull the `test('<title>')` title from a spec's source, or null. */
export function extractTitle(code: string): string | null {
  const m = /\btest(?:\.\w+)?\(\s*(['"`])([\s\S]*?)\1/.exec(code);
  return m ? m[2] : null;
}

/** Build the SourceSpec list for one run, joining each spec to its last outcome. */
export function specsForRun(run: Run): SourceSpec[] {
  const specs = run.report?.generatedSpecs ?? [];
  const results = run.report?.results ?? [];
  return specs.map(({ file, code }) => {
    const result =
      results.find((r) => r.fileName === file) ??
      results.find(
        (r) => r.fileName.endsWith(file) || file.endsWith(r.fileName),
      );
    return {
      file,
      title: extractTitle(code),
      code,
      sourceOutcome: toSpecOutcome(result?.outcome),
    };
  });
}

/**
 * List apps that have at least one prior run with specs, as migration sources.
 * Grouped by normalized origin; newest spec-bearing run wins for the shown URL.
 */
export async function listSourceApps(
  reader: RunReader = getRunManager(),
): Promise<SourceApp[]> {
  const runs = (await reader.list()).filter(
    (r) => hasSpecs(r) && r.config?.url && r.config.url !== "(unknown)",
  );

  const byApp = new Map<string, SourceApp>();
  for (const run of runs) {
    const appId = normalizeOrigin(run.config.url);
    const existing = byApp.get(appId);
    if (!existing) {
      byApp.set(appId, {
        appId,
        url: run.config.url,
        runCount: 1,
        lastRunAt: run.createdAt ?? null,
      });
      continue;
    }
    existing.runCount += 1;
    // Keep the most recent run's URL + timestamp as representative.
    if ((run.createdAt ?? "") > (existing.lastRunAt ?? "")) {
      existing.lastRunAt = run.createdAt ?? existing.lastRunAt;
      existing.url = run.config.url;
    }
  }

  return [...byApp.values()].sort((a, b) =>
    (a.lastRunAt ?? "") < (b.lastRunAt ?? "") ? 1 : -1,
  );
}

/**
 * Resolve which run to clone specs from: the explicit `sourceRunId` if given and
 * spec-bearing, otherwise the latest spec-bearing completed run for the app.
 */
export async function resolveSourceRun(
  sourceUrl: string,
  sourceRunId: string | undefined,
  reader: RunReader = getRunManager(),
): Promise<Run | null> {
  if (sourceRunId) {
    const run = await reader.get(sourceRunId);
    return run && hasSpecs(run) ? run : null;
  }
  const appId = normalizeOrigin(sourceUrl);
  const candidates = (await reader.list())
    .filter(
      (r) =>
        hasSpecs(r) &&
        r.config?.url &&
        normalizeOrigin(r.config.url) === appId &&
        r.status === "completed",
    )
    .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1));
  return candidates[0] ?? null;
}

/**
 * List the existing specs (with last outcome) eligible to carry over from a
 * source app. Returns the resolved source run id so callers know the provenance.
 */
export async function listSourceSpecs(
  sourceUrl: string,
  sourceRunId: string | undefined,
  reader: RunReader = getRunManager(),
): Promise<{ sourceRunId: string; specs: SourceSpec[] } | null> {
  const run = await resolveSourceRun(sourceUrl, sourceRunId, reader);
  if (!run) return null;
  return { sourceRunId: run.id, specs: specsForRun(run) };
}
