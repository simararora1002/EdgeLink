import { sql } from "drizzle-orm";
import type { DB } from "@/db/client";

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
  /** Injected so tests can control time. */
  now?: number;
}

/**
 * Sliding-window-log rate limiter, stored in the shared database.
 *
 * Why not an in-memory Map? On Cloudflare Workers every isolate has its own
 * memory and isolates come and go at any time. A Map would count per
 * isolate (requests routed to different isolates or locations each get a
 * fresh budget) and reset whenever the isolate is evicted.
 *
 * Why one conditional INSERT instead of "SELECT count, then INSERT"? The
 * two-step version is a race: 10 concurrent requests can all read
 * count = 4 and all insert. Here the check and the write are one statement,
 * and SQLite/libSQL runs write statements one at a time, so they can't
 * interleave. With 10 concurrent requests, exactly `limit` succeed.
 */
export async function consumeRateLimit(
  db: DB,
  { key, limit, windowMs, now = Date.now() }: RateLimitOptions,
): Promise<RateLimitResult> {
  const windowStart = now - windowMs;
  const id = crypto.randomUUID();

  const inserted = await db.all<{ id: string }>(sql`
    INSERT INTO rate_limit_hits (id, key, ts)
    SELECT ${id}, ${key}, ${now}
    WHERE (
      SELECT COUNT(*) FROM rate_limit_hits
      WHERE key = ${key} AND ts > ${windowStart}
    ) < ${limit}
    RETURNING id
  `);

  if (inserted.length > 0) {
    // Opportunistic cleanup of this key's expired rows keeps the table small.
    // In production this would be a scheduled (cron) job instead.
    await db.run(
      sql`DELETE FROM rate_limit_hits WHERE key = ${key} AND ts <= ${windowStart}`,
    );
    const [{ count }] = await db.all<{ count: number }>(
      sql`SELECT COUNT(*) AS count FROM rate_limit_hits WHERE key = ${key} AND ts > ${windowStart}`,
    );
    return { ok: true, remaining: Math.max(0, limit - Number(count)) };
  }

  // Rejected: the user can try again when the oldest hit in the window
  // drops out.
  return rejected(db, key, windowMs, now);
}

export interface QuotaSnapshot {
  limit: number;
  used: number;
  /** ms until the oldest hit in the window expires and frees a slot (0 if none). */
  nextFreeInMs: number;
}

/**
 * Read-only view of a key's usage, for the UI meter. Unlike
 * consumeRateLimit it never writes, so viewing your quota doesn't spend it.
 * It is informational only: the real check is still the atomic INSERT
 * above.
 */
export async function peekRateLimit(
  db: DB,
  { key, limit, windowMs, now = Date.now() }: RateLimitOptions,
): Promise<QuotaSnapshot> {
  const windowStart = now - windowMs;
  const rows = await db.all<{ ts: number }>(
    sql`SELECT ts FROM rate_limit_hits WHERE key = ${key} AND ts > ${windowStart} ORDER BY ts ASC`,
  );
  const used = Math.min(rows.length, limit);
  const nextFreeInMs =
    rows.length > 0 ? Math.max(0, Number(rows[0]!.ts) + windowMs - now) : 0;
  return { limit, used, nextFreeInMs };
}

async function rejected(
  db: DB,
  key: string,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const windowStart = now - windowMs;
  const [oldest] = await db.all<{ ts: number }>(
    sql`SELECT MIN(ts) AS ts FROM rate_limit_hits WHERE key = ${key} AND ts > ${windowStart}`,
  );
  const retryAfterMs = Math.max(0, Number(oldest?.ts ?? now) + windowMs - now);
  return { ok: false, retryAfterMs };
}
