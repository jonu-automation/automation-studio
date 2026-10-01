import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleLocal } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const { Pool } = pg;

const localMode = process.env.LOCAL_MODE === "true";
if (localMode && process.env.NODE_ENV === "production") throw new Error("Local database is disabled in production.");
if (!localMode && !process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = localMode ? null : new Pool({ connectionString: process.env.DATABASE_URL });
const localDataDirectory = process.env.LOCAL_DATA_DIR ?? path.resolve(".local/data");
if (localMode) await mkdir(localDataDirectory, { recursive: true });
const embedded = localMode ? new PGlite(localDataDirectory) : null;
const localDb = embedded ? drizzleLocal(embedded, { schema }) : null;
if (localDb) {
  await migrate(localDb, { migrationsFolder: process.env.MIGRATIONS_DIR ?? path.resolve("lib/db/migrations") });
}
// Both adapters implement the same PostgreSQL query API and schema.
export const db = (localDb ?? drizzle(pool!, { schema })) as ReturnType<typeof drizzle<typeof schema>>;

export * from "./schema";
