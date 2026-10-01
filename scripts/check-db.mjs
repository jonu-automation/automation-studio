import { createRequire } from "node:module";
import { mkdtemp, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "lib/db/package.json"));
const { PGlite } = require("@electric-sql/pglite");
const { drizzle } = require("drizzle-orm/pglite");
const { migrate } = require("drizzle-orm/pglite/migrator");
const temporary = await mkdtemp(path.join(tmpdir(), "automation-db-check-"));
const directory = path.join(temporary, "nested", "data");
await mkdir(directory, { recursive: true });
let client = new PGlite(directory);
try {
  await migrate(drizzle(client), { migrationsFolder: path.join(root, "lib/db/migrations") });
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  assert.equal(tables.rows.length, 7);
  await client.query("INSERT INTO users (id, email) VALUES ('verification-owner', 'verification@localhost')");
  await client.close();
  client = new PGlite(directory);
  await migrate(drizzle(client), { migrationsFolder: path.join(root, "lib/db/migrations") });
  const users = await client.query("SELECT id FROM users WHERE id = 'verification-owner'");
  assert.equal(users.rows.length, 1);
  console.log("PASS: first start, 7 tables, persisted data, repeat migration after restart.");
} finally {
  await client.close();
}
