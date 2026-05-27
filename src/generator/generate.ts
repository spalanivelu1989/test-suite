import type { ClaudeClient } from "../claude/client";
import type { CrawlResult, Flow, GeneratedTest } from "../types";

const SYSTEM = [
  "You generate a single Playwright test file (TypeScript) for one user flow.",
  "Rules:",
  "- Import { test, expect } from '@playwright/test'.",
  "- Exactly one test() covering the flow's steps.",
  "- Use resilient locators (getByRole/getByText/getByPlaceholder) where possible.",
  "- Navigate using the provided base URL.",
  "- Output ONLY the TypeScript code, no markdown fences, no prose.",
].join("\n");

export function buildGeneratePrompt(flow: Flow, crawl: CrawlResult): string {
  const elementHints = crawl.pages
    .slice(0, 10)
    .flatMap((p) => p.elements.slice(0, 8).map((e) => `${e.role}: ${e.label}`))
    .slice(0, 40);
  return [
    `Base URL: ${crawl.entryUrl}`,
    `Flow: ${flow.name}`,
    `Steps:`,
    ...flow.steps.map((s, i) => `  ${i + 1}. ${s}`),
    "",
    "Element hints from the crawl:",
    ...elementHints.map((h) => `  - ${h}`),
    "",
    "Write the Playwright test file now.",
  ].join("\n");
}

/** Remove ```ts fences if the model added them despite instructions. */
export function stripCodeFences(text: string): string {
  const fence = text.match(
    /```(?:ts|typescript|js|javascript)?\s*([\s\S]*?)```/,
  );
  return (fence ? fence[1] : text).trim();
}

export function fileNameForFlow(flow: Flow): string {
  const safe = flow.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "flow";
  return `${safe}.spec.ts`;
}

/** T7a: ask Claude for a Playwright test for one flow. Validation is T7b. */
export async function generateTest(
  flow: Flow,
  crawl: CrawlResult,
  claude: ClaudeClient,
  extraInstruction?: string,
): Promise<GeneratedTest> {
  const prompt = extraInstruction
    ? `${buildGeneratePrompt(flow, crawl)}\n\n${extraInstruction}`
    : buildGeneratePrompt(flow, crawl);
  const text = await claude.complete({
    purpose: "generate-test",
    system: SYSTEM,
    prompt,
  });
  return {
    flowId: flow.id,
    fileName: fileNameForFlow(flow),
    code: stripCodeFences(text),
    valid: false,
  };
}
