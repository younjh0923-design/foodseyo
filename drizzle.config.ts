import { defineConfig } from "drizzle-kit";

const migrationUrl = process.env.DATABASE_MIGRATION_URL?.trim();
const requiresDatabase = process.argv.includes("migrate");

if (requiresDatabase && !migrationUrl) {
  throw new Error(
    "DATABASE_MIGRATION_URL is required to run reviewed database migrations.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/database/schema/index.ts",
  out: "./database/migrations",
  migrations: {
    prefix: "index",
    schema: "public",
    table: "__drizzle_migrations",
  },
  strict: true,
  verbose: true,
  ...(migrationUrl ? { dbCredentials: { url: migrationUrl } } : {}),
});
