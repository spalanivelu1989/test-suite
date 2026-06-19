// Plain-language explanation of why a migrated test failed, for the inspector UI.
//
// Two layers: a deterministic heuristic (always available, instant, no API) and
// an optional LLM pass that reads the spec + failure for a richer answer. The LLM
// path falls back to the heuristic on any error or missing API key, so callers
// always get a usable result.

import type { ClaudeClient } from "../claude/client";
import { isInfraFailure } from "./classify";
import type { SpecClassification, SpecOutcome } from "./types";

export interface ExplainInput {
  title: string | null;
  file: string;
  failureReason?: string;
  /** The spec source (post origin-rewrite), if available. */
  code?: string;
  sourceOutcome: SpecOutcome;
  targetOutcome: "passed" | "failed" | "flaky";
  classification: SpecClassification;
  /** True when the build fingerprint didn't match (different builds). */
  buildMismatch?: boolean;
  sourceUrl?: string;
  targetUrl?: string;
}

export interface FailureExplanation {
  /** One line: what went wrong, in plain words. */
  summary: string;
  /** Why it happened, in the migration context. */
  why: string;
  /** What to do about it. */
  fix: string;
  source: "ai" | "heuristic";
}

/** Friendly names for ARIA roles, so a role-only target reads in plain language. */
const ROLE_LABEL: Record<string, string> = {
  spinbutton: "number field",
  textbox: "text field",
  searchbox: "search field",
  combobox: "dropdown",
  listbox: "dropdown list",
  button: "button",
  link: "link",
  tab: "tab",
  tabpanel: "panel",
  slider: "slider",
  checkbox: "checkbox",
  switch: "toggle",
  radio: "radio option",
  heading: "heading",
  option: "option",
  menuitem: "menu item",
  row: "row",
  cell: "cell",
  gridcell: "cell",
  dialog: "dialog",
  alert: "alert",
  status: "status message",
  img: "image",
};

export interface LocatorInfo {
  /** Best human label for what the step ultimately wanted (the INNERMOST element). */
  target: string | null;
  /** Whether `target` is a literal label/text or a role description. */
  targetKind: "label" | "role" | null;
  /** An outer named container the target was looked up INSIDE, when the lookup is scoped. */
  scope: string | null;
  /** True when the locator chains/scopes ≥2 segments, so which part failed is ambiguous. */
  chained: boolean;
}

/**
 * Parse a Playwright failure's locator into {target, scope, chained}. Unlike a
 * naive "first name wins" extractor, this resolves the INNERMOST element (what the
 * step actually wanted) as the target and treats an outer named container as the
 * scope — so `getByRole('tabpanel', { name: 'Percent (%)' }).getByRole('spinbutton')`
 * reports target=a number field, scope="Percent (%)", NOT "Percent (%) is missing".
 */
export function describeLocator(reason: string): LocatorInfo {
  const locLine = (/^\s*Locator:\s*(.+)$/m.exec(reason)?.[1] ?? reason).trim();
  const segRe =
    /(getByRole|getByText|getByLabel|getByPlaceholder|getByTestId|getByTitle|getByAltText|locator|filter)\s*\(\s*([^()]*(?:\([^()]*\))?[^()]*)\)/g;
  type Seg = { fn: string; label: string | null; role: string | null };
  const segs: Seg[] = [];
  let m: RegExpExecArray | null;
  while ((m = segRe.exec(locLine))) {
    const fn = m[1];
    const arg = m[2];
    const label =
      /name:\s*['"`]([^'"`]+)['"`]/.exec(arg)?.[1] ??
      /hasText:\s*['"`]([^'"`]+)['"`]/.exec(arg)?.[1] ??
      (/^getBy(Text|Label|Placeholder|TestId|Title|AltText)$/.test(fn)
        ? /['"`]([^'"`]+)['"`]/.exec(arg)?.[1]
        : undefined) ??
      null;
    const role =
      fn === "getByRole"
        ? (/^\s*['"`](\w+)['"`]/.exec(arg)?.[1] ?? null)
        : null;
    segs.push({ fn, label, role });
  }
  if (!segs.length)
    return { target: null, targetKind: null, scope: null, chained: false };

  const named = segs.filter((s) => s.label);
  const innermost = segs[segs.length - 1];
  let target: string | null;
  let targetKind: "label" | "role" | null;
  if (innermost.label) {
    target = innermost.label;
    targetKind = "label";
  } else if (innermost.role) {
    target = ROLE_LABEL[innermost.role] ?? innermost.role;
    targetKind = "role";
  } else if (named.length) {
    target = named[named.length - 1].label;
    targetKind = "label";
  } else {
    target = null;
    targetKind = null;
  }

  const chained = segs.length >= 2;
  // Scope = the outermost named container, when it isn't the target itself.
  const scopeSeg = named.find((s) => s.label !== target);
  const scope = chained && scopeSeg ? scopeSeg.label : null;
  return { target, targetKind, scope, chained };
}

/** Pull the element/label a Playwright locator was looking for, if present.
 * Backwards-compatible shim over {@link describeLocator}. */
export function extractLocatorTarget(reason: string): string | null {
  return describeLocator(reason).target;
}

const buildNote = (m?: boolean) =>
  m
    ? " The build fingerprint also didn't match, so the target is a different build — some structural or value differences between the two are expected."
    : "";

/** Deterministic explanation from the failure text. Always available. */
export function heuristicExplain(input: ExplainInput): FailureExplanation {
  const reason = input.failureReason ?? "";
  const loc = describeLocator(reason);
  // How to refer to the target in prose: quote a literal label, but phrase a
  // role-derived target naturally ("the number field" rather than "number field").
  const thing = loc.target
    ? loc.targetKind === "label"
      ? `"${loc.target}"`
      : `the ${loc.target}`
    : "the element";

  // Signals, read from the raw Playwright text. The key distinction: did the
  // locator match ZERO elements (a real locate failure) or did it match an element
  // whose value/attribute simply differs (NOT a missing element)?
  const matchedZero =
    /element\(s\) not found|resolved to 0 elements|\bnot found\b/i.test(reason);
  const elementWasFound =
    /Received|unexpected value|locator resolved to|resolved to <|to(BeLessThan|BeGreaterThan|BeGreaterThanOrEqual|BeLessThanOrEqual|Equal|Be|Contain)\b/i.test(
      reason,
    );
  const isValueAssertion =
    /toHaveURL|toHaveText|toContainText|toHaveAttribute|toHaveValue|toHaveCount|toHaveCSS|toHaveClass|toHaveJSProperty/i.test(
      reason,
    ) ||
    /toBe(LessThan|GreaterThan|GreaterThanOrEqual|LessThanOrEqual|Truthy|Falsy)?\b|toEqual/i.test(
      reason,
    );

  // (0) Suite couldn't run / setup-or-auth problem.
  if (
    input.classification === "infra" ||
    isInfraFailure(reason) ||
    /did not run/i.test(reason)
  ) {
    return {
      summary: "The test couldn't run against the target.",
      why:
        "This is an environment issue, not a real regression — usually the login didn't complete (wrong credentials or Identity Provider) or the app couldn't be reached." +
        buildNote(input.buildMismatch),
      fix: "Check the login details (username, password, and the IdP name) and that the target URL is reachable, then re-run.",
      source: "heuristic",
    };
  }

  // (1) Selector matched MULTIPLE elements (Playwright strict mode). The element IS
  // present — often more than once (e.g. a toast plus its aria-live screen-reader
  // copy, or the same value rendered in two places) — an ambiguous-selector problem,
  // not a missing element and usually not a real regression.
  if (/strict mode violation|resolved to [2-9]\d* elements/i.test(reason)) {
    return {
      summary: `The test matched more than one ${thing} on the target page.`,
      why:
        `The step's selector for ${thing} is ambiguous — it resolved to several elements on the target (for example a visible toast and its screen-reader announcement, or the same value shown in two places), so Playwright refused to pick one. The element is present; the selector just isn't specific enough.` +
        buildNote(input.buildMismatch),
      fix: "Make the selector resolve to one element — add .first(), filter to the visible one, or scope it to a container (e.g. the notifications region). This is normally a test fix, not an app regression.",
      source: "heuristic",
    };
  }

  // (2) Whole-test timeout (the test as a whole ran out of time on a stuck step).
  if (/test timeout of \d+ms exceeded/i.test(reason)) {
    return {
      summary: "The test ran out of time (it got stuck on a step).",
      why:
        "A step waited for something that never happened — usually a button, field, or option that doesn't appear on the target build, so the test hung until it timed out." +
        buildNote(input.buildMismatch),
      fix: "Find the first step that stalls (often a missing element earlier in the flow) and update it for the target, or confirm that part of the flow still exists.",
      source: "heuristic",
    };
  }

  // (3) Value/behaviour mismatch: the element WAS found, but its value, text, or a
  // computed comparison differs. NOT a missing element — must be decided before the
  // locate branch, which a value-assertion's locator line would otherwise trigger.
  if (isValueAssertion && elementWasFound && !matchedZero) {
    return {
      summary:
        "The page loaded and the element was found, but a value didn't match what the test expected.",
      why:
        `The element exists; its text, value, attribute, or computed result differs from the source — a content/behaviour difference, not a missing or moved element.` +
        buildNote(input.buildMismatch),
      fix: "Check whether the new value is correct for the target. If the change is intentional, update the expected value in the test; if not, it's a real regression in the app.",
      source: "heuristic",
    };
  }

  // (4) Locate failure: the locator matched nothing (or an element never became
  // visible). Crucially, this does NOT assume "renamed/moved/removed" — for a SCOPED
  // lookup the failing part is ambiguous (the inner control, or the container around
  // it), so we name the actual target, surface the scope, and hedge the cause.
  if (matchedZero || /toBeVisible|waiting for|Timed out \d+ms/i.test(reason)) {
    if (loc.chained && loc.scope && loc.scope !== loc.target) {
      return {
        summary: `The test couldn't locate ${thing} on the target page.`,
        why:
          `The step looked for ${thing} inside the "${loc.scope}" section, and nothing matched on the target. The element may well be present but nested or labelled differently here, or "${loc.scope}" itself isn't exposed the way the test expects — so this is not necessarily a removed feature.` +
          buildNote(input.buildMismatch),
        fix: `Open the target and confirm ${thing} is reachable inside "${loc.scope}". If it's there but the surrounding markup/labels changed, make the test's selector less structure-dependent (target the field by its own label rather than via the container); only treat it as a real regression if it's genuinely gone.`,
        source: "heuristic",
      };
    }
    return {
      summary: `The test couldn't find ${thing} on the target page.`,
      why:
        `The step needed ${thing}, but the lookup matched nothing on the target. It may be missing, not rendered yet at this point in the flow, or present with a different label than the test expects — so this isn't automatically a removed feature.` +
        buildNote(input.buildMismatch),
      fix: loc.target
        ? `Open the target and check whether ${thing} is present. If the label or position changed, update the test's selector; if it's genuinely gone, that's a real regression to fix in the app.`
        : "Open the target and confirm the element is present; update the test's selector if the UI changed, otherwise treat it as a regression.",
      source: "heuristic",
    };
  }

  // (5) Fallback.
  return {
    summary: "The test failed on the target.",
    why:
      (reason ? `Playwright reported: ${reason.slice(0, 160)}. ` : "") +
      "On a migration this usually means the target behaves differently from the source." +
      buildNote(input.buildMismatch),
    fix: "Open the target, reproduce the step that failed, and either update the test for the new behaviour or fix the app if the behaviour is wrong.",
    source: "heuristic",
  };
}

const SYSTEM =
  "You explain why an automated UI test failed, to a non-expert, after an app was migrated to a new deployment. " +
  "Be concrete and concise. Return ONLY a JSON object: " +
  '{"summary": string, "why": string, "fix": string}. ' +
  "summary: one short sentence on what went wrong. why: 1-2 sentences on the likely cause in plain language. " +
  "fix: 1-2 sentences on what to do. No prose outside the JSON.";

export function buildExplainPrompt(input: ExplainInput): string {
  const lines = [
    `Test: ${input.title ?? input.file}`,
    `Outcome on source app: ${input.sourceOutcome}; on target: ${input.targetOutcome}`,
    `Builds differ (fingerprint mismatch): ${input.buildMismatch ? "yes" : "no"}`,
    input.sourceUrl ? `Source: ${input.sourceUrl}` : "",
    input.targetUrl ? `Target: ${input.targetUrl}` : "",
    "",
    "Playwright failure:",
    (input.failureReason ?? "(none)").slice(0, 600),
  ];
  if (input.code) {
    lines.push("", "Test code:", input.code.slice(0, 1800));
  }
  lines.push("", "Return the JSON now.");
  return lines.filter(Boolean).join("\n");
}

function parseExplanation(
  text: string,
): { summary: string; why: string; fix: string } | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(text.slice(start, end + 1));
    if (
      typeof obj.summary === "string" &&
      typeof obj.why === "string" &&
      typeof obj.fix === "string"
    ) {
      return { summary: obj.summary, why: obj.why, fix: obj.fix };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Explain a failure. Uses the LLM when a client is given and succeeds; otherwise
 * (no key, error, unparseable) returns the deterministic heuristic.
 */
export async function explainFailure(
  input: ExplainInput,
  claude?: ClaudeClient,
): Promise<FailureExplanation> {
  if (claude) {
    try {
      const text = await claude.complete({
        purpose: "migration-explain",
        system: SYSTEM,
        prompt: buildExplainPrompt(input),
        maxTokens: 600,
      });
      const parsed = parseExplanation(text);
      if (parsed) return { ...parsed, source: "ai" };
    } catch {
      /* fall back to heuristic */
    }
  }
  return heuristicExplain(input);
}
