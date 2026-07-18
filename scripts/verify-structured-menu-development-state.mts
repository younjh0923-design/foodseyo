import assert from "node:assert/strict";

import { Pool, type PoolClient } from "pg";

import { createAnalysisCachePoolConfig } from "../src/lib/database/runtime-config.ts";

if (
  process.env.FOODSEYO_C2_3_PERMANENT_DEVELOPMENT_READ_ONLY !== "1"
) {
  throw new Error(
    "The permanent C2.3 Development check must be explicitly read-only.",
  );
}

const pool = new Pool(createAnalysisCachePoolConfig(process.env));
let client: PoolClient | undefined;

try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  const result = await client.query<{
    readonly currentUser: string;
    readonly applicationRowCount: number;
    readonly applicationTableCount: number;
    readonly structuredOwnerCount: number;
    readonly selectableStructuredTableCount: number;
    readonly insertableStructuredTableCount: number;
    readonly mutableStructuredTableCount: number;
    readonly runtimeCanCreateSchemaObjects: boolean;
    readonly runtimeCanReadMigrationLedger: boolean;
  }>({
    name: "foodseyo-c2-3-permanent-development-state",
    text: `
      WITH structured_tables(table_name) AS (
        VALUES
          ('menu_snapshots'::text),
          ('menu_sections'::text),
          ('menu_items'::text),
          ('menu_item_prices'::text)
      )
      SELECT
        current_user AS "currentUser",
        (
          (SELECT count(*) FROM public.analysis_contracts) +
          (SELECT count(*) FROM public.menu_evidence_sets) +
          (SELECT count(*) FROM public.analysis_runs) +
          (SELECT count(*) FROM public.analysis_snapshots) +
          (SELECT count(*) FROM public.menu_snapshots) +
          (SELECT count(*) FROM public.menu_sections) +
          (SELECT count(*) FROM public.menu_items) +
          (SELECT count(*) FROM public.menu_item_prices)
        )::integer AS "applicationRowCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_tables
          WHERE schemaname = 'public'
            AND tablename IN (
              'analysis_contracts',
              'menu_evidence_sets',
              'analysis_runs',
              'analysis_snapshots',
              'menu_snapshots',
              'menu_sections',
              'menu_items',
              'menu_item_prices'
            )
        ) AS "applicationTableCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_tables
          WHERE schemaname = 'public'
            AND tablename IN (SELECT table_name FROM structured_tables)
            AND tableowner = 'foodseyo_migrator'
        ) AS "structuredOwnerCount",
        (
          SELECT count(*)::integer
          FROM structured_tables
          WHERE has_table_privilege(
            current_user,
            format('public.%I', table_name),
            'SELECT'
          )
        ) AS "selectableStructuredTableCount",
        (
          SELECT count(*)::integer
          FROM structured_tables
          WHERE has_table_privilege(
            current_user,
            format('public.%I', table_name),
            'INSERT'
          )
        ) AS "insertableStructuredTableCount",
        (
          SELECT count(*)::integer
          FROM structured_tables
          WHERE has_table_privilege(
            current_user,
            format('public.%I', table_name),
            'UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
          )
        ) AS "mutableStructuredTableCount",
        has_schema_privilege(
          current_user,
          'public',
          'CREATE'
        ) AS "runtimeCanCreateSchemaObjects",
        has_table_privilege(
          current_user,
          'public.__drizzle_migrations',
          'SELECT'
        ) AS "runtimeCanReadMigrationLedger"
    `,
  });
  const stream = (
    client as unknown as {
      readonly connection?: {
        readonly stream?: { readonly encrypted?: boolean };
      };
    }
  ).connection?.stream;
  assert.deepEqual(result.rows[0], {
    currentUser: "foodseyo_runtime",
    applicationRowCount: 0,
    applicationTableCount: 8,
    structuredOwnerCount: 4,
    selectableStructuredTableCount: 4,
    insertableStructuredTableCount: 4,
    mutableStructuredTableCount: 0,
    runtimeCanCreateSchemaObjects: false,
    runtimeCanReadMigrationLedger: false,
  });
  assert.equal(stream?.encrypted, true);
  await client.query("ROLLBACK");
  console.log(
    JSON.stringify({
      target: "permanent Development branch",
      mode: "read-only transaction",
      currentUser: "foodseyo_runtime",
      connection: "pooled TLS",
      applicationTableCount: 8,
      applicationRowCount: 0,
      structuredTableOwner: "foodseyo_migrator",
      runtimePrivileges: ["SELECT", "INSERT"],
      prohibitedRuntimePrivileges: "absent",
      migrationLedgerAccess: "absent",
    }),
  );
} catch (error) {
  if (client) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original read-only verification failure.
    }
  }
  const code =
    error instanceof Error && "code" in error
      ? String((error as Error & { readonly code?: unknown }).code)
      : "unknown";
  console.error(
    `Permanent C2.3 Development verification failed (code=${code}).`,
  );
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
