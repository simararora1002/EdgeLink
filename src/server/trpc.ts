import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { getDb, type DB } from "@/db/client";

/** No auth in this exercise; every request acts as this user. */
export const DEMO_USER_ID = "user_demo";

export interface Context {
  db: DB;
  userId: string;
}

/** Built fresh for every request (HTTP handler or RSC caller). */
export async function createContext(): Promise<Context> {
  return { db: await getDb(), userId: DEMO_USER_ID };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
