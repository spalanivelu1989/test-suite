// Trust gate (Spec R11, ADR-0005). Pure rules deciding whether a distilled
// playbook may be injected into agent prompts. A playbook earns `trusted` only
// with enough independent supporting runs AND no contradicting evidence;
// contradiction RE-WEIGHTS (demotes), never deletes — provenance is retained.

import type { PlaybookStatus } from "../types";

/** Distinct supporting runs required to trust a playbook (calibrated, T23). */
export const PROMOTE_SUPPORT_N = 2;

export interface TrustSignal {
  /** Distinct runs whose episodes support the principle. */
  supportCount: number;
  /** Distinct runs that solved the same failure a different way. */
  contradictions: number;
}

/** A playbook is trustworthy with enough support and zero contradictions. */
export function shouldTrust(
  s: TrustSignal,
  supportN = PROMOTE_SUPPORT_N,
): boolean {
  return s.supportCount >= supportN && s.contradictions === 0;
}

/**
 * The status a playbook should hold given its evidence. Demotion is possible
 * (trusted → episodic) when contradictions appear; the row is never deleted.
 */
export function nextStatus(
  s: TrustSignal,
  supportN = PROMOTE_SUPPORT_N,
): PlaybookStatus {
  return shouldTrust(s, supportN) ? "trusted" : "episodic";
}

/**
 * Confidence in [0,1]: rises with support, falls with contradictions. Used for
 * ranking trusted playbooks at injection time (most-supported first).
 */
export function confidenceFor(s: TrustSignal): number {
  const support = s.supportCount / (s.supportCount + 1); // 1→0.5, 4→0.8, asymptote 1
  const penalty = s.contradictions / (s.contradictions + 1);
  return Math.max(0, Math.min(1, support * (1 - penalty)));
}
