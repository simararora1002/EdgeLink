import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const links = sqliteTable(
  "links",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    targetUrl: text("target_url").notNull(),
    clicks: integer("clicks").notNull().default(0),
    ownerId: text("owner_id").notNull(),
    // Unix epoch milliseconds. Stored as a plain integer so the rate limiter
    // can compare against it with simple arithmetic.
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("links_owner_created_idx").on(t.ownerId, t.createdAt)],
);

/**
 * Sliding-window log for rate limiting. One row per *allowed* action.
 * Lives in the shared DB (not in memory) because Workers isolates do not
 * share memory and are recycled at any time.
 */
export const rateLimitHits = sqliteTable(
  "rate_limit_hits",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    ts: integer("ts").notNull(),
  },
  (t) => [index("rate_limit_key_ts_idx").on(t.key, t.ts)],
);

export type Link = typeof links.$inferSelect;
