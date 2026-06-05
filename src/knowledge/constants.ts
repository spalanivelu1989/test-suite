// Marker written atop a spec copied forward on a `reuse` decision (Plan D4).
// `extract` detects it so the copy is recorded with reused=true and is excluded
// from future match candidates (keeps duplicate-avoidance honest).
export const REUSE_MARKER = "@kp-reused";
