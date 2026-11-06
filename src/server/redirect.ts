import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { links } from "@/db/schema";

/**
 * Increment the click count and return the target, in ONE statement.
 *
 * Reading first and then writing `clicks = oldValue + 1` would lose updates
 * when two clicks arrive at once. `clicks = clicks + 1 ... RETURNING` does the
 * increment in the database and needs only one round trip from the edge.
 */
export async function recordClick(db: DB, slug: string): Promise<string | null> {
  const [row] = await db
    .update(links)
    .set({ clicks: sql`${links.clicks} + 1` })
    .where(eq(links.slug, slug))
    .returning({ targetUrl: links.targetUrl });
  return row?.targetUrl ?? null;
}

export async function handleRedirect(db: DB, slug: string): Promise<Response> {
  const target = await recordClick(db, slug);
  if (!target) {
    return new Response("Short link not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  // 302, not 301: browsers cache 301s forever and would skip us on later
  // visits, so clicks would stop being counted. no-store keeps CDNs from
  // caching it too.
  return new Response(null, {
    status: 302,
    headers: { location: target, "cache-control": "no-store" },
  });
}
