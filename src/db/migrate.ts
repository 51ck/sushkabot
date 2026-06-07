import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function runMigrations(sqlite: Database, migrationsDir = "./drizzle") {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  let files: string[] = [];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return;
  }

  for (const file of files) {
    const hash = file;
    const existing = sqlite.query("SELECT hash FROM __drizzle_migrations WHERE hash = ?").get(hash);
    if (existing) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    sqlite.exec("BEGIN");
    try {
      for (const statement of statements) {
        sqlite.exec(statement);
      }
      sqlite.query("INSERT INTO __drizzle_migrations (hash) VALUES (?)").run(hash);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

if (import.meta.main) {
  const { createDatabase } = await import("./client.ts");
  const path = process.env.DATABASE_PATH ?? "./data/sushkobot.db";
  const { sqlite } = createDatabase(path);
  runMigrations(sqlite);
  console.info("Migrations complete");
}
