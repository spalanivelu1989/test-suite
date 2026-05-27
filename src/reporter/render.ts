import type { RunReport, TestResult } from "../types";
import { summarize } from "./report";

const OUTCOME_LABEL: Record<TestResult["outcome"], string> = {
  passed: "PASS",
  failed: "FAIL",
  flaky: "FLAKY",
  healed: "HEALED",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** T14: human-readable Markdown report (R5). */
export function renderMarkdown(report: RunReport): string {
  const s = summarize(report);
  const lines: string[] = [
    `# AI UI Test Report`,
    "",
    `- **Target:** ${report.url}`,
    `- **Run:** ${report.runId}`,
    `- **Generated:** ${report.generatedAt}`,
    `- **Claude calls:** ${report.claudeCallCount}`,
    "",
    `## Summary`,
    "",
    `- Flow coverage: **${report.coverage.percent}%** (${report.coverage.testedCount}/${report.coverage.curatedTotal} curated flows)`,
    `- Tests: ${s.total} — ✅ ${s.passed} passed, ❌ ${s.failed} failed, ⚠️ ${s.flaky} flaky, 🔧 ${s.healed} healed`,
    `- Flake rate: ${pct(report.flakeRate)} · Auto-heal success: ${pct(report.healSuccessRate)}`,
    "",
    `## Test results`,
    "",
    `| Flow | Outcome | Detail |`,
    `| ---- | ------- | ------ |`,
    ...report.results.map(
      (r) =>
        `| ${r.flowId} | ${OUTCOME_LABEL[r.outcome]} | ${(r.failureReason ?? (r.healed ? "repaired" : "")).replace(/\|/g, "\\|")} |`,
    ),
  ];
  if (report.coverage.missingFlows.length > 0) {
    lines.push("", `## Uncovered curated flows`, "");
    lines.push(...report.coverage.missingFlows.map((f) => `- ${f}`));
  }
  return `${lines.join("\n")}\n`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** T14: self-contained HTML report (R5). */
export function renderHtml(report: RunReport): string {
  const s = summarize(report);
  const rows = report.results
    .map(
      (r) =>
        `<tr class="${r.outcome}"><td>${esc(r.flowId)}</td><td>${OUTCOME_LABEL[r.outcome]}</td><td>${esc(r.failureReason ?? (r.healed ? "repaired" : ""))}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>AI UI Test Report — ${esc(report.url)}</title>
<style>
 body{font-family:system-ui,sans-serif;margin:2rem;color:#1a202c}
 .passed{background:#f0fff4}.failed{background:#fff5f5}.flaky{background:#fffaf0}.healed{background:#ebf8ff}
 table{border-collapse:collapse;width:100%}td,th{border:1px solid #e2e8f0;padding:.5rem;text-align:left}
 .big{font-size:2rem;font-weight:700}
</style></head><body>
<h1>AI UI Test Report</h1>
<p><strong>Target:</strong> ${esc(report.url)}<br/>
<strong>Run:</strong> ${esc(report.runId)}<br/>
<strong>Generated:</strong> ${esc(report.generatedAt)}</p>
<p class="big">${report.coverage.percent}% flow coverage</p>
<p>${report.coverage.testedCount}/${report.coverage.curatedTotal} curated flows ·
${s.passed} passed · ${s.failed} failed · ${s.flaky} flaky · ${s.healed} healed<br/>
Flake rate ${pct(report.flakeRate)} · Auto-heal success ${pct(report.healSuccessRate)} ·
Claude calls ${report.claudeCallCount}</p>
<h2>Test results</h2>
<table><thead><tr><th>Flow</th><th>Outcome</th><th>Detail</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>
`;
}
