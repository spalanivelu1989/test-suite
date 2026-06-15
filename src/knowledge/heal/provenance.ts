// Heal provenance (CRISPR "repair pathway" metric). The Evolver's repairs are
// already reconstructed as HealingEvent[] by captureHeal (ADR-0004); here we split
// them by WHETHER a donor template was on hand at heal time:
//
//   precedent surfaced for this failure signature?  ──yes──▶  template-directed (HDR)
//                     │
//                     └──no──▶  cold / blind repair (NHEJ)
//
// hdrRate = HDR / (HDR + NHEJ). Tracked per run so its trend shows whether the
// knowledge layer's memory is paying off. Pure: no DB, no LLM, no I/O.

import type { HealingEvent, HealingPrecedent, HealProvenance } from "../types";

/**
 * Split a run's heals into template-directed (HDR) vs blind (NHEJ).
 *
 * Unit of repair is the SPEC FILE, not the diff hunk: captureHeal emits one event
 * per changed hunk but keys every hunk of a file to the same failure signature and
 * outcome, so we collapse to the file level to avoid counting one repair N times.
 *
 * A healed spec is template-directed when its (non-empty) failure signature matches
 * a precedent that was surfaced to the Evolver this run. An empty signature can't
 * key a template, so it always counts as blind. Quarantines (test.fixme) are a
 * non-repair and excluded from the HDR/NHEJ denominator.
 */
export function computeHealProvenance(
  healingEvents: HealingEvent[],
  precedents: HealingPrecedent[],
): HealProvenance {
  // Collapse hunks → one entry per repaired spec (first event wins; outcome and
  // signature are identical across a file's hunks by construction).
  const byFile = new Map<
    string,
    { outcome: HealingEvent["outcome"]; signature: string }
  >();
  for (const e of healingEvents) {
    if (!byFile.has(e.file)) {
      byFile.set(e.file, { outcome: e.outcome, signature: e.failureSignature });
    }
  }

  // The signatures we actually surfaced a donor template for this run.
  const templates = new Set(
    precedents.map((p) => p.failureSignature).filter((s) => s.length > 0),
  );

  let healed = 0;
  let templateDirected = 0;
  let quarantined = 0;
  for (const { outcome, signature } of byFile.values()) {
    if (outcome === "fixme") {
      quarantined++;
      continue;
    }
    healed++;
    if (signature.length > 0 && templates.has(signature)) templateDirected++;
  }

  const blind = healed - templateDirected;
  const hdrRate = healed === 0 ? 0 : templateDirected / healed;
  return { healed, templateDirected, blind, hdrRate, quarantined };
}
