import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/postgres/schema.ts",
  out: "./src/db/postgres/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://pulsenode:pulsenode_dev@localhost:5432/pulsenode_dev",
  },
});
