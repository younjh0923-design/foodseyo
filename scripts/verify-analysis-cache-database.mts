import assert from "node:assert/strict";

import { Client, type ClientConfig } from "pg";

const applicationTables = [
  "analysis_contracts",
  "menu_evidence_sets",
  "analysis_runs",
  "analysis_snapshots",
] as const;
const migrationTable = "__drizzle_migrations";
const expectedPublicTables = [...applicationTables, migrationTable].sort();
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
const expectedConstraintNames = [
  "analysis_contracts_pkey",
  "analysis_contracts_versions_nonblank_ck",
  "analysis_contracts_versions_uk",
  "menu_evidence_sets_pkey",
  "menu_evidence_sets_identity_uk",
  "menu_evidence_sets_input_kind_ck",
  "menu_evidence_sets_source_fingerprint_nonblank_ck",
  "menu_evidence_sets_fingerprint_version_nonblank_ck",
  "menu_evidence_sets_image_count_ck",
  "menu_evidence_sets_normalized_url_nonblank_ck",
  "menu_evidence_sets_source_provider_nonblank_ck",
  "menu_evidence_sets_input_payload_ck",
  "analysis_runs_pkey",
  "analysis_runs_menu_evidence_set_fk",
  "analysis_runs_analysis_contract_fk",
  "analysis_runs_attempt_uk",
  "analysis_runs_snapshot_identity_uk",
  "analysis_runs_status_ck",
  "analysis_runs_attempt_number_ck",
  "analysis_runs_safe_error_code_nonblank_ck",
  "analysis_runs_state_ck",
  "analysis_runs_finished_time_ck",
  "analysis_runs_processing_lease_time_ck",
  "analysis_runs_updated_time_ck",
  "analysis_snapshots_pkey",
  "analysis_snapshots_menu_evidence_set_fk",
  "analysis_snapshots_analysis_contract_fk",
  "analysis_snapshots_run_evidence_contract_fk",
  "analysis_snapshots_result_fingerprint_nonblank_ck",
  "analysis_snapshots_json_object_ck",
  "analysis_snapshots_expiry_time_ck",
  "analysis_snapshots_access_time_ck",
  "analysis_snapshots_invalidation_time_ck",
  "analysis_snapshots_invalidation_pair_ck",
  "analysis_snapshots_safe_invalidation_code_nonblank_ck",
].sort();
const expectedIndexNames = [
  "analysis_contracts_pkey",
  "analysis_contracts_versions_uk",
  "menu_evidence_sets_pkey",
  "menu_evidence_sets_identity_uk",
  "analysis_runs_pkey",
  "analysis_runs_attempt_uk",
  "analysis_runs_snapshot_identity_uk",
  "analysis_runs_one_processing_ux",
  "analysis_runs_lookup_ix",
  "analysis_snapshots_pkey",
  "analysis_snapshots_result_fingerprint_ix",
  "analysis_snapshots_one_active_ux",
].sort();
const expectedRuntimeUpdates = new Map([
  [
    "analysis_runs",
    [
      "finished_at",
      "lease_expires_at",
      "safe_error_code",
      "status",
      "updated_at",
    ],
  ],
  [
    "analysis_snapshots",
    ["invalidated_at", "last_accessed_at", "safe_invalidation_code"],
  ],
]);

type Mode = "preflight" | "development" | "isolation";
type Target = {
  label: "Development" | "Preview" | "Production";
  migrationEnvironmentName: string;
};

const modeArgument = process.argv.find((argument) =>
  argument.startsWith("--mode="),
);
const mode = modeArgument?.slice("--mode=".length) as Mode | undefined;
assert(
  mode === "preflight" || mode === "development" || mode === "isolation",
  "Use --mode=preflight, --mode=development, or --mode=isolation.",
);

function readConnection(environmentName: string): string {
  const value = process.env[environmentName]?.trim();
  assert(value, `${environmentName} is required.`);
  const parsed = new URL(value);
  assert(
    parsed.protocol === "postgres:" || parsed.protocol === "postgresql:",
    `${environmentName} must use PostgreSQL.`,
  );
  assert(
    ["require", "verify-ca", "verify-full"].includes(
      parsed.searchParams.get("sslmode") ?? "",
    ),
    `${environmentName} must require TLS.`,
  );
  return value;
}

function clientConfig(connectionString: string): ClientConfig {
  return {
    application_name: "foodseyo-c2.1-b-verification",
    connectionString,
  };
}

async function withClient<T>(
  environmentName: string,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(clientConfig(readConnection(environmentName)));
  try {
    await client.connect();
    return await operation(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function verifyTlsAndRole(client: Client): Promise<void> {
  const result = await client.query<{
    current_user: string;
  }>("SELECT current_user");
  assert.equal(result.rows[0]?.current_user, "foodseyo_migrator");
}

async function verifyAbsence(target: Target): Promise<void> {
  await withClient(target.migrationEnvironmentName, async (client) => {
    await client.query("BEGIN TRANSACTION READ ONLY");
    try {
      await verifyTlsAndRole(client);
      const transaction = await client.query<{ read_only: string }>(
        "SELECT current_setting('transaction_read_only') AS read_only",
      );
      assert.equal(transaction.rows[0]?.read_only, "on");

      const tables = await client.query<{ table_name: string }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
          ORDER BY table_name
        `,
        [applicationTables],
      );
      assert.deepEqual(tables.rows, []);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  console.log(
    JSON.stringify({
      target: target.label,
      currentUser: "foodseyo_migrator",
      tlsMode: "verify-full",
      transaction: "read-only",
      applicationTableCount: 0,
    }),
  );
}

async function verifyDevelopmentCatalog(): Promise<void> {
  await withClient(
    "FOODSEYO_DEVELOPMENT_MIGRATION_URL",
    async (client) => {
      await client.query("BEGIN TRANSACTION READ ONLY");
      try {
        await verifyTlsAndRole(client);

        const tables = await client.query<{ table_name: string }>(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);
        assert.deepEqual(
          tables.rows.map((row) => row.table_name),
          expectedPublicTables,
        );

        const columns = await client.query<{
          table_name: keyof typeof expectedColumns;
          column_name: string;
          data_type: string;
          udt_name: string;
          is_nullable: "YES" | "NO";
          column_default: string | null;
        }>(
          `
            SELECT
              table_name,
              column_name,
              data_type,
              udt_name,
              is_nullable,
              column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = ANY($1::text[])
            ORDER BY table_name, ordinal_position
          `,
          [applicationTables],
        );
        for (const [tableName, expected] of Object.entries(expectedColumns)) {
          const actual = columns.rows
            .filter((row) => row.table_name === tableName)
            .map((row) => row.column_name);
          assert.deepEqual(actual, expected);
        }
        assert(
          columns.rows
            .filter((column) => column.column_name === "id")
            .every(
              (column) =>
                column.udt_name === "uuid" &&
                column.is_nullable === "NO" &&
                column.column_default?.includes("gen_random_uuid()"),
            ),
        );
        assert(
          columns.rows
            .filter((column) => column.udt_name === "timestamptz")
            .every((column) => column.is_nullable === "YES" || column.is_nullable === "NO"),
        );
        assert.equal(
          columns.rows.find(
            (column) =>
              column.table_name === "analysis_snapshots" &&
              column.column_name === "canonical_result_json",
          )?.udt_name,
          "jsonb",
        );
        const prohibitedColumnPattern =
          /raw_image|base64|file_?name|image_hash|exif|menu_text|credential|password|token|provider_raw/iu;
        assert(
          columns.rows.every(
            (column) => !prohibitedColumnPattern.test(column.column_name),
          ),
        );
        assert(
          !columns.rows.some(
            (column) =>
              column.table_name === "analysis_snapshots" &&
              (column.column_name === "dish_count" ||
                column.column_name === "source_fingerprint"),
          ),
        );

        const constraints = await client.query<{
          conname: string;
          contype: string;
          condeferrable: boolean;
          convalidated: boolean;
          confdeltype: string;
          definition: string;
        }>(
          `
            SELECT
              constraint_record.conname,
              constraint_record.contype,
              constraint_record.condeferrable,
              constraint_record.convalidated,
              constraint_record.confdeltype,
              pg_get_constraintdef(constraint_record.oid) AS definition
            FROM pg_constraint AS constraint_record
            JOIN pg_class AS relation
              ON relation.oid = constraint_record.conrelid
            JOIN pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname = ANY($1::text[])
            ORDER BY constraint_record.conname
          `,
          [applicationTables],
        );
        assert.deepEqual(
          constraints.rows.map((constraint) => constraint.conname),
          expectedConstraintNames,
        );
        assert(
          constraints.rows.every(
            (constraint) =>
              constraint.convalidated && !constraint.condeferrable,
          ),
        );
        assert(
          constraints.rows
            .filter((constraint) => constraint.contype === "f")
            .every((constraint) => constraint.confdeltype === "r"),
        );
        const compositeForeignKey = constraints.rows.find(
          (constraint) =>
            constraint.conname ===
            "analysis_snapshots_run_evidence_contract_fk",
        );
        assert(
          compositeForeignKey?.definition.includes(
            "FOREIGN KEY (analysis_run_id, menu_evidence_set_id, analysis_contract_id)",
          ),
        );
        assert(
          compositeForeignKey?.definition.includes(
            "REFERENCES analysis_runs(id, menu_evidence_set_id, analysis_contract_id)",
          ),
        );

        const indexes = await client.query<{
          indexname: string;
          indexdef: string;
        }>(
          `
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = ANY($1::text[])
            ORDER BY indexname
          `,
          [applicationTables],
        );
        assert.deepEqual(
          indexes.rows.map((index) => index.indexname),
          expectedIndexNames,
        );
        const processingIndex = indexes.rows.find(
          (index) => index.indexname === "analysis_runs_one_processing_ux",
        );
        const activeSnapshotIndex = indexes.rows.find(
          (index) => index.indexname === "analysis_snapshots_one_active_ux",
        );
        const resultFingerprintIndex = indexes.rows.find(
          (index) =>
            index.indexname === "analysis_snapshots_result_fingerprint_ix",
        );
        assert(
          processingIndex?.indexdef.includes("CREATE UNIQUE INDEX") &&
            processingIndex.indexdef.includes("WHERE (status = 'processing'"),
        );
        assert(
          activeSnapshotIndex?.indexdef.includes("CREATE UNIQUE INDEX") &&
            activeSnapshotIndex.indexdef.includes(
              "WHERE (invalidated_at IS NULL)",
            ),
        );
        assert(
          resultFingerprintIndex?.indexdef.startsWith("CREATE INDEX") &&
            !resultFingerprintIndex.indexdef.includes("CREATE UNIQUE INDEX"),
        );

        const owners = await client.query<{
          relation_name: string;
          owner_name: string;
        }>(
          `
            SELECT
              relation.relname AS relation_name,
              pg_get_userbyid(relation.relowner) AS owner_name
            FROM pg_class AS relation
            JOIN pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relkind = 'r'
              AND relation.relname = ANY($1::text[])
            ORDER BY relation.relname
          `,
          [[...applicationTables, migrationTable]],
        );
        assert.equal(owners.rows.length, 5);
        assert(
          owners.rows.every(
            (relation) => relation.owner_name === "foodseyo_migrator",
          ),
        );

        const sequences = await client.query<{
          sequence_name: string;
          owner_name: string;
        }>(`
          SELECT
            relation.relname AS sequence_name,
            pg_get_userbyid(relation.relowner) AS owner_name
          FROM pg_class AS relation
          JOIN pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind = 'S'
          ORDER BY relation.relname
        `);
        assert.deepEqual(sequences.rows, [
          {
            sequence_name: "__drizzle_migrations_id_seq",
            owner_name: "foodseyo_migrator",
          },
        ]);
        const sequencePrivileges = await client.query<{
          runtime_privilege: boolean;
          public_privilege: boolean;
        }>(`
          SELECT
            has_sequence_privilege(
              'foodseyo_runtime',
              'public.__drizzle_migrations_id_seq',
              'USAGE, SELECT, UPDATE'
            ) AS runtime_privilege,
            EXISTS (
              SELECT 1
              FROM pg_class AS sequence_relation
              JOIN pg_namespace AS sequence_namespace
                ON sequence_namespace.oid = sequence_relation.relnamespace
              CROSS JOIN LATERAL aclexplode(
                COALESCE(
                  sequence_relation.relacl,
                  acldefault('S', sequence_relation.relowner)
                )
              ) AS sequence_acl
              WHERE sequence_namespace.nspname = 'public'
                AND sequence_relation.relname =
                  '__drizzle_migrations_id_seq'
                AND sequence_acl.grantee = 0
            ) AS public_privilege
        `);
        assert.deepEqual(sequencePrivileges.rows[0], {
          runtime_privilege: false,
          public_privilege: false,
        });

        const roles = await client.query<{
          rolname: string;
          rolsuper: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolreplication: boolean;
          rolbypassrls: boolean;
        }>(`
          SELECT
            rolname,
            rolsuper,
            rolcreatedb,
            rolcreaterole,
            rolreplication,
            rolbypassrls
          FROM pg_roles
          WHERE rolname IN ('foodseyo_runtime', 'foodseyo_migrator')
          ORDER BY rolname
        `);
        assert.equal(roles.rows.length, 2);
        assert(
          roles.rows.every(
            (role) =>
              !role.rolsuper &&
              !role.rolcreatedb &&
              !role.rolcreaterole &&
              !role.rolreplication &&
              !role.rolbypassrls,
          ),
        );

        const schemaPrivileges = await client.query<{
          runtime_usage: boolean;
          runtime_create: boolean;
          migrator_usage: boolean;
          migrator_create: boolean;
          runtime_admin_member: boolean;
        }>(`
          SELECT
            has_schema_privilege('foodseyo_runtime', 'public', 'USAGE')
              AS runtime_usage,
            has_schema_privilege('foodseyo_runtime', 'public', 'CREATE')
              AS runtime_create,
            has_schema_privilege('foodseyo_migrator', 'public', 'USAGE')
              AS migrator_usage,
            has_schema_privilege('foodseyo_migrator', 'public', 'CREATE')
              AS migrator_create,
            CASE
              WHEN to_regrole('neon_superuser') IS NULL THEN false
              ELSE pg_has_role(
                'foodseyo_runtime',
                'neon_superuser',
                'member'
              )
            END AS runtime_admin_member
        `);
        assert.deepEqual(schemaPrivileges.rows[0], {
          runtime_usage: true,
          runtime_create: false,
          migrator_usage: true,
          migrator_create: true,
          runtime_admin_member: false,
        });

        const runtimeTablePrivileges = await client.query<{
          table_name: string;
          privilege_type: string;
        }>(
          `
            SELECT table_name, privilege_type
            FROM information_schema.role_table_grants
            WHERE grantee = 'foodseyo_runtime'
              AND table_schema = 'public'
              AND table_name = ANY($1::text[])
            ORDER BY table_name, privilege_type
          `,
          [[...applicationTables, migrationTable]],
        );
        for (const tableName of applicationTables) {
          assert.deepEqual(
            runtimeTablePrivileges.rows
              .filter((privilege) => privilege.table_name === tableName)
              .map((privilege) => privilege.privilege_type),
            ["INSERT", "SELECT"],
          );
        }
        assert(
          !runtimeTablePrivileges.rows.some(
            (privilege) => privilege.table_name === migrationTable,
          ),
        );

        const updatePrivileges = await client.query<{
          table_name: string;
          column_name: string;
        }>(`
          SELECT table_name, column_name
          FROM information_schema.column_privileges
          WHERE grantee = 'foodseyo_runtime'
            AND table_schema = 'public'
            AND privilege_type = 'UPDATE'
          ORDER BY table_name, column_name
        `);
        assert.deepEqual(
          updatePrivileges.rows.map(
            (privilege) =>
              `${privilege.table_name}.${privilege.column_name}`,
          ),
          [...expectedRuntimeUpdates.entries()]
            .flatMap(([tableName, columnNames]) =>
              columnNames.map((columnName) => `${tableName}.${columnName}`),
            )
            .sort(),
        );

        const publicPrivileges = await client.query<{ privilege_count: number }>(
          `
            SELECT count(*)::integer AS privilege_count
            FROM information_schema.table_privileges
            WHERE grantee = 'PUBLIC'
              AND table_schema = 'public'
              AND table_name = ANY($1::text[])
          `,
          [[...applicationTables, migrationTable]],
        );
        assert.equal(publicPrivileges.rows[0]?.privilege_count, 0);

        for (const tableName of applicationTables) {
          const rowCount = await client.query<{ row_count: number }>(
            `SELECT count(*)::integer AS row_count FROM public.${tableName}`,
          );
          assert.equal(rowCount.rows[0]?.row_count, 0);
        }
        const ledger = await client.query<{ migration_count: number }>(
          `SELECT count(*)::integer AS migration_count
           FROM public.${migrationTable}`,
        );
        assert.equal(ledger.rows[0]?.migration_count, 1);
      } finally {
        await client.query("ROLLBACK");
      }
    },
  );

  await verifyRuntimeNegativeCapabilities();
  console.log(
    JSON.stringify({
      target: "Development",
      currentUser: "foodseyo_migrator",
      tlsMode: "verify-full",
      applicationTableCount: 4,
      migrationLedger: "public.__drizzle_migrations",
      appliedMigrationCount: 1,
      applicationRowCount: 0,
      runtimeCreate: false,
      runtimeDelete: false,
      runtimeImmutableUpdate: false,
      catalogVerification: "passed",
    }),
  );
}

async function expectInsufficientPrivilege(
  client: Client,
  statement: string,
): Promise<void> {
  await client.query("SAVEPOINT capability_probe");
  try {
    await client.query(statement);
    assert.fail("A prohibited runtime capability unexpectedly succeeded.");
  } catch (error) {
    assert.equal(
      (error as { code?: string }).code,
      "42501",
      "The prohibited runtime capability must fail for insufficient privilege.",
    );
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT capability_probe");
    await client.query("RELEASE SAVEPOINT capability_probe");
  }
}

async function verifyRuntimeNegativeCapabilities(): Promise<void> {
  await withClient(
    "FOODSEYO_DEVELOPMENT_RUNTIME_URL",
    async (client) => {
      const identity = await client.query<{ current_user: string }>(
        "SELECT current_user",
      );
      assert.deepEqual(identity.rows[0], {
        current_user: "foodseyo_runtime",
      });

      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT id FROM public.analysis_contracts WHERE false",
        );
        await client.query(
          "UPDATE public.analysis_runs SET status = status WHERE false",
        );
        await client.query(
          "UPDATE public.analysis_snapshots SET last_accessed_at = last_accessed_at WHERE false",
        );
        await expectInsufficientPrivilege(
          client,
          "CREATE TABLE public.foodseyo_c2_1_b_permission_probe (id integer)",
        );
        await expectInsufficientPrivilege(
          client,
          "DELETE FROM public.analysis_contracts WHERE false",
        );
        await expectInsufficientPrivilege(
          client,
          "UPDATE public.analysis_contracts SET model_version = model_version WHERE false",
        );
        await expectInsufficientPrivilege(
          client,
          "UPDATE public.analysis_runs SET attempt_number = attempt_number WHERE false",
        );
        await expectInsufficientPrivilege(
          client,
          "UPDATE public.analysis_snapshots SET canonical_result_json = canonical_result_json WHERE false",
        );
      } finally {
        await client.query("ROLLBACK");
      }
    },
  );
}

const targetsByMode: Record<Exclude<Mode, "development">, Target[]> = {
  preflight: [
    {
      label: "Development",
      migrationEnvironmentName: "FOODSEYO_DEVELOPMENT_MIGRATION_URL",
    },
    {
      label: "Preview",
      migrationEnvironmentName: "FOODSEYO_PREVIEW_MIGRATION_URL",
    },
    {
      label: "Production",
      migrationEnvironmentName: "FOODSEYO_PRODUCTION_MIGRATION_URL",
    },
  ],
  isolation: [
    {
      label: "Preview",
      migrationEnvironmentName: "FOODSEYO_PREVIEW_MIGRATION_URL",
    },
    {
      label: "Production",
      migrationEnvironmentName: "FOODSEYO_PRODUCTION_MIGRATION_URL",
    },
  ],
};

try {
  if (mode === "development") {
    await verifyDevelopmentCatalog();
  } else {
    for (const target of targetsByMode[mode]) {
      await verifyAbsence(target);
    }
  }
} catch (error) {
  const errorCode =
    error instanceof Error && "code" in error
      ? String((error as Error & { code?: unknown }).code ?? "unknown")
      : "unknown";
  const safeDetail =
    errorCode === "ERR_ASSERTION" && error instanceof Error
      ? ` ${error.message}`
      : "";
  console.error(
    `Database verification failed (code=${errorCode}).${safeDetail}`,
  );
  process.exitCode = 1;
}
