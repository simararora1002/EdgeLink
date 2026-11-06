import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/client";
import { links } from "@/db/schema";
import { createCaller } from "@/server/routers/_app";
import { makeTestDb } from "./helpers";

// Keep the real slug module, but let one test choose the slugs it returns.
const slugQueue: string[] = [];
vi.mock("@/lib/slug", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/slug")>();
  return {
    ...real,
    generateSlug: () => slugQueue.shift() ?? real.generateSlug(),
  };
});

describe("links router", () => {
  let db: DB;
  const callerFor = (userId = "user_demo") => createCaller({ db, userId });

  beforeEach(async () => {
    db = await makeTestDb();
    slugQueue.length = 0;
  });

  it("creates a link owned by the caller with 0 clicks", async () => {
    const link = await callerFor().links.create({ url: "https://example.com/x" });
    expect(link.slug).toMatch(/^[0-9a-zA-Z]{7}$/);
    expect(link.ownerId).toBe("user_demo");
    expect(link.clicks).toBe(0);
    expect(link.remaining).toBe(4);
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>x</script>", "ftp://x.com/f", "not a url"])(
    "rejects unsafe or invalid URL %s",
    async (url) => {
      await expect(callerFor().links.create({ url })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    },
  );

  it("rejects the 6th create within a minute with TOO_MANY_REQUESTS", async () => {
    const caller = callerFor();
    for (let i = 0; i < 5; i++) {
      await caller.links.create({ url: `https://example.com/${i}` });
    }
    const err = await caller.links
      .create({ url: "https://example.com/6" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("TOO_MANY_REQUESTS");
    expect((err as TRPCError).message).toMatch(/5 links per minute/);
    // And nothing extra was written.
    expect(await db.select().from(links)).toHaveLength(5);
  });

  it("invalid input does not use up rate-limit budget", async () => {
    const caller = callerFor();
    for (let i = 0; i < 10; i++) {
      await caller.links.create({ url: "javascript:void(0)" }).catch(() => {});
    }
    await expect(caller.links.create({ url: "https://ok.com" })).resolves.toBeTruthy();
  });

  it("retries on a slug collision instead of failing", async () => {
    await db.insert(links).values({
      id: "existing",
      slug: "taken01",
      targetUrl: "https://a.com",
      ownerId: "someone",
      createdAt: Date.now(),
    });
    slugQueue.push("taken01", "fresh01");
    const link = await callerFor().links.create({ url: "https://b.com" });
    expect(link.slug).toBe("fresh01");
  });

  it("lists only the caller's own links, newest first", async () => {
    await callerFor().links.create({ url: "https://first.com" });
    await new Promise((r) => setTimeout(r, 5));
    await callerFor().links.create({ url: "https://second.com" });
    await callerFor("intruder").links.create({ url: "https://theirs.com" });

    const rows = await callerFor().links.list();
    expect(rows.map((r) => r.targetUrl)).toEqual([
      "https://second.com",
      "https://first.com",
    ]);
  });
});
