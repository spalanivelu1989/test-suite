// Renders selected concept docs into the budgeted text blocks that get appended to
// the agent prompts. Pure string assembly. Two shapes:
//   • overview  → the Discoverer's "map" (what the app is, which workflows exist)
//   • context   → the Generator's rules (the intended behaviour to assert against)
// Both are wrapped in a <business-context> tag and capped so they can never bloat a
// prompt (same discipline as the Discoverer's existing prior-plan budget).

import type { ConceptDoc } from "./concept";

/** ~1.5k tokens: app purpose + workflow/screen map. */
export const OVERVIEW_BUDGET_CHARS = 6_000;
/** ~3k tokens: the relevant rules/screens, bodies included. */
export const CONTEXT_BUDGET_CHARS = 12_000;

function clip(s: string, budget: number): string {
  return s.length > budget ? s.slice(0, budget - 1).trimEnd() + "…" : s;
}

function bullet(d: ConceptDoc): string {
  return d.description ? `- ${d.title} — ${d.description}` : `- ${d.title}`;
}

/** The Discoverer's overview block: app identity + the workflow/screen map. */
export function formatOverview(input: {
  app: ConceptDoc | null;
  workflows: ConceptDoc[];
  screens: ConceptDoc[];
  platformTitles: string[];
}): string {
  const { app, workflows, screens, platformTitles } = input;
  const lines = ["<business-context>"];
  lines.push(
    "AUTHORED DOMAIN KNOWLEDGE for this app — use it to plan the REAL business",
    "workflows, not just whatever links you happen to see. Trust it as reference;",
    "if the live app diverges from it, that divergence is a finding to report.",
    "",
  );
  if (app) {
    lines.push(
      `APP: ${app.title}${app.description ? ` — ${app.description}` : ""}`,
    );
  }
  if (platformTitles.length)
    lines.push(`Built on: ${platformTitles.join(", ")}.`);
  if (workflows.length) {
    lines.push("", "Business workflows to cover (crawl toward these):");
    lines.push(...workflows.map(bullet));
  }
  if (screens.length) {
    lines.push("", "Key screens:");
    lines.push(...screens.map(bullet));
  }
  lines.push("</business-context>");
  return clip(lines.join("\n"), OVERVIEW_BUDGET_CHARS);
}

/** The Generator's context block: the selected concepts' bodies, rules first. */
export function formatContext(selected: ConceptDoc[]): string {
  // Rules carry the assertable logic — render them first and in full.
  const ordered = [...selected].sort((a, b) => {
    const ra = a.type === "Business Rule" ? 0 : 1;
    const rb = b.type === "Business Rule" ? 0 : 1;
    return ra - rb;
  });

  const header = [
    "<business-context>",
    "INTENDED BEHAVIOUR — write assertions that verify these rules. A live app that",
    "diverges from a rule below is a DEFECT to report, not a test to soften.",
    "",
  ].join("\n");

  let out = header;
  let omitted = 0;
  for (const d of ordered) {
    const section = `### ${d.title} (${d.type})\n${d.body || d.description}\n\n`;
    if (out.length + section.length > CONTEXT_BUDGET_CHARS) {
      omitted++;
      continue;
    }
    out += section;
  }
  if (omitted > 0)
    out += `(${omitted} further concept(s) omitted for length.)\n`;
  out += "</business-context>";
  return out;
}
