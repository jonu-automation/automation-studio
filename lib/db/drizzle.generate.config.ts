import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  out: "./migrations",
});
