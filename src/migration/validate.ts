// Request validation for POST /api/migration-check. Mirrors the style of
// src/api/validation.ts (a small ok/error discriminated result, no exceptions).

import type { MigrationCheckRequest } from "./types";

export type ParsedMigration =
  | { ok: true; req: MigrationCheckRequest }
  | { ok: false; error: string };

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseMigrationRequest(body: unknown): ParsedMigration {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!isHttpUrl(b.sourceUrl)) {
    return { ok: false, error: "sourceUrl must be a valid http(s) URL" };
  }
  if (!isHttpUrl(b.targetUrl)) {
    return { ok: false, error: "targetUrl must be a valid http(s) URL" };
  }
  if (
    !Array.isArray(b.selectedSpecFiles) ||
    b.selectedSpecFiles.length === 0 ||
    !b.selectedSpecFiles.every((f) => typeof f === "string")
  ) {
    return {
      ok: false,
      error: "selectedSpecFiles must be a non-empty array of strings",
    };
  }
  // Auth is optional — some target deployments don't require login. Build it
  // only from the fields actually provided.
  const auth = (b.auth ?? {}) as Record<string, unknown>;
  const authObj: NonNullable<MigrationCheckRequest["auth"]> = {
    ...(isNonEmptyString(auth.username) ? { username: auth.username } : {}),
    ...(isNonEmptyString(auth.password) ? { password: auth.password } : {}),
    ...(isNonEmptyString(auth.idp) ? { idp: auth.idp } : {}),
    ...(isNonEmptyString(auth.loginUrl) ? { loginUrl: auth.loginUrl } : {}),
  };

  // Optional per-spec code overrides (edited-target-code re-run). Keep only
  // string-keyed entries whose code is a non-empty string.
  let specOverrides: Record<string, string> | undefined;
  if (b.specOverrides && typeof b.specOverrides === "object") {
    const entries = Object.entries(
      b.specOverrides as Record<string, unknown>,
    ).filter(([, v]) => isNonEmptyString(v)) as [string, string][];
    if (entries.length > 0) specOverrides = Object.fromEntries(entries);
  }

  const options = (b.options ?? {}) as Record<string, unknown>;
  const req: MigrationCheckRequest = {
    sourceUrl: b.sourceUrl,
    targetUrl: b.targetUrl,
    ...(isNonEmptyString(b.pathPrefix) ? { pathPrefix: b.pathPrefix } : {}),
    selectedSpecFiles: b.selectedSpecFiles as string[],
    ...(specOverrides ? { specOverrides } : {}),
    ...(Object.keys(authObj).length > 0 ? { auth: authObj } : {}),
    ...(typeof b.sourceRunId === "string"
      ? { sourceRunId: b.sourceRunId }
      : {}),
    options: {
      heal: options.heal === true,
      reruns:
        typeof options.reruns === "number" && options.reruns >= 1
          ? Math.floor(options.reruns)
          : 2,
      fingerprintCheck: options.fingerprintCheck !== false,
    },
  };
  return { ok: true, req };
}
