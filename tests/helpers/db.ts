import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { initDb, resetDbForTests } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema.ts";

export function createTestDb() {
  const sqlite = new Database(":memory:", { create: true });
  sqlite.exec("PRAGMA foreign_keys = ON;");
  runMigrations(sqlite, `${import.meta.dir}/../../drizzle`);
  const db = drizzle(sqlite, { schema });
  resetDbForTests(db);
  return { db, sqlite };
}

export function initTestDbPath(path: string) {
  const { db, sqlite } = (() => {
    const s = new Database(path, { create: true });
    s.exec("PRAGMA foreign_keys = ON;");
    runMigrations(s, `${import.meta.dir}/../../drizzle`);
    const d = drizzle(s, { schema });
    return { db: d, sqlite: s };
  })();
  resetDbForTests(db);
  return { db, sqlite };
}

export { initDb, resetDbForTests };
