import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db/client";
import { links } from "@/db/schema";
import { handleRedirect } from "@/server/redirect";
import { makeTestDb } from "./helpers";

describe("redirect /[slug]", () => {
  let db: DB;
  const clicks = async (slug: string) =>
    (await db.select().from(links).where(eq(links.slug, slug)))[0]!.clicks;

  beforeEach(async () => {
    db = await makeTestDb();
    await db.insert(links).values({
      id: "1",
      slug: "abc1234",
      targetUrl: "https://example.com/target?q=1",
      ownerId: "user_demo",
      createdAt: Date.now(),
    });
  });

  it("302-redirects to the target and is not cacheable", async () => {
    const res = await handleRedirect(db, "abc1234");
    // 302, not 301: a cached 301 would bypass us and stop click counting.
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/target?q=1");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("increments the click counter on every visit", async () => {
    await handleRedirect(db, "abc1234");
    await handleRedirect(db, "abc1234");
    expect(await clicks("abc1234")).toBe(2);
  });

  it("does not lose clicks under concurrency", async () => {
    // A read-then-write counter would lose some of these.
    await Promise.all(Array.from({ length: 25 }, () => handleRedirect(db, "abc1234")));
    expect(await clicks("abc1234")).toBe(25);
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await handleRedirect(db, "nope");
    expect(res.status).toBe(404);
  });
});
