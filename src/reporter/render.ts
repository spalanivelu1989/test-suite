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

/** T16: self-contained HTML report — plain English for all audiences (R5, R16). */
export function renderHtml(report: RunReport): string {
  const s = summarize(report);
  const b = bucketResults(report.results);
  const successPct = ratePct(report);

  /* ── outcome helpers ── */
  function outcomeEmoji(r: TestResult): string {
    const map: Record<TestResult["outcome"], string> = {
      passed: "✅",
      failed: "❌",
      flaky: "⚠️",
      healed: "🔧",
      fixme: "⏭️",
    };
    return map[r.outcome];
  }

  function outcomeWord(r: TestResult): string {
    const map: Record<TestResult["outcome"], string> = {
      passed: "Passed",
      failed: "Failed",
      flaky: "Unreliable",
      healed: "Auto-fixed",
      fixme: "Skipped",
    };
    return map[r.outcome];
  }

  function outcomeExplain(r: TestResult): string {
    if (r.outcome === "passed")
      return "Everything worked exactly as expected. No action needed.";
    if (r.outcome === "failed")
      return r.failureReason
        ? `Something went wrong: ${esc(r.failureReason)}`
        : "This check did not pass. Manual investigation is recommended.";
    if (r.outcome === "flaky")
      return "This test sometimes passes and sometimes fails without any code change — a sign the feature may be unstable.";
    if (r.outcome === "healed")
      return "A small issue was detected and automatically repaired by the AI. It now passes, but is worth a quick review.";
    if (r.outcome === "fixme")
      return "This check was intentionally paused because it is known to be broken. It should be revisited soon.";
    return "";
  }

  function outcomeRowClass(r: TestResult): string {
    const map: Record<TestResult["outcome"], string> = {
      passed: "row-pass",
      failed: "row-fail",
      flaky: "row-flaky",
      healed: "row-healed",
      fixme: "row-fixme",
    };
    return map[r.outcome];
  }

  /* ── overall verdict ── */
  const verdict =
    successPct >= 90
      ? { label: "Excellent", color: "#16a34a", bg: "#f0fdf4", desc: "Almost everything is working perfectly." }
      : successPct >= 70
        ? { label: "Good", color: "#ca8a04", bg: "#fefce8", desc: "Most things work, but a few areas need attention." }
        : successPct >= 50
          ? { label: "Needs Work", color: "#ea580c", bg: "#fff7ed", desc: "Several checks failed. Review the details below." }
          : { label: "Critical", color: "#dc2626", bg: "#fff1f2", desc: "Many checks failed. Immediate action is recommended." };

  /* ── result rows ── */
  const resultRows = report.results
    .map(
      (r) =>
        `<tr class="${outcomeRowClass(r)}">` +
        `<td class="td-flow"><span class="flow-name">${esc(r.flowId)}</span><span class="flow-file">${esc(r.fileName)}</span></td>` +
        `<td class="td-outcome">${outcomeEmoji(r)} ${outcomeWord(r)}</td>` +
        `<td class="td-detail">${outcomeExplain(r)}</td>` +
        `</tr>`,
    )
    .join("");

  /* ── bucket card helper ── */
  function bucketCard(
    emoji: string,
    title: string,
    subtitle: string,
    items: TestResult[],
    emptyMsg: string,
    itemHtml: (r: TestResult) => string,
    accentColor: string,
  ): string {
    const body = items.length
      ? `<ul class="bucket-list">${items.map((r) => `<li>${itemHtml(r)}</li>`).join("")}</ul>`
      : `<p class="empty-msg">${emptyMsg}</p>`;
    return (
      `<div class="bucket-card" style="border-top:3px solid ${accentColor}">` +
      `<div class="bucket-header">` +
      `<span class="bucket-title">${emoji} ${esc(title)}</span>` +
      `<span class="bucket-count" style="background:${accentColor}20;color:${accentColor}">${items.length}</span>` +
      `</div>` +
      `<p class="bucket-subtitle">${subtitle}</p>` +
      body +
      `</div>`
    );
  }

  /* ── fix prompts ── */
  const fixPromptsHtml = report.fixPrompts.length
    ? report.fixPrompts
        .map(
          (f) =>
            `<div class="fix-card">` +
            `<div class="fix-test">🧪 ${esc(f.test)}</div>` +
            `<div class="fix-row"><strong>What went wrong:</strong> ${esc(f.problem)}</div>` +
            `<div class="fix-row fix-action"><strong>Recommended fix:</strong> ${esc(f.change)}</div>` +
            `</div>`,
        )
        .join("")
    : `<p class="empty-msg">No specific fixes required — great job!</p>`;

  /* ── summary bullets ── */
  const summaryHtml =
    report.summary && report.summary.length
      ? `<ul class="prose-list">${report.summary.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
      : "";

  /* ── issues & recs ── */
  const issuesHtml = report.issues.length
    ? `<ul class="prose-list">${report.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
    : `<p class="empty-msg">No issues detected.</p>`;

  const recsHtml = report.recommendations.length
    ? `<ul class="prose-list">${report.recommendations.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
    : `<p class="empty-msg">No additional recommendations at this time.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Test Report — ${esc(report.url)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
         background:#f8fafc;color:#1e293b;line-height:1.6;font-size:15px}

    /* layout */
    .page{max-width:860px;margin:0 auto;padding:2rem 1.25rem 4rem}

    /* header */
    .report-header{background:#0f172a;color:#f1f5f9;border-radius:14px;
                   padding:1.75rem 2rem;margin-bottom:1.75rem}
    .report-header h1{font-size:1.35rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:.5rem}
    .report-meta{font-size:.78rem;color:#94a3b8;line-height:2}
    .report-meta strong{color:#e2e8f0}

    /* verdict */
    .verdict{display:flex;align-items:center;gap:1.5rem;background:${verdict.bg};
             border:1px solid ${verdict.color}30;border-radius:14px;
             padding:1.5rem 1.75rem;margin-bottom:1.75rem}
    .verdict-score{font-size:3.25rem;font-weight:900;color:${verdict.color};
                   line-height:1;letter-spacing:-0.04em;flex-shrink:0}
    .verdict-right .verdict-label{font-size:.65rem;font-weight:800;
                                   letter-spacing:.1em;text-transform:uppercase;
                                   color:${verdict.color};margin-bottom:.35rem}
    .verdict-right .verdict-count{font-size:1rem;font-weight:700;color:#1e293b}
    .verdict-right .verdict-desc{font-size:.85rem;color:#475569;margin-top:.2rem}

    /* stats strip */
    .stats{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1.75rem}
    .stat{background:white;border:1px solid #e2e8f0;border-radius:10px;
          padding:.55rem .9rem;font-size:.78rem;color:#64748b;min-width:90px;
          box-shadow:0 1px 3px rgba(0,0,0,.04)}
    .stat strong{display:block;font-size:1.05rem;font-weight:800;color:#1e293b}

    /* section heading */
    .section-h{font-size:1rem;font-weight:800;color:#1e293b;
               margin:2rem 0 .4rem;display:flex;align-items:center;gap:.6rem}
    .section-h .tag{font-size:.62rem;font-weight:700;letter-spacing:.06em;
                    text-transform:uppercase;background:#e2e8f0;color:#64748b;
                    border-radius:999px;padding:.15rem .55rem}
    .section-desc{font-size:.83rem;color:#64748b;margin-bottom:.9rem;line-height:1.55}

    /* buckets */
    .buckets{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));
             gap:.9rem;margin-bottom:1.75rem}
    .bucket-card{background:white;border:1px solid #e2e8f0;border-radius:12px;
                 padding:1rem 1.1rem;box-shadow:0 1px 4px rgba(0,0,0,.04)}
    .bucket-header{display:flex;align-items:center;justify-content:space-between;
                   margin-bottom:.3rem}
    .bucket-title{font-weight:800;font-size:.88rem;color:#1e293b}
    .bucket-count{font-size:.7rem;font-weight:700;border-radius:999px;
                  padding:.15rem .55rem}
    .bucket-subtitle{font-size:.75rem;color:#64748b;margin-bottom:.65rem;line-height:1.4}
    .bucket-list{list-style:none;padding:0}
    .bucket-list li{font-size:.8rem;color:#334155;padding:.3rem 0;
                    border-bottom:1px solid #f1f5f9;line-height:1.45}
    .bucket-list li:last-child{border-bottom:none}
    .bucket-list .li-sub{display:block;font-size:.72rem;color:#94a3b8;margin-top:.1rem}
    .empty-msg{font-size:.8rem;color:#94a3b8;font-style:italic;padding:.25rem 0}

    /* results table */
    .results-table{width:100%;border-collapse:collapse;background:white;
                   border-radius:12px;overflow:hidden;font-size:.8rem;
                   box-shadow:0 1px 4px rgba(0,0,0,.05);margin-bottom:1.75rem}
    .results-table thead tr{background:#0f172a}
    .results-table thead th{padding:.7rem 1rem;text-align:left;color:#94a3b8;
                             font-size:.67rem;font-weight:700;letter-spacing:.06em;
                             text-transform:uppercase}
    .results-table tbody tr{border-bottom:1px solid #f1f5f9;transition:background .1s}
    .results-table tbody tr:last-child{border-bottom:none}
    .td-flow{padding:.75rem 1rem;width:28%}
    .td-outcome{padding:.75rem 1rem;width:16%;font-weight:700;white-space:nowrap}
    .td-detail{padding:.75rem 1rem;color:#475569;line-height:1.45}
    .flow-name{display:block;font-weight:700;color:#1e293b;margin-bottom:.15rem}
    .flow-file{display:block;font-size:.68rem;color:#94a3b8;font-family:monospace}
    .row-pass{background:#f0fdf4}
    .row-fail{background:#fff1f2}
    .row-flaky{background:#fffbeb}
    .row-healed{background:#eff6ff}
    .row-fixme{background:#f8fafc}

    /* fix cards */
    .fix-card{background:white;border:1px solid #e2e8f0;border-left:4px solid #f97316;
              border-radius:10px;padding:1rem 1.2rem;margin-bottom:.7rem;
              box-shadow:0 1px 3px rgba(0,0,0,.04)}
    .fix-test{font-weight:800;font-size:.85rem;color:#1e293b;margin-bottom:.4rem}
    .fix-row{font-size:.8rem;color:#475569;margin-bottom:.25rem;line-height:1.45}
    .fix-action{color:#15803d;font-weight:500}

    /* prose lists */
    .prose-list{padding-left:1.2rem}
    .prose-list li{font-size:.83rem;color:#334155;margin-bottom:.4rem;line-height:1.5}

    /* glossary */
    .glossary{background:white;border:1px solid #e2e8f0;border-radius:12px;
              padding:1.4rem 1.5rem;margin-top:2rem}
    .glossary h3{font-size:.72rem;font-weight:800;text-transform:uppercase;
                 letter-spacing:.07em;color:#94a3b8;margin-bottom:.9rem}
    .glossary dl{display:grid;grid-template-columns:max-content 1fr;
                 gap:.4rem 1.1rem;font-size:.79rem}
    .glossary dt{font-weight:700;color:#1e293b;white-space:nowrap}
    .glossary dd{color:#475569;margin:0;line-height:1.45}

    /* footer */
    .report-footer{text-align:center;font-size:.72rem;color:#94a3b8;margin-top:2.5rem}
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="report-header">
    <h1>🤖 Automated UI Test Report</h1>
    <div class="report-meta">
      <strong>App tested:</strong> ${esc(report.url)}<br/>
      <strong>Run ID:</strong> ${esc(report.runId)}<br/>
      <strong>Generated:</strong> ${esc(report.generatedAt)}
    </div>
  </div>

  <!-- Overall Verdict -->
  <div class="verdict">
    <div class="verdict-score">${successPct}%</div>
    <div class="verdict-right">
      <div class="verdict-label">${verdict.label}</div>
      <div class="verdict-count">${report.successRate.passed} out of ${report.successRate.total} checks passed</div>
      <div class="verdict-desc">${verdict.desc}</div>
    </div>
  </div>

  <!-- Quick Stats -->
  <div class="stats">
    <div class="stat"><strong>✅ ${s.passed}</strong>Passed</div>
    <div class="stat"><strong>❌ ${s.failed}</strong>Failed</div>
    <div class="stat"><strong>⚠️ ${s.flaky}</strong>Unreliable</div>
    <div class="stat"><strong>🔧 ${s.healed}</strong>Auto-fixed</div>
    <div class="stat"><strong>⏭️ ${s.fixme}</strong>Skipped</div>
    <div class="stat"><strong>${report.coverage.percent}%</strong>Coverage</div>
    <div class="stat"><strong>${pct(report.flakeRate)}</strong>Flake rate</div>
    <div class="stat"><strong>${pct(report.healSuccessRate)}</strong>Auto-heal rate</div>
  </div>

  ${
    summaryHtml
      ? `<!-- What Was Tested -->
  <div class="section-h">📋 What Was Tested</div>
  <p class="section-desc">Here is a plain-English summary of what our automated checks verified on your app:</p>
  ${summaryHtml}`
      : ""
  }

  <!-- Results Breakdown -->
  <div class="section-h">📊 Results Breakdown</div>
  <p class="section-desc">
    Your tests are grouped into three categories so you can instantly see what is working,
    what needs fixing, and what could be made more reliable.
  </p>
  <div class="buckets">
    ${bucketCard(
      "✅",
      "Working Well",
      "These checks passed — the features are working as intended.",
      b.passed,
      "Every check passed!",
      (r) => `<strong>${esc(r.flowId)}</strong>`,
      "#16a34a",
    )}
    ${bucketCard(
      "❌",
      "Needs Immediate Attention",
      "These checks failed and should be investigated as soon as possible.",
      b.needsAttention,
      "Nothing needs urgent attention right now. 🎉",
      (r) =>
        `<strong>${esc(r.flowId)}</strong>` +
        (r.failureReason
          ? `<span class="li-sub">${esc(r.failureReason)}</span>`
          : ""),
      "#dc2626",
    )}
    ${bucketCard(
      "🔧",
      "Could Be More Reliable",
      "These work, but were fragile, inconsistent, or needed an automatic fix.",
      b.whereToImprove,
      "No reliability improvements needed right now.",
      (r) =>
        `<strong>${esc(r.flowId)}</strong>` +
        `<span class="li-sub">${r.outcome === "flaky" ? "Passes sometimes, fails other times" : "Was broken but automatically repaired"}</span>`,
      "#ea580c",
    )}
  </div>

  <!-- All Test Results -->
  <div class="section-h">🧪 All Test Results <span class="tag">Plain English</span></div>
  <p class="section-desc">
    Each row below represents one automated check. The <em>Result</em> column gives you the outcome at a glance,
    and <em>What This Means</em> explains it in everyday language — no technical knowledge required.
  </p>
  <table class="results-table">
    <thead>
      <tr>
        <th>Check Name &amp; File</th>
        <th>Result</th>
        <th>What This Means</th>
      </tr>
    </thead>
    <tbody>${resultRows}</tbody>
  </table>

  ${
    report.fixPrompts.length
      ? `<!-- Recommended Fixes -->
  <div class="section-h">🛠️ Recommended Fixes</div>
  <p class="section-desc">
    For each failing check, the AI has diagnosed the problem and suggested exactly what should be changed to resolve it.
  </p>
  ${fixPromptsHtml}`
      : ""
  }

  <!-- Issues Found -->
  <div class="section-h">🔍 Issues Found</div>
  <p class="section-desc">Problems spotted in the app or the test suite that are worth investigating.</p>
  ${issuesHtml}

  <!-- Recommendations -->
  <div class="section-h">💡 Recommendations</div>
  <p class="section-desc">Suggestions for how to improve test coverage and overall quality going forward.</p>
  ${recsHtml}

  <!-- Glossary -->
  <div class="glossary">
    <h3>📖 Glossary — What do these terms mean?</h3>
    <dl>
      <dt>✅ Passed</dt>
      <dd>The check ran and everything worked exactly as expected. No action needed.</dd>
      <dt>❌ Failed</dt>
      <dd>The check ran but something did not work correctly. This should be investigated and fixed.</dd>
      <dt>⚠️ Unreliable</dt>
      <dd>The test sometimes passes and sometimes fails with no code changes. Known as a "flaky" test — a sign the feature may be unstable.</dd>
      <dt>🔧 Auto-fixed</dt>
      <dd>The AI spotted a small issue (e.g. a changed button label) and automatically repaired the test so it could pass. Worth a quick review to confirm the fix is correct.</dd>
      <dt>⏭️ Skipped</dt>
      <dd>This check was intentionally paused because it is known to be broken. It should be revisited and fixed soon.</dd>
      <dt>Coverage</dt>
      <dd>The percentage of planned user journeys that were actually tested. Higher is better — aim for 100%.</dd>
      <dt>Flake rate</dt>
      <dd>How often tests gave inconsistent, unreliable results. Lower is better — ideally 0%.</dd>
      <dt>Auto-heal rate</dt>
      <dd>How often the AI successfully repaired a broken check automatically. Higher means less manual fixing needed.</dd>
    </dl>
  </div>

  <div class="report-footer">
    Generated by AI UI Test Suite &nbsp;·&nbsp; ${esc(report.generatedAt)}
  </div>

</div>
</body>
</html>
`;
}
