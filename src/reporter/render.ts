import type { RunReport, TestResult } from "../types";
import { summarize } from "./report";
import { bucketResults } from "./successRate";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OUTCOME_LABEL: Record<TestResult["outcome"], string> = {
  passed: "PASS",
  failed: "FAIL",
  flaky: "FLAKY",
  healed: "PASS",
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
  if (report.better) {
    L.push("", `## What could be better`, "", report.better);
  }
  if (report.recommendationsText) {
    L.push("", `## Recommendations`, "", report.recommendationsText);
  }
  if (report.recommendations.length) {
    L.push(
      "",
      `## Coverage Recommendations`,
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
  const successPct = ratePct(report);
  const passingCount = report.successRate.passed;
  const passedCount = report.results.filter((r) => r.outcome === "passed" || r.outcome === "healed").length;
  const totalCount = report.successRate.total;

  const passedTestNames = report.results
    .filter((r) => r.outcome === "passed" || r.outcome === "healed")
    .map((r) => r.flowId);
  const failedTestNames = report.results
    .filter((r) => r.outcome === "failed")
    .map((r) => r.flowId);
  const flakyTestNames = report.results
    .filter((r) => r.outcome === "flaky")
    .map((r) => r.flowId);

  // Verdict config
  const verdict =
    successPct >= 90
      ? {
          label: "Excellent",
          cls: "",
          desc: "Almost everything is working perfectly — no failures or reliability issues were found.",
        }
      : successPct >= 70
        ? {
            label: "Good",
            cls: "is-caution",
            desc: "Most checks passed, but a few areas need attention.",
          }
        : successPct >= 50
          ? {
              label: "Needs Work",
              cls: "is-caution",
              desc: "Several checks failed. We recommend investigating these issues.",
            }
          : {
              label: "Critical",
              cls: "is-alert",
              desc: "Many checks failed. Immediate action is recommended.",
            };

  const passedBuckets = report.results.filter((r) => r.outcome === "passed" || r.outcome === "healed");
  const needsAttentionBuckets = report.results.filter(
    (r) => r.outcome === "failed" || r.outcome === "fixme",
  );
  const whereToImproveBuckets = report.results.filter(
    (r) => r.outcome === "flaky",
  );

  // Read CSS styles from file
  let cssContent = "";
  try {
    cssContent = readFileSync(
      join(process.cwd(), "app/components/TestReportView.css"),
      "utf8",
    );
    // Remove :global(.dark) to make it pure CSS, since we are in raw HTML/CSS
    cssContent = cssContent.replace(/:global\(\.dark\)/g, ".dark");
  } catch (e) {
    console.error("Failed to read TestReportView.css:", e);
  }

  // Render Findings Summary Banner
  let summaryBannerHtml = "";
  if (needsAttentionBuckets.length > 0) {
    summaryBannerHtml = `
      <div class="summary-banner banner-fail">
        <div class="banner-icon">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <div class="banner-content">
          <h3>Action Required: ${needsAttentionBuckets.length} Failed Checks</h3>
          <p>Critical issues were detected in core user flows. We recommend investigating these failures first:</p>
          <ul class="banner-list">
            ${needsAttentionBuckets
              .slice(0, 5)
              .map(
                (r) => `
              <li>
                <button type="button" class="link-btn" data-test-name="${esc(r.flowId)}">${esc(r.flowId)}</button>
              </li>
            `,
              )
              .join("")}
            ${needsAttentionBuckets.length > 5 ? `<li style="font-weight: 600; color: var(--text-3); font-size: var(--fs-xs)">and ${needsAttentionBuckets.length - 5} more failure(s)...</li>` : ""}
          </ul>
        </div>
      </div>
    `;
  } else if (whereToImproveBuckets.length > 0) {
    summaryBannerHtml = `
      <div class="summary-banner banner-warn">
        <div class="banner-icon">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div class="banner-content">
          <h3>Reliability Note: ${whereToImproveBuckets.length} Inconsistent Run(s)</h3>
          <p>Some checks passed but required retries. These flows are working but should be audited for stability:</p>
          <ul class="banner-list">
            ${whereToImproveBuckets
              .map(
                (r) => `
              <li>
                <button type="button" class="link-btn" data-test-name="${esc(r.flowId)}">${esc(r.flowId)} (Flaky)</button>
              </li>
            `,
              )
              .join("")}
          </ul>
        </div>
      </div>
    `;
  } else {
    summaryBannerHtml = `
      <div class="summary-banner banner-pass">
        <div class="banner-icon">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div class="banner-content">
          <h3>All Systems Operational</h3>
          <p>All automated checks completed successfully. No failures or reliability concerns were reported for this run. Your key user journeys are stable.</p>
        </div>
      </div>
    `;
  }

  // Popovers
  const passedPopoverHtml =
    passedTestNames.length > 0
      ? `
      <div class="stat-popover" id="popover-passed" style="display: none;">
        <div class="stat-popover-title">Passed Tests (${passedTestNames.length})</div>
        <ul class="stat-popover-list">
          ${passedTestNames.map((name) => `<li title="${esc(name)}">${esc(name)}</li>`).join("")}
        </ul>
      </div>
    `
      : "";

  const failedPopoverHtml =
    failedTestNames.length > 0
      ? `
      <div class="stat-popover" id="popover-failed" style="display: none;">
        <div class="stat-popover-title">Failed Tests (${failedTestNames.length})</div>
        <ul class="stat-popover-list">
          ${failedTestNames.map((name) => `<li title="${esc(name)}">${esc(name)}</li>`).join("")}
        </ul>
      </div>
    `
      : "";

  const unreliablePopoverHtml =
    flakyTestNames.length > 0
      ? `
      <div class="stat-popover" id="popover-unreliable" style="display: none;">
        <div class="stat-popover-title">Unreliable Tests (${flakyTestNames.length})</div>
        <ul class="stat-popover-list">
          ${flakyTestNames.map((name) => `<li title="${esc(name)}">${esc(name)}</li>`).join("")}
        </ul>
      </div>
    `
      : "";



  // Results Breakdown Buckets
  const passedBucketsHtml =
    passedBuckets.length > 0
      ? `<ul class="bucket-list">${passedBuckets.map((r) => `<li>${esc(r.flowId)}</li>`).join("")}</ul>`
      : `<div class="empty">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        No checks completed successfully.
       </div>`;

  const needsAttentionBucketsHtml =
    needsAttentionBuckets.length > 0
      ? `<ul class="bucket-list">${needsAttentionBuckets
          .map(
            (r) => `
        <li>
          <span style="font-weight: 600;">${esc(r.flowId)}</span>
          ${r.failureReason ? `<span style="display: block; color: var(--text-3); font-size: 11px; margin-top: 2px;">${esc(r.failureReason)}</span>` : ""}
        </li>
      `,
          )
          .join("")}</ul>`
      : `<div class="empty">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        Nothing needs urgent attention.
       </div>`;

  const whereToImproveBucketsHtml =
    whereToImproveBuckets.length > 0
      ? `<ul class="bucket-list">${whereToImproveBuckets
          .map(
            (r) => `
        <li>
          <span style="font-weight: 600;">${esc(r.flowId)}</span>
          <span style="display: block; color: var(--text-3); font-size: 11px; margin-top: 2px;">
            Passed on retry (Flaky)
          </span>
        </li>
      `,
          )
          .join("")}</ul>`
      : `<div class="empty">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        No reliability improvements needed.
       </div>`;

  // Detailed Results table rows
  function getOutcomeExplanation(r: TestResult) {
    if (r.outcome === "passed")
      return "Everything worked exactly as expected. No action needed.";
    if (r.outcome === "failed") {
      return r.failureReason
        ? `Something went wrong: ${esc(r.failureReason)}`
        : "This check did not pass. Manual investigation is recommended.";
    }
    if (r.outcome === "flaky") {
      return "This test sometimes passes and sometimes fails without any code change — a sign the feature may be unstable.";
    }
    if (r.outcome === "healed") {
      return "A small issue was detected and automatically repaired by the AI. It now passes, but is worth a quick review.";
    }
    if (r.outcome === "fixme") {
      return "This check was intentionally paused because it is known to be broken. It should be revisited soon.";
    }
    return "";
  }

  const OUTCOME_WORD: Record<TestResult["outcome"], string> = {
    passed: "Passed",
    failed: "Failed",
    flaky: "Unreliable",
    healed: "Passed",
    fixme: "Skipped",
  };

  const OUTCOME_ICON: Record<TestResult["outcome"], string> = {
    passed: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>`,
    failed: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>`,
    flaky: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>`,
    healed: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>`,
    fixme: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>`,
  };

  const resultsTableRows = report.results
    .map(
      (r) => `
    <tr class="r-${r.outcome === "fixme" ? "skip" : (r.outcome === "healed" ? "pass" : r.outcome)}" data-outcome="${r.outcome}" data-search-text="${esc(r.flowId)} ${esc(r.fileName)}">
      <td data-label="Check">
        <span class="flow-name">${esc(r.flowId)}</span>
        <span class="flow-file">${esc(r.fileName)}</span>
      </td>
      <td data-label="Result">
        <span class="pill pill-${r.outcome === "fixme" ? "skip" : (r.outcome === "healed" ? "pass" : r.outcome)}">
          ${OUTCOME_ICON[r.outcome]} ${OUTCOME_WORD[r.outcome]}
        </span>
      </td>
      <td class="td-detail" data-label="What This Means">
        ${getOutcomeExplanation(r)}
      </td>
    </tr>
  `,
    )
    .join("");

  const observationsHtml = "";
  /* Hide Suite Observations for now
  const observationsHtml =
    report.issues.length > 0
      ? `
      <div style="margin-top: var(--sp-6);">
        <h2 class="section-h">
          <span class="badge">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          Suite Observations
        </h2>
        <p class="section-desc">Issues spotted in the test suite setup that are worth addressing.</p>
        <ul class="prose prose-warn">
          ${report.issues
            .map(
              (issue) => `
            <li>
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>${esc(issue)}</span>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>
    `
      : "";
  */

  const recommendationsHtml =
    report.recommendations.length > 0
      ? `
      <div style="margin-top: var(--sp-6);">
        <h2 class="section-h">
          <span class="badge">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18h6M10 21h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
            </svg>
          </span>
          Coverage Recommendations
        </h2>
        <p class="section-desc">Suggestions for how to improve test coverage and overall quality going forward.</p>
        <ul class="prose">
          ${report.recommendations
            .map(
              (rec) => `
            <li>
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18h6M10 21h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
              </svg>
              <span>${esc(rec)}</span>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>
    `
      : "";

  const sideBySideHtml =
    (report.better || report.recommendationsText)
      ? `
      <div class="side-by-side-grid">
        <div class="better-section">
          <h2 class="section-h">
            <span class="badge" style="background-color: var(--warn-bg); color: var(--warn);">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            What could be better
          </h2>
          <div class="prose-card">
            ${esc(report.better || "No major frontend gaps or testability limitations identified.")}
          </div>
        </div>
        <div class="recommendations-section">
          <h2 class="section-h">
            <span class="badge" style="background-color: var(--heal-bg); color: var(--heal);">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                <path d="M9 18h6" />
                <path d="M10 22h4" />
              </svg>
            </span>
            Recommendations
          </h2>
          <div class="prose-card">
            ${esc(report.recommendationsText || "No actionable recommendations needed at this time.")}
          </div>
        </div>
      </div>
    `
      : "";

  const journeysHtml =
    report.summary && report.summary.length > 0
      ? `
      <ul class="prose">
        ${report.summary
          .map(
            (item) => `
          <li>
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>${esc(item)}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    `
      : `<p class="empty-msg">No plain-English summary is available for this run.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Test Report — ${esc(report.url)}</title>
  <script>
    (function() {
      const saved = localStorage.getItem('report-theme');
      const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    })();
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap" rel="stylesheet">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    
    ${cssContent}

    /* Downloaded-report overrides (standalone only). In the fixed-height (100vh)
       layout the sidebar footer was pinned to the very bottom via margin-top:auto
       and its last line (the "Generated" timestamp) was clipped below the fold.
       Let the meta flow directly under the nav so it is always visible, and let
       the sidebar scroll if a run ever has an unusually tall sidebar. */
    #report-root .sidebar { overflow-y: auto; padding-bottom: 20px; }
    #report-root .sidebar-footer { margin-top: 28px; }
    #report-root .sidebar-meta .v { word-break: normal; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <div class="test-report-container" id="report-root" style="height: 100vh;">
    <script>
      // Dark styles are scoped to .test-report-container.dark, so mirror the
      // <html> dark state onto the container synchronously (no flash) before
      // its children paint.
      document
        .getElementById("report-root")
        .classList.toggle("dark", document.documentElement.classList.contains("dark"));
    </script>
    <div class="page">
      
      <!-- Left Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2);">
            <h1 style="margin: 0;">Test results for ${esc(report.url.replace(/https?:\/\//, ""))}</h1>
            <button type="button" id="theme-toggle" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme">
              <svg class="icon sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
              <svg class="icon moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            </button>
          </div>
        </div>


        <nav class="nav-tabs" aria-label="Report navigation">
          <button type="button" class="tab-btn active" data-tab="dashboard">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="20" x2="4" y2="11" /><line x1="10" y1="20" x2="10" y2="4" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="20" y1="20" x2="2" y2="20" />
            </svg>
            Dashboard Overview
          </button>
          <button type="button" class="tab-btn" data-tab="journeys">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
            </svg>
            What Was Tested
          </button>
          <button type="button" class="tab-btn" data-tab="results">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" />
            </svg>
            Detailed Results
          </button>

        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-meta">
            <div>
              <span class="k">App tested</span>
              <span class="v">${esc(report.url)}</span>
            </div>
            <div>
              <span class="k">Run ID</span>
              <span class="v mono">${esc(report.runId)}</span>
            </div>
            <div>
              <span class="k">Generated</span>
              <span class="v">${esc(new Date(report.generatedAt).toLocaleString())}</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content Area -->
      <main class="report-content">

        <!-- TAB 1: DASHBOARD OVERVIEW -->
        <div id="panel-dashboard" class="tab-panel active">
          
          <!-- Conic progress verdict banner -->
          <section class="verdict ${verdict.cls}" aria-labelledby="verdict-label">
            <div class="verdict-score" style="--percentage: ${successPct}">
              ${successPct}%
            </div>
            <div class="verdict-body">
              <span class="verdict-badge" id="verdict-label">
                ${
                  successPct >= 50
                    ? `
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                `
                    : `
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                `
                }
                ${verdict.label}
              </span>
              <div class="verdict-count">
                <b>${passingCount}</b> of <b>${totalCount}</b> checks passed
              </div>
              <p class="verdict-desc">${verdict.desc}</p>
            </div>
          </section>

          <!-- Quick Stats Grid -->
          <section class="stats" aria-label="Quick statistics">
            <div class="stat stat-passed" id="stat-card-passed" style="position: relative; cursor: pointer;">
              <div class="stat-top">
                <span style="color: var(--pass)">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
                <span class="stat-num">${passedCount}</span>
              </div>
              <div class="stat-label">Passed</div>
              ${passedPopoverHtml}
            </div>

            <div class="stat stat-failed" id="stat-card-failed" style="position: relative; cursor: pointer;">
              <div class="stat-top">
                <span style="color: var(--fail)">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </span>
                <span class="stat-num">${report.results.filter((r) => r.outcome === "failed").length}</span>
              </div>
              <div class="stat-label">Failed</div>
              ${failedPopoverHtml}
            </div>

            <div class="stat stat-unreliable" id="stat-card-unreliable" style="position: relative; cursor: pointer;">
              <div class="stat-top">
                <span style="color: var(--warn)">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </span>
                <span class="stat-num">${report.results.filter((r) => r.outcome === "flaky").length}</span>
              </div>
              <div class="stat-label">Unreliable</div>
              ${unreliablePopoverHtml}
            </div>
          </section>

          <!-- Findings Summary Card -->
          <div class="summary-card">
            ${summaryBannerHtml}
          </div>

          ${
            report.testSummary && report.testSummary.trim().length > 0
              ? `
          <!-- AI-generated Test Summary -->
          <div class="test-summary-block">
            <h2 class="section-h">
              <span class="badge">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </span>
              Test Summary
            </h2>
            <p class="test-summary">${esc(report.testSummary)}</p>
          </div>
          `
              : ""
          }

          <!-- Results Breakdown buckets -->
          <h2 class="section-h">
            <span class="badge">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="20" x2="4" y2="11" /><line x1="10" y1="20" x2="10" y2="4" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="20" y1="20" x2="2" y2="20" />
              </svg>
            </span>
            Results Breakdown
          </h2>
          <p class="section-desc">
            Results are grouped into three categories so you can instantly see what is working, what needs fixing, and what could be made more reliable.
          </p>

          <div class="buckets">
            <div class="bucket b-pass">
              <div class="bucket-header">
                <span class="bucket-title">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--pass)"><polyline points="20 6 9 17 4 12" /></svg>
                  Working Well
                </span>
                <span class="bucket-count">${passedBuckets.length}</span>
              </div>
              <p class="bucket-sub">These checks passed — the features are working as intended.</p>
              ${passedBucketsHtml}
            </div>

            <div class="bucket b-fail">
              <div class="bucket-header">
                <span class="bucket-title">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--fail)"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  Needs Attention
                </span>
                <span class="bucket-count">${needsAttentionBuckets.length}</span>
              </div>
              <p class="bucket-sub">These checks failed and should be investigated as soon as possible.</p>
              ${needsAttentionBucketsHtml}
            </div>

            <div class="bucket b-warn">
              <div class="bucket-header">
                <span class="bucket-title">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--warn)"><path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>
                  Could Be Reliable
                </span>
                <span class="bucket-count">${whereToImproveBuckets.length}</span>
              </div>
              <p class="bucket-sub">These work, but were fragile, inconsistent, or needed an automatic fix.</p>
              ${whereToImproveBucketsHtml}
            </div>
          </div>

          ${observationsHtml}
          ${sideBySideHtml}
          ${recommendationsHtml}
        </div>

        <!-- TAB 2: WHAT WAS TESTED -->
        <div id="panel-journeys" class="tab-panel">
          <h2 class="section-h">
            <span class="badge">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
              </svg>
            </span>
            What Was Tested
          </h2>
          <p class="section-desc">A plain-English summary of what our automated checks verified on your app:</p>
          ${journeysHtml}
        </div>

        <!-- TAB 3: DETAILED RESULTS -->
        <div id="panel-results" class="tab-panel">
          <h2 class="section-h">
            <span class="badge">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" />
              </svg>
            </span>
            Detailed Results <span class="tag">Interactive</span>
          </h2>
          <p class="section-desc">
            Each row is one automated check. Search or filter to find specific results instantly.
          </p>

          <!-- Table Controls -->
          <div class="table-controls">
            <div class="search-wrapper">
              <span class="search-icon">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input type="text" id="search-input" placeholder="Search checks or files..." aria-label="Search test cases" />
            </div>
            <div class="filter-group" role="group" aria-label="Filter test cases by outcome">
              <button type="button" class="filter-btn active" data-filter="all">All (${report.results.length})</button>
              <button type="button" class="filter-btn" data-filter="pass">Passed (${passedCount})</button>
              <button type="button" class="filter-btn" data-filter="fail">Failed (${report.results.filter((r) => r.outcome === "failed").length})</button>
              <button type="button" class="filter-btn" data-filter="flaky">Unreliable (${report.results.filter((r) => r.outcome === "flaky").length})</button>
            </div>
          </div>

          <!-- Table -->
          <table class="results">
            <thead>
              <tr>
                <th scope="col" style="width: 40%;">Check &amp; File</th>
                <th scope="col" style="width: 20%;">Result</th>
                <th scope="col" style="width: 40%;">What This Means</th>
              </tr>
            </thead>
            <tbody>
              ${resultsTableRows}
            </tbody>
          </table>

          <!-- Recommended Fixes -->
          ${
            report.fixPrompts && report.fixPrompts.length > 0
              ? `
            <div style="margin-top: var(--sp-6);">
              <h2 class="section-h">
                <span class="badge">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>
                </span>
                Recommended Fixes
              </h2>
              <p class="section-desc">
                For each failing check, the AI has diagnosed the problem and suggested exactly what should be changed to resolve it.
              </p>
              ${report.fixPrompts
                .map(
                  (fix) => `
                <div class="fix-card">
                  <div class="fix-test">🧪 ${esc(fix.test)}</div>
                  <div class="fix-row"><strong>What went wrong:</strong> ${esc(fix.problem)}</div>
                  <div class="fix-row fix-action"><strong>Recommended fix:</strong> ${esc(fix.change)}</div>
                </div>
              `,
                )
                .join("")}
            </div>
          `
              : ""
          }
        </div>




        <footer class="report-footer">
          Generated by AI &nbsp;·&nbsp; ${esc(new Date(report.generatedAt).toUTCString())}
        </footer>

      </main>

    </div>
  </div>

  <script>
    let currentFilter = 'all';

    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    function switchTab(tabId) {
      tabButtons.forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      tabPanels.forEach(panel => {
        if (panel.id === 'panel-' + tabId) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    }

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    // Hover popover logic
    const passedCard = document.getElementById('stat-card-passed');
    const failedCard = document.getElementById('stat-card-failed');
    const popoverPassed = document.getElementById('popover-passed');
    const popoverFailed = document.getElementById('popover-failed');

    if (passedCard && popoverPassed) {
      passedCard.addEventListener('mouseenter', () => popoverPassed.style.display = 'block');
      passedCard.addEventListener('mouseleave', () => popoverPassed.style.display = 'none');
      passedCard.addEventListener('click', () => {
        currentFilter = 'pass';
        updateFilterButtons();
        switchTab('results');
        filterTable();
      });
    }

    if (failedCard && popoverFailed) {
      failedCard.addEventListener('mouseenter', () => popoverFailed.style.display = 'block');
      failedCard.addEventListener('mouseleave', () => popoverFailed.style.display = 'none');
      failedCard.addEventListener('click', () => {
        currentFilter = 'fail';
        updateFilterButtons();
        switchTab('results');
        filterTable();
      });
    }

    const unreliableCard = document.getElementById('stat-card-unreliable');
    const popoverUnreliable = document.getElementById('popover-unreliable');

    if (unreliableCard && popoverUnreliable) {
      unreliableCard.addEventListener('mouseenter', () => popoverUnreliable.style.display = 'block');
      unreliableCard.addEventListener('mouseleave', () => popoverUnreliable.style.display = 'none');
      unreliableCard.addEventListener('click', () => {
        currentFilter = 'flaky';
        updateFilterButtons();
        switchTab('results');
        filterTable();
      });
    }



    // Warning card links in Dashboard Overview
    document.querySelectorAll('.link-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const testName = btn.getAttribute('data-test-name');
        if (testName) {
          document.getElementById('search-input').value = testName;
          currentFilter = 'all';
          updateFilterButtons();
          switchTab('results');
          filterTable();
        }
      });
    });

    // Table search & filter logic
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        filterTable();
      });
    }

    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.getAttribute('data-filter');
        updateFilterButtons();
        filterTable();
      });
    });

    function updateFilterButtons() {
      filterButtons.forEach(btn => {
        if (btn.getAttribute('data-filter') === currentFilter) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    function filterTable() {
      const query = (document.getElementById('search-input')?.value || '').toLowerCase();
      const filter = currentFilter;
      const rows = document.querySelectorAll('table.results tbody tr');
      let visibleCount = 0;

      rows.forEach(row => {
        const outcome = row.getAttribute('data-outcome');
        const searchText = (row.getAttribute('data-search-text') || '').toLowerCase();

        let matchesFilter = false;
        if (filter === 'all') matchesFilter = true;
        else if (filter === 'pass' && (outcome === 'passed' || outcome === 'healed')) matchesFilter = true;
        else if (filter === 'fail' && outcome === 'failed') matchesFilter = true;
        else if (filter === 'skip' && outcome === 'fixme') matchesFilter = true;
        else if (filter === 'flaky' && outcome === 'flaky') matchesFilter = true;

        const matchesSearch = searchText.includes(query);

        if (matchesFilter && matchesSearch) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      });

      const emptyState = document.getElementById('empty-table-state');
      if (emptyState) {
        if (visibleCount === 0) {
          emptyState.style.display = 'block';
        } else {
          emptyState.style.display = 'none';
        }
      }
    }

    // Theme toggle button logic
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        // Dark styles live on .test-report-container.dark, so keep it in sync.
        const root = document.getElementById('report-root');
        if (root) root.classList.toggle('dark', isDark);
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        localStorage.setItem('report-theme', isDark ? 'dark' : 'light');
      });
    }
  </script>
</body>
</html>
`;
}
