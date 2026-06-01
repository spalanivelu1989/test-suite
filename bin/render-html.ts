#!/usr/bin/env tsx
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { diskPersistence, getRunsRoot } from "../src/runManager/persistence";
import { renderHtml } from "../src/reporter/render";

// Renders a completed run's stored RunReport (.runs/<id>/run.json) to a static
// report.html alongside it. The web UI / API normally render HTML on demand;
// this writes it to disk for sharing or archiving.

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: npm run render:html -- <run-id>");
    process.exit(2);
  }

  const run = await diskPersistence.get(id);
  if (!run) {
    console.error(`No run found for id ${id} under ${getRunsRoot()}`);
    process.exit(1);
  }
  if (!run.report) {
    console.error(
      `Run ${id} has no report yet (status: ${run.status}, stage: ${run.stage}). ` +
        `HTML can only be rendered once the run has completed.`,
    );
    process.exit(1);
  }

  const outPath = join(getRunsRoot(), id, "report.html");
  await writeFile(outPath, renderHtml(run.report), "utf8");
  console.error(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(
    `Render failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
