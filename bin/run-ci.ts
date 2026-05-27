#!/usr/bin/env tsx
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runToReport } from "../src/orchestrator/runService";
import { reportToJson } from "../src/reporter/report";
import { renderHtml, renderMarkdown } from "../src/reporter/render";
import type { RunConfig } from "../src/types";

interface CliArgs {
  url?: string;
  out: string;
  maxDepth?: number;
  maxPages?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { out: "ci-report" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--max-depth") args.maxDepth = Number(argv[++i]);
    else if (a === "--max-pages") args.maxPages = Number(argv[++i]);
    else if (!a.startsWith("--")) args.url = a;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error(
      "Usage: npm run ci -- <url> [--out dir] [--max-depth n] [--max-pages n]",
    );
    process.exit(2);
  }

  const config: RunConfig = { url: args.url };
  if (args.maxDepth !== undefined) config.maxDepth = args.maxDepth;
  if (args.maxPages !== undefined) config.maxPages = args.maxPages;

  const runId = randomUUID();
  const report = await runToReport(runId, config, (e) =>
    console.error(`[${e.stage}] ${e.message}`),
  );

  const outDir = resolve(process.cwd(), args.out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "report.json"), reportToJson(report), "utf8");
  await writeFile(join(outDir, "report.md"), renderMarkdown(report), "utf8");
  await writeFile(join(outDir, "report.html"), renderHtml(report), "utf8");

  const failed = report.results.filter((r) => r.outcome === "failed").length;
  console.error(
    `\nCoverage ${report.coverage.percent}% · ${report.results.length} tests · ${failed} failed · report in ${outDir}`,
  );
  // Non-zero exit when any test failed, so CI gates on it (R10).
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(
    `Run failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
