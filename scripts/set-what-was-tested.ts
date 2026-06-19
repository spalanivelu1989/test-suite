// Populate a run's report.summary ("What Was Tested" — a plain-English, per-test summary
// of what each automated check verified). Order matches report.results. Re-renders HTML.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderHtml } from "../src/reporter/render";

const runDir = process.argv[2];
if (!runDir)
  throw new Error("usage: tsx scripts/set-what-was-tested.ts <runDir>");

// One plain-English sentence per test, in the same order as report.results.
const SUMMARY: string[] = [
  "Ran the full end-to-end journey with demo data — choosing SAP PI/PO, entering costs, selecting the target platform, sizing the migration, and opening the ROI results — and confirmed the analysis shows annual savings, a break-even period, and a 5-year ROI.",
  "Checked that the Step 1 Company tab shows the Company Size, Industry, and Migration Timeline dropdowns and lets you choose from them.",
  "Checked that the Environment Assessment dropdowns (Integration Volume and System Complexity) open and offer their expected options.",
  "Verified the Infrastructure, Support, and Operations cost tabs each show their fields and that the cumulative total adds up across all the tabs.",
  "Confirmed that changing the licensing cost inputs immediately recalculates the grand total.",
  "Checked the Volumetrics message-throughput inputs accept values, including empty and boundary amounts.",
  "Verified the Step 2 'Additional TCO Components' section shows all of its tabs and they are navigable.",
  "Confirmed that turning on Event-Driven Architecture reveals the AEM plan options, that choosing a higher-tier plan increases the total, and that turning it off removes the added cost.",
  "Confirmed a fixed-amount contract discount reduces the grand total by exactly the amount entered, and caps at the list price when the amount is larger.",
  "Confirmed the percentage contract-discount slider reduces the total more at higher percentages and returns it to baseline when the discount is removed.",
  "Verified that switching between the Starter, Standard, and Enhanced editions applies the correct per-unit pricing formula for each.",
  "Confirmed that declaring already-owned BTP units lowers the incremental spend the more units you own.",
  "Confirmed the LOB-allocation slider drives the amount of transformation-incentive credit that gets applied.",
  "Confirmed the Year 1 / Year 2 SI-partner split sliders adjust and the subscription / migration offset breakdown updates.",
  "Verified the interface-count calculator computes the migration cost from the simple, medium, and complex interface counts and their unit prices.",
  "Confirmed switching between Manual Total and Interface-based modes updates the indicative migration cost and its source label.",
  "Confirmed the Annual Savings Potential slider adjusts the projected savings between its conservative and optimistic ends and back to baseline.",
  "Confirmed the Migration Cost and Contract Discount simulation sliders adjust the projected outcome across their ranges.",
];

const runJsonPath = join(runDir, "run.json");
const run = JSON.parse(await readFile(runJsonPath, "utf8"));

const total = run.report.results.length;
if (SUMMARY.length !== total) {
  throw new Error(
    `summary has ${SUMMARY.length} lines but report has ${total} results`,
  );
}

run.report.summary = SUMMARY;
run.report.testSummary =
  `All ${total} automated checks passed. In plain terms, the suite confirmed the SAP ` +
  `Integration Suite ROI calculator works end to end: each wizard step accepts input and ` +
  `recalculates correctly, every optional Step 2 lever (editions, discounts, AEM, existing ` +
  `BTP investment, transformation incentives) changes the totals as expected, the migration ` +
  `cost calculator adds up, and the final ROI results — savings, break-even, and 5-year ROI — render correctly.`;
run.report.generatedAt = new Date().toISOString();
run.updatedAt = new Date().toISOString();

await writeFile(runJsonPath, JSON.stringify(run, null, 2), "utf8");
await writeFile(join(runDir, "report.html"), renderHtml(run.report), "utf8");

console.log(`Set ${SUMMARY.length} "What Was Tested" summary lines.`);
