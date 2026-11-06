// The "/web" entrypoint talks to libSQL/Turso over HTTP using fetch. It has
// no Node built-ins, which is what Cloudflare Workers needs. For local
// `file:` URLs we fall back to the Node client, so `next dev` and the tests
// can use a SQLite file without a Turso account.
import { createClient as createWebClient } from "@libsql/client/web";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

/**
 * Build a DB handle for the current request.
 *
 * Deliberately NOT a module-level singleton: on Workers there is no
 * long-lived process, and I/O objects created in one request must not be
 * reused from another. The HTTP client is cheap to construct (no
 * connection handshake), so building it per request costs almost nothing.
 */
export async function getDb(): Promise<DB> {
  const url = process.env.DATABASE_URL ?? "file:local.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

  if (url.startsWith("file:") || url === ":memory:") {
    // Local development only; never reached on Workers (no filesystem there).
    const { createClient } = await import("@libsql/client");
    return drizzle(createClient({ url }), { schema });
  }
  return drizzle(createWebClient({ url, authToken }), { schema });
}
