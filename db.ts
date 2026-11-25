import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "@/db/schema";

export type DB = BetterSQLite3Database<typeof schema>;

const file = () => path.resolve((process.env.DATABASE_URL || "file:./data/cargaflow.db").replace(/^file:/, ""));

const g = globalThis as unknown as { __db?: DB };
function make(): DB {
  const sqlite = new Database(file());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}
export const db: DB = g.__db ?? make();
if (process.env.NODE_ENV !== "production") g.__db = db;
export { schema };
