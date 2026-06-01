import type {
  HookCallback,
  HookJSONOutput,
  Options,
  PostToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import {
  type CrawlMode,
  CRAWL_MODE_DEPTH,
  effectivePageBudget,
} from "../types";

// Code-enforced crawl scope (R2). The planner agent drives the browser by
// shelling out to `npx playwright-cli` over the Bash tool, so the only place we
// can *enforce* (not merely request) the user's depth/page limits is at the tool
// boundary. This module builds a stateful gate wired as a PreToolUse hook: it
// parses each playwright-cli command and DENIES any navigation that leaves the
// allowed scope. A companion PostToolUse hook reads the CLI's "Page URL:" output
// to track the live page/depth (so click-driven navigation, whose destination
// isn't known pre-call, is caught the moment it lands).
//
// Guarantees:
//  - Off-site navigation is always denied (every mode stays on the entry site).
//  - `direct` mode denies any navigation away from the entry URL.
//  - `goto`/`open` to an explicit URL is denied pre-call if it would exceed the
//    mode's depth limit or the page budget.
//  - A `click` (or redirect) that lands out of scope flips the gate to blocked;
//    all further navigation is then denied until the agent writes its plan.

const NAV_VERBS = new Set(["open", "goto", "navigate"]);

export interface CrawlGateConfig {
  mode: CrawlMode;
  maxPages: number;
  entryUrl: string;
  /** Surfaced to the run log each time the gate blocks a command. */
  onDeny?: (reason: string) => void;
}

/** A single playwright-cli invocation parsed out of a Bash command. */
export interface ParsedCli {
  verb: string;
  urlArg?: string;
}

/**
 * Canonicalize a URL for comparison: lowercased host, no hash, no trailing
 * slash (except root). Query string is kept — `?page=2` is a different page.
 * Returns null for anything that isn't a parseable absolute URL.
 */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    const host = u.host.toLowerCase();
    return `${u.protocol}//${host}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

function originOf(normalized: string): string {
  try {
    const u = new URL(normalized);
    return `${u.protocol}//${u.host.toLowerCase()}`;
  } catch {
    return "";
  }
}

/**
 * Parse one shell segment for a `playwright-cli` call. Tolerates `npx [-y]`
 * prefixes, an `-s=session` flag before the verb, and quoted URL args. Returns
 * the verb and (for navigation verbs) the first absolute-URL argument.
 */
export function parsePlaywrightCli(segment: string): ParsedCli | null {
  const idx = segment.search(/\bplaywright-cli\b/);
  if (idx === -1) return null;
  const tokens = segment
    .slice(idx + "playwright-cli".length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let verb: string | undefined;
  const args: string[] = [];
  for (const t of tokens) {
    if (!verb) {
      if (t.startsWith("-")) continue; // skip flags that precede the verb
      verb = t;
      continue;
    }
    args.push(t);
  }
  if (!verb) return null;

  let urlArg: string | undefined;
  for (const a of args) {
    if (a.startsWith("-")) continue;
    const cleaned = a.replace(/^['"]|['"]$/g, "");
    if (/^https?:\/\//i.test(cleaned)) {
      urlArg = cleaned;
      break;
    }
  }
  return { verb, urlArg };
}

/** Parse every playwright-cli call in a (possibly chained) Bash command. */
export function parseAllCli(command: string): ParsedCli[] {
  return command
    .split(/&&|\|\||;|\n/)
    .map((s) => parsePlaywrightCli(s))
    .filter((p): p is ParsedCli => p !== null);
}

/** Extract the "Page URL: <url>" the playwright-cli prints after each command. */
export function parsePageUrl(output: string): string | null {
  const m = output.match(/Page URL:\s*(\S+)/i);
  return m ? m[1] : null;
}

function responseText(resp: unknown): string {
  if (typeof resp === "string") return resp;
  if (resp && typeof resp === "object") {
    const o = resp as Record<string, unknown>;
    if (typeof o.stdout === "string") return o.stdout;
    if (typeof o.output === "string") return o.output;
    if (Array.isArray(o.content)) {
      return o.content
        .map((c) =>
          c &&
          typeof c === "object" &&
          typeof (c as { text?: unknown }).text === "string"
            ? (c as { text: string }).text
            : "",
        )
        .join("\n");
    }
    try {
      return JSON.stringify(resp);
    } catch {
      return "";
    }
  }
  return "";
}

export interface CrawlGate {
  /** Drop straight into the SDK `query({ options: { hooks } })`. */
  hooks: Options["hooks"];
  /** Inspectable state, for logging and tests. */
  stats: () => {
    visited: string[];
    denials: number;
    blocked: boolean;
    current: string | null;
  };
}

/**
 * Build a crawl gate for one planner run. The returned `hooks` enforce the
 * configured crawl scope at the tool boundary.
 */
export function createCrawlGate(cfg: CrawlGateConfig): CrawlGate {
  const entry = normalizeUrl(cfg.entryUrl);
  const entryOrigin = entry ? originOf(entry) : "";
  const depthLimit = CRAWL_MODE_DEPTH[cfg.mode];
  const pageBudget = effectivePageBudget(cfg.mode, cfg.maxPages);

  const visited = new Set<string>();
  const depthOf = new Map<string, number>();
  let current: string | null = null;
  let blocked = false;
  let denials = 0;

  const depthFor = (target: string): number => {
    if (depthOf.has(target)) return depthOf.get(target) as number;
    if (current && depthOf.has(current))
      return (depthOf.get(current) as number) + 1;
    return 0;
  };

  const recordVisit = (target: string): void => {
    const d = depthFor(target);
    const prev = depthOf.get(target);
    if (prev === undefined || d < prev) depthOf.set(target, d);
    visited.add(target);
    current = target;
  };

  /** Returns a denial reason if navigating to `target` breaks scope, else null. */
  const violationFor = (target: string): string | null => {
    if (entryOrigin && originOf(target) !== entryOrigin) {
      return `Out of scope: ${target} is on a different site than the entry (${entryOrigin}). Stay on the entry site.`;
    }
    if (cfg.mode === "direct" && target !== entry) {
      return `Direct mode tests only the entry page (${entry}); do not navigate to ${target}. Finish exploring the entry page, then write the plan.`;
    }
    const d = depthFor(target);
    if (d > depthLimit) {
      return `Crawl depth limit (${depthLimit}) reached: ${target} would be ${d} hop(s) from the entry. Do not crawl deeper — write the plan with the pages you have.`;
    }
    if (!visited.has(target) && visited.size >= pageBudget) {
      return `Page budget (${pageBudget}) reached: do not open new pages. Write the test plan now from the ${visited.size} page(s) already explored.`;
    }
    return null;
  };

  const deny = (reason: string): HookJSONOutput => {
    denials++;
    cfg.onDeny?.(reason);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    };
  };

  const preToolUse: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse" || input.tool_name !== "Bash") {
      return { continue: true };
    }
    const cmd = (input.tool_input as { command?: string })?.command ?? "";
    for (const { verb, urlArg } of parseAllCli(cmd)) {
      const isNav = NAV_VERBS.has(verb);
      if (blocked && (isNav || verb === "click")) {
        return deny(
          "Crawl budget exhausted — further navigation is blocked. Write the test plan now from the pages already explored.",
        );
      }
      if (isNav && urlArg) {
        const target = normalizeUrl(urlArg);
        if (!target) continue;
        const reason = violationFor(target);
        if (reason) return deny(reason);
        recordVisit(target); // optimistic: confirmed by PostToolUse output
      }
    }
    return { continue: true };
  };

  const postToolUse: HookCallback = async (input) => {
    if (input.hook_event_name !== "PostToolUse" || input.tool_name !== "Bash") {
      return { continue: true };
    }
    const text = responseText((input as PostToolUseHookInput).tool_response);
    const url = parsePageUrl(text);
    if (!url) return { continue: true };
    const landed = normalizeUrl(url);
    if (!landed || landed === current) return { continue: true };
    // A navigation we didn't gate pre-call (a click or a redirect) landed here.
    if (violationFor(landed)) blocked = true;
    recordVisit(landed);
    return { continue: true };
  };

  return {
    hooks: {
      PreToolUse: [{ hooks: [preToolUse] }],
      PostToolUse: [{ hooks: [postToolUse] }],
    },
    stats: () => ({
      visited: [...visited],
      denials,
      blocked,
      current,
    }),
  };
}
