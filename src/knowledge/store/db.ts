import { Pool } from "pg";

// Postgres connection for the Knowledge Layer (Spec R2, Plan RK4). A single
// pool per connection URL, stashed on globalThis — mirrors getRunStore() in
// src/runStore/store.ts, because Next.js duplicates module instances across
// route files and HMR, and we must not leak a pool per reload.

const g = globalThis as unknown as {
  __knowledgePools?: Map<string, Pool>;
};

function pools(): Map<string, Pool> {
  if (!g.__knowledgePools) g.__knowledgePools = new Map();
  return g.__knowledgePools;
}

/** Get (or create) the shared pool for a connection URL. */
export function getPool(url: string): Pool {
  const cache = pools();
  let pool = cache.get(url);
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30_000,
      // Fail fast if the DB is down — the caller (withKb) degrades to cold.
      connectionTimeoutMillis: 3_000,
    });
    // A pool 'error' event (idle client dropped) must never crash the process.
    pool.on("error", (e) =>
      console.error("[knowledge] pool error (ignored):", e.message),
    );
    cache.set(url, pool);
  }
  return pool;
}

/** True if the database answers a trivial query. */
export async function healthCheck(url: string): Promise<boolean> {
  try {
    await getPool(url).query("select 1");
    return true;
  } catch {
    return false;
  }
}

/** Close and forget one pool (tests / shutdown). */
export async function closePool(url: string): Promise<void> {
  const cache = pools();
  const pool = cache.get(url);
  if (pool) {
    cache.delete(url);
    await pool.end();
  }
}

/** Close every pool (process shutdown). */
export async function closeAllPools(): Promise<void> {
  const cache = pools();
  const all = [...cache.values()];
  cache.clear();
  await Promise.all(all.map((p) => p.end().catch(() => {})));
}
