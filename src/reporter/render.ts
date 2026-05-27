import type { RunReport, TestResult } from "../types";
import { summarize } from "./report";
import { bucketResults } from "./successRate";

const OUTCOME_LABEL: Record<TestResult["outcome"], string> = {
  passed: "PASS",
  failed: "FAIL",
  flaky: "FLAKY",
  healed: "HEALED",
  fixme: "FIXME",
};

function ratePct(report: RunReport): number {
  return Math.round(report.successRate.rate * 100);
}
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function row(r: TestResult): string {
  const detail = (r.failureReason ?? (r.healed ? "repaired" : "")).replace(
    /\|/g,
    "\\|",
  );
  return `| ${r.flowId} | ${OUTCOME_LABEL[r.outcome]} | ${detail} |`;
}

/** T16: rich, actionable Markdown report (R5, R16). */
export function renderMarkdown(report: RunReport): string {
  const s = summarize(report);
  const b = bucketResults(report.results);
  const L: string[] = [
    `# AI UI Test Report`,
    "",
    `- **App:** ${report.url}`,
    `- **Run:** ${report.runId}`,
    `- **Generated:** ${report.generatedAt}`,
    "",
    `## Summary`,
    "",
    `**Success rate: ${ratePct(report)}%** (${report.successRate.passed}/${report.successRate.total} tests passed)`,
    "",
    `- Flow coverage: ${report.coverage.percent}% (${report.coverage.testedCount}/${report.coverage.curatedTotal} curated flows)`,
    `- Outcomes: ✅ ${s.passed} passed · ❌ ${s.failed} failed · 🔧 ${s.healed} healed · ⚠️ ${s.flaky} flaky · ⏭️ ${s.fixme} quarantined`,
    `- Flake rate ${pct(report.flakeRate)} · Auto-heal success ${pct(report.healSuccessRate)} · ${report.claudeCallCount} Claude calls`,
    "",
    `## Breakdown`,
    "",
    `### ✅ Passed (${b.passed.length})`,
    ...b.passed.map((r) => `- ${r.flowId}`),
    "",
    `### ❌ Needs attention (${b.needsAttention.length})`,
    ...b.needsAttention.map(
      (r) => `- ${r.flowId} — ${r.failureReason ?? r.outcome}`,
    ),
    "",
    `### 🔧 Where to improve (${b.whereToImprove.length})`,
    ...b.whereToImprove.map((r) => `- ${r.flowId} (${r.outcome})`),
    "",
    `## Test results`,
    "",
    `| Flow | Outcome | Detail |`,
    `| ---- | ------- | ------ |`,
    ...report.results.map(row),
  ];

  if (report.fixPrompts.length) {
    L.push("", `## Fix prompts`, "");
    for (const f of report.fixPrompts) {
      L.push(`- **${f.test}** — ${f.problem}`, `  - Change: ${f.change}`);
    }
  }
  if (report.issues.length) {
    L.push("", `## Issues found`, "", ...report.issues.map((i) => `- ${i}`));
  }
  if (report.recommendations.length) {
    L.push(
      "",
      `## Recommendations`,
      "",
      ...report.recommendations.map((r) => `- ${r}`),
    );
  }
  return `${L.join("\n")}\n`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** T16: self-contained, escaped HTML report (R5, R16). */
export function renderHtml(report: RunReport): string {
  const s = summarize(report);
  const b = bucketResults(report.results);
  const list = (items: string[]) =>
    items.length
      ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
      : "<p>None.</p>";
  const rows = report.results
    .map(
      (r) =>
        `<tr class="${r.outcome}"><td>${esc(r.flowId)}</td><td>${OUTCOME_LABEL[r.outcome]}</td><td>${esc(r.failureReason ?? (r.healed ? "repaired" : ""))}</td></tr>`,
    )
    .join("");
  const fixPrompts = report.fixPrompts.length
    ? `<ul>${report.fixPrompts.map((f) => `<li><strong>${esc(f.test)}</strong>: ${esc(f.problem)} → <em>${esc(f.change)}</em></li>`).join("")}</ul>`
    : "<p>None.</p>";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>AI UI Test Report — ${esc(report.url)}</title>
<style>
 body{font-family:system-ui,sans-serif;margin:2rem;color:#1a202c;max-width:60rem}
 .passed{background:#f0fff4}.failed{background:#fff5f5}.flaky{background:#fffaf0}
 .healed{background:#ebf8ff}.fixme{background:#f7fafc}
 table{border-collapse:collapse;width:100%}td,th{border:1px solid #e2e8f0;padding:.5rem;text-align:left}
 .big{font-size:2.5rem;font-weight:700;margin:0}
</style></head><body>
<h1>AI UI Test Report</h1>
<p><strong>App:</strong> ${esc(report.url)}<br/>
<strong>Run:</strong> ${esc(report.runId)}<br/>
<strong>Generated:</strong> ${esc(report.generatedAt)}</p>
<p class="big">${ratePct(report)}% success rate</p>
<p>${report.successRate.passed}/${report.successRate.total} tests passed ·
${report.coverage.percent}% flow coverage ·
flake ${pct(report.flakeRate)} · auto-heal ${pct(report.healSuccessRate)} ·
${report.claudeCallCount} Claude calls</p>
<h2>Breakdown</h2>
<h3>Passed (${b.passed.length})</h3>${list(b.passed.map((r) => r.flowId))}
<h3>Needs attention (${b.needsAttention.length})</h3>${list(b.needsAttention.map((r) => `${r.flowId} — ${r.failureReason ?? r.outcome}`))}
<h3>Where to improve (${b.whereToImprove.length})</h3>${list(b.whereToImprove.map((r) => `${r.flowId} (${r.outcome})`))}
<h2>Test results</h2>
<table><thead><tr><th>Flow</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Fix prompts</h2>${fixPrompts}
<h2>Issues found</h2>${list(report.issues)}
<h2>Recommendations</h2>${list(report.recommendations)}
</body></html>
`;
}
