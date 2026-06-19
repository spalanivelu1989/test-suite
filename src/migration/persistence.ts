// Disk persistence for Migration Check, kept entirely separate from normal runs
// (its own `.migration-runs/` root) so it can never collide with `.runs`.
//
// Two artifacts per migration:
//   .migration-runs/<id>/status.json     — lifecycle (running/completed/failed)
//   .migration-runs/<id>/migration.json  — the full MigrationReport (when done)
// The workspace files (tests/, results.json) also live under this dir, mirroring
// how `.runs/<id>` holds both run.json and the workspace.

import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type {
  MigrationEnvironment,
  MigrationEvent,
  MigrationReport,
} from "./types";

export const MIGRATION_BASE_DIR = ".migration-runs";

export interface MigrationStatus {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  error?: string;
  /** Live progress log, appended as the run advances. */
  events?: MigrationEvent[];
}

function root(baseDir = MIGRATION_BASE_DIR): string {
  return join(process.cwd(), baseDir);
}

export async function saveMigrationStatus(
  status: MigrationStatus,
  baseDir = MIGRATION_BASE_DIR,
): Promise<void> {
  const dir = join(root(baseDir), status.id);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "status.json"),
      JSON.stringify(status, null, 2),
      "utf8",
    );
  } catch (err) {
    console.error(`Failed to persist migration status ${status.id}:`, err);
  }
}

export async function saveMigrationReport(
  report: MigrationReport,
  baseDir = MIGRATION_BASE_DIR,
): Promise<void> {
  const dir = join(root(baseDir), report.id);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "migration.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
  } catch (err) {
    console.error(`Failed to persist migration report ${report.id}:`, err);
  }
}

export async function getMigrationReport(
  id: string,
  baseDir = MIGRATION_BASE_DIR,
): Promise<MigrationReport | null> {
  try {
    const raw = await readFile(
      join(root(baseDir), id, "migration.json"),
      "utf8",
    );
    return JSON.parse(raw) as MigrationReport;
  } catch {
    return null;
  }
}

export async function getMigrationStatus(
  id: string,
  baseDir = MIGRATION_BASE_DIR,
): Promise<MigrationStatus | null> {
  try {
    const raw = await readFile(join(root(baseDir), id, "status.json"), "utf8");
    return JSON.parse(raw) as MigrationStatus;
  } catch {
    return null;
  }
}

/** All migration statuses on disk, newest first. */
export async function listMigrationStatuses(
  baseDir = MIGRATION_BASE_DIR,
): Promise<MigrationStatus[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(root(baseDir), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: MigrationStatus[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const status = await getMigrationStatus(entry.name, baseDir);
    if (status) out.push(status);
  }
  return out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/**
 * Delete a saved migration check, purging its entire `.migration-runs/<id>/`
 * directory (status, report, and workspace). Returns false when nothing was on
 * disk for that id.
 */
export async function removeMigration(
  id: string,
  baseDir = MIGRATION_BASE_DIR,
): Promise<boolean> {
  const dir = join(root(baseDir), id);
  try {
    await stat(dir);
  } catch {
    return false;
  }
  await rm(dir, { recursive: true, force: true });
  return true;
}

// --- saved environments ---------------------------------------------------
// A single JSON file at the root holds every saved environment. Credentials are
// NEVER persisted here — only where the app lives.

function envFile(baseDir = MIGRATION_BASE_DIR): string {
  return join(root(baseDir), "environments.json");
}

export function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "env"
  );
}

export async function listEnvironments(
  baseDir = MIGRATION_BASE_DIR,
): Promise<MigrationEnvironment[]> {
  try {
    const raw = await readFile(envFile(baseDir), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MigrationEnvironment[]) : [];
  } catch {
    return [];
  }
}

/** Upsert an environment by id (newest wins). */
export async function saveEnvironment(
  env: MigrationEnvironment,
  baseDir = MIGRATION_BASE_DIR,
): Promise<void> {
  const all = await listEnvironments(baseDir);
  const next = [...all.filter((e) => e.id !== env.id), env];
  try {
    await mkdir(root(baseDir), { recursive: true });
    await writeFile(envFile(baseDir), JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    console.error(`Failed to save migration environment ${env.id}:`, err);
  }
}

export async function deleteEnvironment(
  id: string,
  baseDir = MIGRATION_BASE_DIR,
): Promise<boolean> {
  const all = await listEnvironments(baseDir);
  const next = all.filter((e) => e.id !== id);
  if (next.length === all.length) return false;
  await writeFile(envFile(baseDir), JSON.stringify(next, null, 2), "utf8");
  return true;
}
