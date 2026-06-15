/**
 * Backfill `healProvenance` onto run reports created before the metric existed.
 *
 * The split is recomputed deterministically from each report's already-stored
 * `healingEvents` (ADR-0004): a heal is template-directed (HDR) when that failure
 * signature was already successfully healed in an EARLIER run of the same app —
 * i.e. a precedent would have been on hand. Otherwise it's blind (NHEJ). This is
 * the same definition the live pipeline applies, reconstructed historically.
 *
 * Additive + idempotent: only the `healProvenance` key is written; re-running
 * recomputes the same values. Updates local .runs/<id>/run.json and, when
 * KNOWLEDGE_DATABASE_URL is set, the Postgres raw_reports row too.
 *
 *   npx tsx bin/backfill-heal-provenance.ts
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { normalizeOrigin } from "../src/knowledge/appId";
import { computeHealProvenance } from "../src/knowledge/heal/provenance";
import type { HealingEvent, HealingPrecedent } from "../src/knowledge/types";
import type { RunReport } from "../src/types";

const RUNS_DIR = join(process.cwd(), ".runs");

function sigPrecedents(signatures: Set<string>): HealingPrecedent[] {
  // computeHealProvenance only reads `failureSignature`; the rest is a stub.
  return [...signatures].map((s) => ({
    runId: "",
    file: "",
    flowId: null,
    failureSignature: s,
    strategy: "other" as const,
    before: "",
    after: "",
    score: 1,
  }));
}

async function main() {
  let dirs: string[];
  try {
    dirs = await readdir(RUNS_DIR);
  } catch {
    console.log(`No ${RUNS_DIR} directory — nothing to backfill.`);
    return;
  }

  // Load every run.json with a report.
  const loaded: { id: string; path: string; raw: any; report: RunReport }[] =
    [];
  for (const id of dirs) {
    const path = join(RUNS_DIR, id, "run.json");
    try {
      const raw = JSON.parse(await readFile(path, "utf8"));
      if (raw?.report?.runId)
        loaded.push({ id, path, raw, report: raw.report });
    } catch {
      // skip non-run dirs / unreadable files
    }
  }

  // Chronological so "earlier run" precedents are well-defined.
  loaded.sort((a, b) =>
    (a.report.generatedAt ?? "").localeCompare(b.report.generatedAt ?? ""),
  );

  const pool = process.env.KNOWLEDGE_DATABASE_URL
    ? new Pool({ connectionString: process.env.KNOWLEDGE_DATABASE_URL })
    : null;

  // Per-app set of signatures healed in prior runs (the available templates).
  const healedByApp = new Map<string, Set<string>>();
  let written = 0;
  let dbUpdated = 0;

  for (const { id, path, raw, report } of loaded) {
    const appId = normalizeOrigin(report.url);
    const seen = healedByApp.get(appId) ?? new Set<string>();
    const events: HealingEvent[] = report.healingEvents ?? [];

    const prov = computeHealProvenance(events, sigPrecedents(seen));
    report.healProvenance = prov;
    raw.report = report;
    await writeFile(path, JSON.stringify(raw, null, 2), "utf8");
    written++;
    console.log(
      `${id.slice(0, 8)} [${appId}] healed=${prov.healed} HDR=${Math.round(
        prov.hdrRate * 100,
      )}% (template=${prov.templateDirected} blind=${prov.blind})`,
    );

    // Advance the precedent set with THIS run's successful heals.
    for (const e of events)
      if (e.outcome === "healed" && e.failureSignature)
        seen.add(e.failureSignature);
    healedByApp.set(appId, seen);

    if (pool) {
      const res = await pool.query(
        `UPDATE raw_reports
            SET report = jsonb_set(report, '{healProvenance}', $2::jsonb, true)
          WHERE run_id = $1`,
        [report.runId, JSON.stringify(prov)],
      );
      if (res.rowCount && res.rowCount > 0) dbUpdated++;
    }
  }

  if (pool) await pool.end();
  console.log(
    `\nBackfilled ${written} run.json file(s); updated ${dbUpdated} raw_reports row(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
