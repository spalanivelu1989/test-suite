import type { ClaudeClient } from "../claude/client";
import type { CrawlResult, Flow } from "../types";

const SYSTEM = [
  "You are a QA analyst identifying the primary user flows of a website.",
  "A flow is a goal-oriented task a user completes (e.g. browse a section, open",
  "an article, submit the contact form) OR an important navigable path.",
  "Return ONLY a JSON array, no prose. Each item:",
  '{ "id": "kebab-id", "name": "Human name", "steps": ["step 1", "step 2"] }',
].join(" ");

/** Compact crawl summary for the prompt — keeps token use bounded. */
export function buildFlowPrompt(crawl: CrawlResult): string {
  const lines = crawl.pages.slice(0, 40).map((p) => {
    const els = p.elements
      .slice(0, 12)
      .map((e) => `${e.role}:${e.label || e.selector}`)
      .join(", ");
    return `- ${p.url} (title: ${p.title})\n  elements: ${els}`;
  });
  return [
    `Entry URL: ${crawl.entryUrl}`,
    `Pages discovered: ${crawl.pages.length}`,
    "",
    "Pages and interactive elements:",
    ...lines,
    "",
    "Identify the primary user flows worth testing. Return the JSON array only.",
  ].join("\n");
}

/** Extract a JSON array from a model response that may include code fences/prose. */
export function parseFlows(text: string): Flow[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON array found in flow-identification response");
  }
  const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(raw)) throw new Error("Flow response is not an array");

  return raw.map((item, i): Flow => {
    const o = (item ?? {}) as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : `Flow ${i + 1}`;
    const id =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim()
        : name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    const steps = Array.isArray(o.steps)
      ? o.steps.filter((s): s is string => typeof s === "string")
      : [];
    return { id: id || `flow-${i + 1}`, name, steps };
  });
}

export async function identifyFlows(
  crawl: CrawlResult,
  claude: ClaudeClient,
): Promise<Flow[]> {
  const text = await claude.complete({
    purpose: "identify-flows",
    system: SYSTEM,
    prompt: buildFlowPrompt(crawl),
  });
  return parseFlows(text);
}
