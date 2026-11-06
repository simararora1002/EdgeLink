import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";

/**
 * A fresh SQLite file per test, with the real migrations applied. A file
 * (not `:memory:`) so concurrent statements behave like the real database.
 */
export async function makeTestDb(): Promise<DB> {
  const dir = mkdtempSync(join(tmpdir(), "edgelink-test-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
