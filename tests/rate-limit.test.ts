import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db/client";
import { consumeRateLimit, peekRateLimit } from "@/server/rate-limit";
import { makeTestDb } from "./helpers";

const opts = { key: "create_link:user_demo", limit: 5, windowMs: 60_000 };
const T0 = 1_700_000_000_000;

describe("consumeRateLimit (sliding window, DB-backed)", () => {
  let db: DB;
  beforeEach(async () => {
    db = await makeTestDb();
  });

  it("allows 5 within a minute and rejects the 6th", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await consumeRateLimit(db, { ...opts, now: T0 + i * 1000 });
      expect(r).toEqual({ ok: true, remaining: 4 - i });
    }
    const sixth = await consumeRateLimit(db, { ...opts, now: T0 + 5000 });
    expect(sixth.ok).toBe(false);
    // Oldest hit at T0 expires at T0+60s, and we're at T0+5s: 55s to wait.
    if (!sixth.ok) expect(sixth.retryAfterMs).toBe(55_000);
  });

  it("is a sliding window, not a fixed one: no double burst at a boundary", async () => {
    // 5 hits at second 59 of one "minute"...
    for (let i = 0; i < 5; i++) {
      await consumeRateLimit(db, { ...opts, now: T0 + 59_000 });
    }
    // ...then at second 61. A fixed window would have reset here; a sliding
    // window still sees 5 hits in the last 60s.
    const r = await consumeRateLimit(db, { ...opts, now: T0 + 61_000 });
    expect(r.ok).toBe(false);
  });

  it("allows again once the oldest hit leaves the window", async () => {
    for (let i = 0; i < 5; i++) {
      await consumeRateLimit(db, { ...opts, now: T0 });
    }
    expect((await consumeRateLimit(db, { ...opts, now: T0 + 59_999 })).ok).toBe(false);
    expect((await consumeRateLimit(db, { ...opts, now: T0 + 60_001 })).ok).toBe(true);
  });

  it("does not count rejected attempts against the user", async () => {
    for (let i = 0; i < 5; i++) await consumeRateLimit(db, { ...opts, now: T0 });
    // Hammering while limited must not push the window out.
    for (let i = 0; i < 20; i++) {
      await consumeRateLimit(db, { ...opts, now: T0 + 30_000 });
    }
    expect((await consumeRateLimit(db, { ...opts, now: T0 + 60_001 })).ok).toBe(true);
  });

  it("is atomic under concurrency: 20 parallel requests → exactly 5 allowed", async () => {
    // This is the race a "SELECT count, then INSERT" limiter loses.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(db, { ...opts, now: T0 })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });

  it("peek reports usage and countdown without spending quota", async () => {
    expect(await peekRateLimit(db, { ...opts, now: T0 })).toEqual({
      limit: 5,
      used: 0,
      nextFreeInMs: 0,
    });
    await consumeRateLimit(db, { ...opts, now: T0 });
    await consumeRateLimit(db, { ...opts, now: T0 + 10_000 });
    // Peeking many times must not use up any slots.
    for (let i = 0; i < 10; i++) await peekRateLimit(db, { ...opts, now: T0 + 15_000 });
    expect(await peekRateLimit(db, { ...opts, now: T0 + 15_000 })).toEqual({
      limit: 5,
      used: 2,
      nextFreeInMs: 45_000, // oldest hit (T0) frees at T0+60s
    });
  });

  it("limits each key separately", async () => {
    for (let i = 0; i < 5; i++) await consumeRateLimit(db, { ...opts, now: T0 });
    const other = await consumeRateLimit(db, {
      ...opts,
      key: "create_link:someone_else",
      now: T0,
    });
    expect(other.ok).toBe(true);
  });
});
