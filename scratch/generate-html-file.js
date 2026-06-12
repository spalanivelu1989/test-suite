import { diskPersistence } from "../src/runManager/persistence.js";
import { renderHtml } from "../src/reporter/render.js";
import { writeFileSync } from "node:fs";

async function main() {
  const runId = "3f8ab896-ee79-4c91-b28d-84c65abde440";
  const run = await diskPersistence.get(runId);
  if (!run || !run.report) {
    console.error("Run/Report not found");
    process.exit(1);
  }

  const html = renderHtml(run.report);
  writeFileSync("scratch/generated_report.html", html, "utf8");
  console.log("HTML written to scratch/generated_report.html");
}

main().catch(console.error);
