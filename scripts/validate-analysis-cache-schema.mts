import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import {
  analysisContracts,
  analysisRuns,
  analysisSnapshots,
  menuEvidenceSets,
} from "../src/lib/database/schema/index.ts";
import {
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo analysis cache schema validation",
  "Analysis cache schema validation failed",
);
const networkGuard = installNetworkGuard(
  "Analysis cache schema validation must not use the network.",
);

const tables = [
  analysisContracts,
  menuEvidenceSets,
  analysisRuns,
  analysisSnapshots,
] as const;
const configs = tables.map((table) => getTableConfig(table as PgTable));
const configByName = new Map(configs.map((config) => [config.name, config]));
const expectedTableNames = [
  "analysis_contracts",
  "analysis_runs",
  "analysis_snapshots",
  "menu_evidence_sets",
] as const;

verify(
  configs.length === 4 &&
    [...configByName.keys()].sort().join(",") === expectedTableNames.join(","),
  "Drizzle exports exactly the four C2.1-B application tables",
);

const expectedColumns = {
  analysis_contracts: [
    "id",
    "model_version",
    "prompt_version",
    "provider_schema_version",
    "canonical_schema_version",
    "consistency_profile_version",
    "created_at",
  ],
  menu_evidence_sets: [
    "id",
    "input_kind",
    "source_fingerprint",
    "fingerprint_version",
    "image_count",
    "normalized_url",
    "source_provider",
    "observed_at",
    "created_at",
  ],
  analysis_runs: [
    "id",
    "menu_evidence_set_id",
    "analysis_contract_id",
    "status",
    "attempt_number",
    "safe_error_code",
    "started_at",
    "lease_expires_at",
    "finished_at",
    "created_at",
    "updated_at",
  ],
  analysis_snapshots: [
    "id",
    "menu_evidence_set_id",
    "analysis_contract_id",
    "analysis_run_id",
    "result_fingerprint",
    "canonical_result_json",
    "created_at",
    "last_accessed_at",
    "expires_at",
    "invalidated_at",
    "safe_invalidation_code",
  ],
} as const;

for (const [tableName, columns] of Object.entries(expectedColumns)) {
  const config = configByName.get(tableName);
  verify(
    config?.columns.map((column) => column.name).join(",") === columns.join(","),
    `${tableName} has exactly the reviewed columns`,
  );
  verify(
    config?.primaryKeys.length === 1 &&
      config.primaryKeys[0]?.getName() === `${tableName}_pkey`,
    `${tableName} has its explicitly named UUID primary key`,
  );
}

const expectedChecks = {
  analysis_contracts: ["analysis_contracts_versions_nonblank_ck"],
  menu_evidence_sets: [
    "menu_evidence_sets_input_kind_ck",
    "menu_evidence_sets_source_fingerprint_nonblank_ck",
    "menu_evidence_sets_fingerprint_version_nonblank_ck",
    "menu_evidence_sets_image_count_ck",
    "menu_evidence_sets_normalized_url_nonblank_ck",
    "menu_evidence_sets_source_provider_nonblank_ck",
    "menu_evidence_sets_input_payload_ck",
  ],
  analysis_runs: [
    "analysis_runs_status_ck",
    "analysis_runs_attempt_number_ck",
    "analysis_runs_safe_error_code_nonblank_ck",
    "analysis_runs_state_ck",
    "analysis_runs_finished_time_ck",
    "analysis_runs_processing_lease_time_ck",
    "analysis_runs_updated_time_ck",
  ],
  analysis_snapshots: [
    "analysis_snapshots_result_fingerprint_nonblank_ck",
    "analysis_snapshots_json_object_ck",
    "analysis_snapshots_expiry_time_ck",
    "analysis_snapshots_access_time_ck",
    "analysis_snapshots_invalidation_time_ck",
    "analysis_snapshots_invalidation_pair_ck",
    "analysis_snapshots_safe_invalidation_code_nonblank_ck",
  ],
} as const;

for (const [tableName, checks] of Object.entries(expectedChecks)) {
  const actualChecks =
    configByName
      .get(tableName)
      ?.checks.map((constraint) => constraint.name)
      .sort() ?? [];
  verify(
    actualChecks.join(",") === [...checks].sort().join(","),
    `${tableName} declares every reviewed CHECK constraint`,
  );
}

verify(
  configByName
    .get("analysis_contracts")
    ?.uniqueConstraints.map((constraint) => constraint.name)
    .join(",") === "analysis_contracts_versions_uk",
  "analysis_contracts has only the five-version UNIQUE constraint",
);
verify(
  configByName
    .get("menu_evidence_sets")
    ?.uniqueConstraints.map((constraint) => constraint.name)
    .join(",") === "menu_evidence_sets_identity_uk",
  "menu_evidence_sets has only the source identity UNIQUE constraint",
);
verify(
  configByName
    .get("analysis_runs")
    ?.uniqueConstraints.map((constraint) => constraint.name)
    .sort()
    .join(",") ===
    ["analysis_runs_attempt_uk", "analysis_runs_snapshot_identity_uk"]
      .sort()
      .join(","),
  "analysis_runs declares attempt and snapshot-identity UNIQUE constraints",
);
verify(
  configByName.get("analysis_snapshots")?.uniqueConstraints.length === 0,
  "analysis_snapshots has no stale table-level evidence-contract UNIQUE",
);

const runsForeignKeys =
  configByName.get("analysis_runs")?.foreignKeys.map((foreignKey) => ({
    name: foreignKey.getName(),
    onDelete: foreignKey.onDelete,
    columns: foreignKey.reference().columns.map((column) => column.name),
    foreignColumns: foreignKey
      .reference()
      .foreignColumns.map((column) => column.name),
  })) ?? [];
verify(
  runsForeignKeys.length === 2 &&
    runsForeignKeys.every((foreignKey) => foreignKey.onDelete === "restrict"),
  "analysis_runs has two ON DELETE RESTRICT foreign keys",
);

const snapshotForeignKeys =
  configByName.get("analysis_snapshots")?.foreignKeys.map((foreignKey) => ({
    name: foreignKey.getName(),
    onDelete: foreignKey.onDelete,
    columns: foreignKey.reference().columns.map((column) => column.name),
    foreignColumns: foreignKey
      .reference()
      .foreignColumns.map((column) => column.name),
  })) ?? [];
const compositeSnapshotForeignKey = snapshotForeignKeys.find(
  (foreignKey) =>
    foreignKey.name === "analysis_snapshots_run_evidence_contract_fk",
);
verify(
  snapshotForeignKeys.length === 3 &&
    snapshotForeignKeys.every(
      (foreignKey) => foreignKey.onDelete === "restrict",
    ),
  "analysis_snapshots has three ON DELETE RESTRICT foreign keys",
);
verify(
  compositeSnapshotForeignKey?.columns.join(",") ===
    "analysis_run_id,menu_evidence_set_id,analysis_contract_id" &&
    compositeSnapshotForeignKey.foreignColumns.join(",") ===
      "id,menu_evidence_set_id,analysis_contract_id",
  "analysis_snapshots declares the run-evidence-contract composite foreign key",
);

const runIndexes = configByName.get("analysis_runs")?.indexes ?? [];
const oneProcessingIndex = runIndexes.find(
  (index) => index.config.name === "analysis_runs_one_processing_ux",
);
verify(
  oneProcessingIndex?.config.unique === true &&
    oneProcessingIndex.config.where !== undefined,
  "analysis_runs declares the partial one-processing-run UNIQUE index",
);
verify(
  runIndexes.some(
    (index) =>
      index.config.name === "analysis_runs_lookup_ix" &&
      !index.config.unique &&
      index.config.where === undefined,
  ),
  "analysis_runs declares the non-unique lookup index",
);

const snapshotIndexes = configByName.get("analysis_snapshots")?.indexes ?? [];
const resultFingerprintIndex = snapshotIndexes.find(
  (index) =>
    index.config.name === "analysis_snapshots_result_fingerprint_ix",
);
const oneActiveSnapshotIndex = snapshotIndexes.find(
  (index) => index.config.name === "analysis_snapshots_one_active_ux",
);
verify(
  resultFingerprintIndex?.config.unique === false &&
    resultFingerprintIndex.config.where === undefined,
  "analysis_snapshots result_fingerprint index is non-unique",
);
verify(
  oneActiveSnapshotIndex?.config.unique === true &&
    oneActiveSnapshotIndex.config.where !== undefined,
  "analysis_snapshots declares the partial one-active-snapshot UNIQUE index",
);

const snapshotColumnNames =
  configByName
    .get("analysis_snapshots")
    ?.columns.map((column) => column.name) ?? [];
verify(
  snapshotColumnNames.includes("invalidated_at") &&
    snapshotColumnNames.includes("safe_invalidation_code"),
  "analysis_snapshots includes both invalidation columns",
);
verify(
  !snapshotColumnNames.includes("dish_count") &&
    !snapshotColumnNames.includes("source_fingerprint"),
  "analysis_snapshots omits dish_count and duplicate source_fingerprint",
);

const futureTableNames = [
  "menu_observations",
  "observation_pages",
  "menu_item_occurrences",
  "menu_item_analyses",
  "dish_concepts",
  "restaurants",
  "restaurant_locations",
  "menu_documents",
  "menu_versions",
  "users",
] as const;
const schemaSource = await readFile(
  new URL("../src/lib/database/schema/analysis-cache.ts", import.meta.url),
  "utf8",
);
verify(
  futureTableNames.every((tableName) => !schemaSource.includes(`"${tableName}"`)),
  "Drizzle schema declares no future C2 or T7 table",
);

const migrationDirectory = new URL("../database/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationDirectory))
  .filter((path) => path.endsWith(".sql"))
  .sort();
verify(
  migrationFiles.join(",") === "0000_c2_1_b_analysis_cache_schema.sql",
  "exactly one reviewed C2.1-B SQL migration exists",
);
const migrationSql = await readFile(
  new URL(migrationFiles[0]!, migrationDirectory),
  "utf8",
);
verify(
  [...migrationSql.matchAll(/CREATE TABLE "([^"]+)"/gu)]
    .map((match) => match[1])
    .sort()
    .join(",") === expectedTableNames.join(","),
  "migration creates exactly the four reviewed application tables",
);
verify(
  !/\b(?:DROP|TRUNCATE|DELETE FROM|INSERT INTO)\b/iu.test(migrationSql),
  "migration contains no destructive DDL or seed data",
);
verify(
  futureTableNames.every(
    (tableName) => !migrationSql.includes(`"${tableName}"`),
  ),
  "migration creates no future C2 or T7 table",
);
verify(
  /CREATE UNIQUE INDEX "analysis_runs_one_processing_ux"[\s\S]+WHERE "analysis_runs"\."status" = 'processing'/u.test(
    migrationSql,
  ),
  "migration preserves the one-processing-run partial UNIQUE predicate",
);
verify(
  /CREATE UNIQUE INDEX "analysis_snapshots_one_active_ux"[\s\S]+WHERE "analysis_snapshots"\."invalidated_at" IS NULL/u.test(
    migrationSql,
  ),
  "migration preserves the active-snapshot partial UNIQUE predicate",
);
verify(
  /CREATE INDEX "analysis_snapshots_result_fingerprint_ix"/u.test(
    migrationSql,
  ) &&
    !/CREATE UNIQUE INDEX "analysis_snapshots_result_fingerprint_ix"/u.test(
      migrationSql,
    ),
  "migration keeps result_fingerprint non-unique",
);
const snapshotCreateSql =
  migrationSql.match(
    /CREATE TABLE "analysis_snapshots" \(([\s\S]*?)\r?\n\);/u,
  )?.[1] ?? "";
verify(
  !snapshotCreateSql.includes('"source_fingerprint"') &&
    !snapshotCreateSql.includes('"dish_count"'),
  "migration omits snapshot source_fingerprint and dish_count",
);
verify(
  migrationSql.includes(
    'CONSTRAINT "analysis_snapshots_run_evidence_contract_fk"',
  ) &&
    migrationSql.includes(
      'REFERENCES "public"."analysis_runs"("id","menu_evidence_set_id","analysis_contract_id") ON DELETE restrict',
    ),
  "migration includes the reviewed composite snapshot foreign key",
);
verify(
  migrationSql.includes("REVOKE ALL PRIVILEGES ON TABLE") &&
    migrationSql.includes("FROM PUBLIC") &&
    migrationSql.includes('FROM "foodseyo_runtime"'),
  "migration revokes unintended PUBLIC and runtime table privileges",
);
verify(
  migrationSql.includes(
    'GRANT UPDATE (\n\t"status",\n\t"safe_error_code",\n\t"lease_expires_at",\n\t"finished_at",\n\t"updated_at"\n)',
  ) &&
    migrationSql.includes(
      'GRANT UPDATE (\n\t"last_accessed_at",\n\t"invalidated_at",\n\t"safe_invalidation_code"\n)',
    ),
  "migration grants only the reviewed mutable columns",
);
verify(
  migrationSql.includes(
    "C2.1-B migration must run as foodseyo_migrator",
  ) &&
    migrationSql.includes(
      "foodseyo_runtime must not have CREATE on public schema",
    ),
  "migration fails clearly when role prerequisites are violated",
);
verify(
  !/raw_image|base64|file_?name|image_hash|exif|menu_text|provider_raw/iu.test(
    schemaSource + migrationSql,
  ),
  "schema persists no prohibited source or provider payload column",
);

const configSource = await readFile(
  new URL("../drizzle.config.ts", import.meta.url),
  "utf8",
);
verify(
  configSource.includes('schema: "public"') &&
    configSource.includes('table: "__drizzle_migrations"'),
  "Drizzle ledger is configured in the already authorized public schema",
);
verify(
  configSource.includes("process.env.DATABASE_MIGRATION_URL") &&
    configSource.includes("DATABASE_MIGRATION_URL is required") &&
    !/postgres(?:ql)?:\/\//iu.test(configSource),
  "Drizzle config requires the migration environment without a fallback URL",
);

const migrationRunnerSource = await readFile(
  new URL("./migrate-analysis-cache.mts", import.meta.url),
  "utf8",
);
verify(
  migrationRunnerSource.includes(
    'import { readMigrationFiles } from "drizzle-orm/migrator"',
  ) &&
    migrationRunnerSource.includes("public.__drizzle_migrations") &&
    migrationRunnerSource.includes("pg_advisory_xact_lock") &&
    migrationRunnerSource.includes('await client.query("BEGIN")') &&
    migrationRunnerSource.includes('await client.query("COMMIT")') &&
    migrationRunnerSource.includes('await client.query("ROLLBACK")'),
  "least-privilege runner uses Drizzle metadata, the public ledger, an advisory lock, and a transaction",
);
verify(
  migrationRunnerSource.includes("process.env.DATABASE_MIGRATION_URL") &&
    !migrationRunnerSource.includes("CREATE SCHEMA") &&
    !/postgres(?:ql)?:\/\//iu.test(migrationRunnerSource) &&
    !/dotenv/iu.test(migrationRunnerSource),
  "migration runner reads only the process environment and requires no database-level schema bootstrap",
);

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};
verify(
  packageJson.dependencies?.["drizzle-orm"] === "0.45.2" &&
    packageJson.dependencies.pg === "8.22.0" &&
    packageJson.devDependencies?.["drizzle-kit"] === "0.31.10" &&
    packageJson.devDependencies["@types/pg"] === "8.20.0",
  "database dependencies are the four reviewed exact versions",
);
verify(
  packageJson.scripts?.["db:migrate"]?.includes(
    "scripts/migrate-analysis-cache.mts",
  ) &&
    packageJson.scripts["validate:analysis-cache-schema"]?.includes(
      "scripts/validate-analysis-cache-schema.mts",
    ),
  "package commands select the reviewed migration and network-free validation entry points",
);
verify(
  [
    "@vercel/functions",
    "@neondatabase/serverless",
    "postgres",
    "prisma",
    "@prisma/client",
    "@supabase/supabase-js",
    "redis",
    "ioredis",
    "dotenv",
  ].every(
    (packageName) =>
      packageJson.dependencies?.[packageName] === undefined &&
      packageJson.devDependencies?.[packageName] === undefined,
  ),
  "no out-of-scope database, serverless, cache, or dotenv package was added",
);

const fingerprintFiles = [
  {
    path: new URL(
      "../src/lib/analysis-consistency/fingerprint.ts",
      import.meta.url,
    ),
    expected:
      "f40546c2ae0b1469ae6d0113ab9f146ec825193d3f5ce0b0259b2c7b87663ec0",
  },
  {
    path: new URL("../src/lib/analysis-consistency/index.ts", import.meta.url),
    expected:
      "fb33af768cbc81958cfc963d36170ad38f546e091bb7c6aa2be02c80f27cc1df",
  },
] as const;
for (const file of fingerprintFiles) {
  const digest = createHash("sha256")
    .update(await readFile(file.path))
    .digest("hex");
  verify(
    digest === file.expected,
    `${file.path.pathname.split("/").at(-1)} fingerprint contract is unchanged`,
  );
}

verify(
  networkGuard.callCount === 0,
  "analysis cache schema validation makes zero external network calls",
);
networkGuard.restore();

report();
