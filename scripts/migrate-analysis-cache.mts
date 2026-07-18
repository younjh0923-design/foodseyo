import assert from "node:assert/strict";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_MIGRATION_URL?.trim();
assert(
  connectionString,
  "DATABASE_MIGRATION_URL is required to run reviewed database migrations.",
);
const parsedConnection = new URL(connectionString);
assert(
  parsedConnection.protocol === "postgres:" ||
    parsedConnection.protocol === "postgresql:",
  "DATABASE_MIGRATION_URL must use PostgreSQL.",
);
assert(
  ["require", "verify-ca", "verify-full"].includes(
    parsedConnection.searchParams.get("sslmode") ?? "",
  ),
  "DATABASE_MIGRATION_URL must require TLS.",
);

const pool = new Pool({
  application_name: "foodseyo-reviewed-migration",
  connectionString,
  max: 1,
});

async function migrationCount(): Promise<number> {
  const existence = await pool.query<{ exists: boolean }>(
    `
      SELECT to_regclass('public.__drizzle_migrations') IS NOT NULL AS exists
    `,
  );
  if (!existence.rows[0]?.exists) return 0;

  const count = await pool.query<{ migration_count: number }>(`
    SELECT count(*)::integer AS migration_count
    FROM public.__drizzle_migrations
  `);
  return count.rows[0]?.migration_count ?? 0;
}

async function applyPendingMigrations(client: PoolClient): Promise<number> {
  const migrations = readMigrationFiles({
    migrationsFolder: "./database/migrations",
    migrationsSchema: "public",
    migrationsTable: "__drizzle_migrations",
  });

  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('foodseyo-reviewed-migrations', 0))",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.__drizzle_migrations (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);
    const latest = await client.query<{ created_at: string }>(`
      SELECT created_at
      FROM public.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const latestCreatedAt = latest.rows[0]
      ? Number(latest.rows[0].created_at)
      : undefined;
    const pending = migrations.filter(
      (migration) =>
        latestCreatedAt === undefined ||
        latestCreatedAt < migration.folderMillis,
    );

    for (const migration of pending) {
      for (const [statementIndex, statement] of migration.sql.entries()) {
        if (!statement.trim()) continue;
        try {
          await client.query(statement);
        } catch (error) {
          if (error instanceof Error) {
            Object.assign(error, { foodseyoStatementIndex: statementIndex });
          }
          throw error;
        }
      }
      await client.query(
        `
          INSERT INTO public.__drizzle_migrations (hash, created_at)
          VALUES ($1, $2)
        `,
        [migration.hash, migration.folderMillis],
      );
    }
    await client.query("COMMIT");
    return pending.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

try {
  const before = await migrationCount();
  const client = await pool.connect();
  let applied = 0;
  try {
    const prerequisites = await client.query<{
      current_user: string;
      schema_usage: boolean;
      schema_create: boolean;
    }>(`
      SELECT
        current_user,
        has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
        has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create
    `);
    assert.deepEqual(prerequisites.rows[0], {
      current_user: "foodseyo_migrator",
      schema_usage: true,
      schema_create: true,
    });
    applied = await applyPendingMigrations(client);
  } finally {
    client.release();
  }

  const after = await migrationCount();
  assert.equal(
    after,
    before + applied,
    "The migration ledger count does not match the applied migration count.",
  );
  console.log(
    JSON.stringify({
      migrationLedger: "public.__drizzle_migrations",
      before,
      after,
      applied,
    }),
  );
} catch (error) {
  let cause: unknown = error;
  while (
    cause instanceof Error &&
    "cause" in cause &&
    cause.cause instanceof Error
  ) {
    cause = cause.cause;
  }
  const errorCode =
    cause instanceof Error && "code" in cause
      ? String((cause as Error & { code?: unknown }).code ?? "unknown")
      : "unknown";
  const safeDetail =
    /^[0-9A-Z]{5}$/u.test(errorCode) && cause instanceof Error
      ? ` ${cause.message}`
      : "";
  const statementIndex =
    cause instanceof Error && "foodseyoStatementIndex" in cause
      ? ` statementIndex=${String(
          (cause as Error & { foodseyoStatementIndex?: unknown })
            .foodseyoStatementIndex,
        )}.`
      : "";
  console.error(
    `Migration failed (code=${errorCode}).${statementIndex}${safeDetail}`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
