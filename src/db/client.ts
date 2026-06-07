import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.ts";

export type AppDatabase = ReturnType<typeof createDatabase>["db"];

export function createDatabase(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

let shared: AppDatabase | null = null;

export function getDb(): AppDatabase {
  if (!shared) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return shared;
}

export function initDb(databasePath: string): AppDatabase {
  const { db } = createDatabase(databasePath);
  shared = db;
  return db;
}

export function resetDbForTests(db: AppDatabase | null) {
  shared = db;
}
