import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { links } from "@/db/schema";
import { generateSlug, RESERVED_SLUGS } from "@/lib/slug";
import { targetUrlSchema } from "@/lib/url";
import { consumeRateLimit, peekRateLimit } from "@/server/rate-limit";
import { publicProcedure, router } from "@/server/trpc";

export const CREATE_LIMIT = 5;
export const CREATE_WINDOW_MS = 60_000;
const MAX_SLUG_ATTEMPTS = 3;

/** Drizzle wraps driver errors, so walk the `cause` chain. */
function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++) {
    if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) {
      return true;
    }
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export const linksRouter = router({
  create: publicProcedure
    .input(z.object({ url: targetUrlSchema }))
    .mutation(async ({ ctx, input }) => {
      // Rate limit before doing any work. Rejected attempts aren't
      // recorded, so retrying after a rejection doesn't push the window out.
      const rl = await consumeRateLimit(ctx.db, {
        key: `create_link:${ctx.userId}`,
        limit: CREATE_LIMIT,
        windowMs: CREATE_WINDOW_MS,
      });
      if (!rl.ok) {
        const seconds = Math.ceil(rl.retryAfterMs / 1000);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit reached: you can create ${CREATE_LIMIT} links per minute. Try again in ${seconds}s.`,
        });
      }

      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
        const slug = generateSlug();
        if (RESERVED_SLUGS.has(slug)) continue;
        try {
          const [row] = await ctx.db
            .insert(links)
            .values({
              id: crypto.randomUUID(),
              slug,
              targetUrl: input.url,
              ownerId: ctx.userId,
              createdAt: Date.now(),
            })
            .returning();
          return { ...row!, remaining: rl.remaining };
        } catch (err) {
          if (isUniqueViolation(err)) continue; // slug collision: try another
          throw err;
        }
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not allocate a unique slug, please retry.",
      });
    }),

  /** Current rate-limit usage for the UI meter. Read-only; never spends quota. */
  quota: publicProcedure.query(({ ctx }) =>
    peekRateLimit(ctx.db, {
      key: `create_link:${ctx.userId}`,
      limit: CREATE_LIMIT,
      windowMs: CREATE_WINDOW_MS,
    }),
  ),

  list: publicProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(links)
      .where(eq(links.ownerId, ctx.userId))
      .orderBy(desc(links.createdAt))
      .limit(100),
  ),
});
