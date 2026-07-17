import { readdir, readFile } from "node:fs/promises";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import {
  menuItemPricesDraft,
  menuItemsDraft,
  menuSectionsDraft,
  menuSnapshotsDraft,
  structuredMenuDraftTables,
} from "../src/lib/database/schema/structured-menu-draft.ts";
import {
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo structured menu schema draft validation",
  "Structured menu schema draft validation failed",
);
const networkGuard = installNetworkGuard(
  "Structured menu schema draft validation must not use the network.",
);

const configs = structuredMenuDraftTables.map((table) =>
  getTableConfig(table as PgTable),
);
const configByName = new Map(configs.map((config) => [config.name, config]));
const expectedTableNames = [
  "menu_item_prices",
  "menu_items",
  "menu_sections",
  "menu_snapshots",
] as const;

verify(
  configs.length === 4 &&
    [...configByName.keys()].sort().join(",") === expectedTableNames.join(","),
  "draft declares exactly the four approved structured-menu tables",
);

const expectedColumns = {
  menu_snapshots: [
    ["id", "uuid", true, true],
    ["analysis_snapshot_id", "uuid", true, false],
    ["projector_version", "text", true, false],
    ["title", "text", false, false],
    ["currency", "text", false, false],
    ["projected_at", "timestamp with time zone", true, true],
  ],
  menu_sections: [
    ["id", "uuid", true, true],
    ["menu_snapshot_id", "uuid", true, false],
    ["analysis_category_id", "text", true, false],
    ["position", "integer", true, false],
    ["label", "text", true, false],
  ],
  menu_items: [
    ["id", "uuid", true, true],
    ["menu_snapshot_id", "uuid", true, false],
    ["menu_section_id", "uuid", false, false],
    ["analysis_dish_id", "text", true, false],
    ["position", "integer", true, false],
    ["display_name", "text", true, false],
    ["original_name", "text", false, false],
    ["menu_description", "text", false, false],
  ],
  menu_item_prices: [
    ["id", "uuid", true, true],
    ["menu_item_id", "uuid", true, false],
    ["analysis_price_id", "text", false, false],
    ["position", "integer", true, false],
    ["price_kind", "text", true, false],
    ["context_label", "text", false, false],
    ["amount", "numeric", true, false],
    ["currency", "text", false, false],
    ["display_text", "text", true, false],
  ],
} as const;

for (const [tableName, expected] of Object.entries(expectedColumns)) {
  const columns = configByName.get(tableName)?.columns ?? [];
  verify(
    columns.length === expected.length &&
      columns.every((column, index) => {
        const [name, sqlType, notNull, hasDefault] = expected[index]!;
        return (
          column.name === name &&
          column.getSQLType() === sqlType &&
          column.notNull === notNull &&
          column.hasDefault === hasDefault
        );
      }),
    `${tableName} columns, types, nullability, and defaults match C2.2-B`,
  );
  verify(
    configByName.get(tableName)?.primaryKeys.length === 1 &&
      configByName.get(tableName)?.primaryKeys[0]?.getName() ===
        `${tableName}_pkey`,
    `${tableName} has the explicit UUID primary key`,
  );
}

const expectedUniqueConstraints = {
  menu_snapshots: {
    menu_snapshots_source_projector_uk:
      "analysis_snapshot_id,projector_version",
  },
  menu_sections: {
    menu_sections_category_uk: "menu_snapshot_id,analysis_category_id",
    menu_sections_position_uk: "menu_snapshot_id,position",
    menu_sections_snapshot_identity_uk: "id,menu_snapshot_id",
  },
  menu_items: {
    menu_items_dish_uk: "menu_snapshot_id,analysis_dish_id",
    menu_items_position_uk: "menu_snapshot_id,position",
  },
  menu_item_prices: {
    menu_item_prices_position_uk: "menu_item_id,position",
    menu_item_prices_analysis_price_uk: "menu_item_id,analysis_price_id",
  },
} as const;

for (const [tableName, expected] of Object.entries(
  expectedUniqueConstraints,
)) {
  const actual = Object.fromEntries(
    (configByName.get(tableName)?.uniqueConstraints ?? []).map((constraint) => [
      constraint.getName(),
      constraint.columns.map((column) => column.name).join(","),
    ]),
  );
  verify(
    JSON.stringify(actual, Object.keys(actual).sort()) ===
      JSON.stringify(expected, Object.keys(expected).sort()),
    `${tableName} candidate keys match the approved parent-scoped identities`,
  );
}

const expectedChecks = {
  menu_snapshots: [
    "menu_snapshots_projector_version_ck",
    "menu_snapshots_title_nonblank_ck",
    "menu_snapshots_currency_nonblank_ck",
  ],
  menu_sections: [
    "menu_sections_analysis_category_id_nonblank_ck",
    "menu_sections_position_nonnegative_ck",
    "menu_sections_label_nonblank_ck",
  ],
  menu_items: [
    "menu_items_analysis_dish_id_nonblank_ck",
    "menu_items_position_nonnegative_ck",
    "menu_items_display_name_nonblank_ck",
    "menu_items_original_name_nonblank_ck",
    "menu_items_menu_description_nonblank_ck",
  ],
  menu_item_prices: [
    "menu_item_prices_position_nonnegative_ck",
    "menu_item_prices_kind_ck",
    "menu_item_prices_amount_ck",
    "menu_item_prices_display_text_nonblank_ck",
    "menu_item_prices_currency_nonblank_ck",
    "menu_item_prices_kind_payload_ck",
  ],
} as const;

for (const [tableName, expected] of Object.entries(expectedChecks)) {
  const actual =
    configByName
      .get(tableName)
      ?.checks.map((constraint) => constraint.name)
      .sort() ?? [];
  verify(
    actual.join(",") === [...expected].sort().join(","),
    `${tableName} declares every reviewed CHECK constraint`,
  );
}

const foreignKeys = configs.flatMap((config) =>
  config.foreignKeys.map((foreignKey) => ({
    table: config.name,
    name: foreignKey.getName(),
    columns: foreignKey.reference().columns.map((column) => column.name),
    foreignTable: foreignKey.reference().foreignTable[Symbol.for("drizzle:Name")],
    foreignColumns: foreignKey
      .reference()
      .foreignColumns.map((column) => column.name),
    onDelete: foreignKey.onDelete,
    onUpdate: foreignKey.onUpdate,
  })),
);
const expectedForeignKeys = [
  [
    "menu_snapshots_analysis_snapshot_fk",
    "menu_snapshots",
    "analysis_snapshot_id",
    "analysis_snapshots",
    "id",
  ],
  [
    "menu_sections_menu_snapshot_fk",
    "menu_sections",
    "menu_snapshot_id",
    "menu_snapshots",
    "id",
  ],
  [
    "menu_items_menu_snapshot_fk",
    "menu_items",
    "menu_snapshot_id",
    "menu_snapshots",
    "id",
  ],
  [
    "menu_items_section_snapshot_fk",
    "menu_items",
    "menu_section_id,menu_snapshot_id",
    "menu_sections",
    "id,menu_snapshot_id",
  ],
  [
    "menu_item_prices_menu_item_fk",
    "menu_item_prices",
    "menu_item_id",
    "menu_items",
    "id",
  ],
] as const;

verify(
  foreignKeys.length === expectedForeignKeys.length &&
    expectedForeignKeys.every(
      ([name, table, columns, foreignTable, foreignColumns]) =>
        foreignKeys.some(
          (foreignKey) =>
            foreignKey.name === name &&
            foreignKey.table === table &&
            foreignKey.columns.join(",") === columns &&
            foreignKey.foreignTable === foreignTable &&
            foreignKey.foreignColumns.join(",") === foreignColumns &&
            foreignKey.onDelete === "restrict" &&
            foreignKey.onUpdate === "restrict",
        ),
    ),
  "all foreign keys have exact columns and ON DELETE/UPDATE RESTRICT actions",
);

const itemsIndexes = configByName.get("menu_items")?.indexes ?? [];
const sectionLookupIndex = itemsIndexes.find(
  (index) => index.config.name === "menu_items_section_lookup_ix",
);
verify(
  itemsIndexes.length === 1 &&
    sectionLookupIndex?.config.unique === false &&
    sectionLookupIndex.config.where !== undefined &&
    sectionLookupIndex.config.columns
      .map((column) => ("name" in column ? column.name : undefined))
      .join(",") === "menu_section_id,menu_snapshot_id,position",
  "menu_items has the reviewed partial section lookup index",
);

const priceIndexes = configByName.get("menu_item_prices")?.indexes ?? [];
const oneBaseIndex = priceIndexes.find(
  (index) => index.config.name === "menu_item_prices_one_base_ux",
);
verify(
  priceIndexes.length === 1 &&
    oneBaseIndex?.config.unique === true &&
    oneBaseIndex.config.where !== undefined,
  "menu_item_prices has one partial UNIQUE base-price index",
);
verify(
  configs.every((config) => !config.enableRLS && config.policies.length === 0),
  "draft declares no RLS policy for the non-user, non-tenant slice",
);

verify(
  menuSnapshotsDraft.analysisSnapshotId.notNull &&
    menuSectionsDraft.menuSnapshotId.notNull &&
    menuItemsDraft.menuSnapshotId.notNull &&
    !menuItemsDraft.menuSectionId.notNull &&
    menuItemPricesDraft.amount.getSQLType() === "numeric",
  "draft preserves source identity, nullable section membership, and exact numeric money",
);

const draftSource = await readFile(
  new URL(
    "../src/lib/database/schema/structured-menu-draft.ts",
    import.meta.url,
  ),
  "utf8",
);
const activeSchemaIndex = await readFile(
  new URL("../src/lib/database/schema/index.ts", import.meta.url),
  "utf8",
);
const drizzleConfig = await readFile(
  new URL("../drizzle.config.ts", import.meta.url),
  "utf8",
);
verify(
  draftSource.includes("C2.2-D DESIGN DRAFT ONLY") &&
    !activeSchemaIndex.includes("structured-menu-draft") &&
    drizzleConfig.includes(
      'schema: "./src/lib/database/schema/index.ts"',
    ),
  "draft is labeled and excluded from the active Drizzle schema export",
);

const migrationDirectory = new URL("../database/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationDirectory))
  .filter((path) => path.endsWith(".sql"))
  .sort();
verify(
  migrationFiles.join(",") === "0000_c2_1_b_analysis_cache_schema.sql",
  "C2.2-D creates no migration and leaves the C2.1 migration set unchanged",
);

const draftSql = await readFile(
  new URL(
    "../database/drafts/c2_2_d_structured_menu_projection.sql",
    import.meta.url,
  ),
  "utf8",
);
verify(
  draftSql.startsWith("-- C2.2-D REVIEW DRAFT ONLY. DO NOT EXECUTE.") &&
    draftSql.includes("intentionally outside database/migrations"),
  "SQL is prominently labeled as a non-executable review draft",
);
verify(
  [...draftSql.matchAll(/CREATE TABLE "public"\."([^"]+)"/gu)]
    .map((match) => match[1])
    .sort()
    .join(",") === expectedTableNames.join(","),
  "SQL draft creates exactly the four approved table names",
);
for (const [tableName, expected] of Object.entries(expectedColumns)) {
  const tableBody =
    draftSql.match(
      new RegExp(
        `CREATE TABLE "public"\\."${tableName}" \\(([\\s\\S]*?)\\r?\\n\\);`,
        "u",
      ),
    )?.[1] ?? "";
  const sqlColumns = [...tableBody.matchAll(/^\t"([a-z_]+)"\s/gmu)].map(
    (match) => match[1],
  );
  verify(
    sqlColumns.join(",") === expected.map(([name]) => name).join(","),
    `${tableName} SQL columns exactly match the Drizzle draft order`,
  );
}
const drizzleConstraintAndIndexNames = configs.flatMap((config) => [
  ...config.primaryKeys.map((constraint) => constraint.getName()),
  ...config.uniqueConstraints.map((constraint) => constraint.getName()),
  ...config.checks.map((constraint) => constraint.name),
  ...config.foreignKeys.map((constraint) => constraint.getName()),
  ...config.indexes.map((index) => index.config.name),
]);
verify(
  drizzleConstraintAndIndexNames.every(
    (name) => name !== undefined && draftSql.includes(`"${name}"`),
  ),
  "SQL draft contains every named Drizzle key, check, foreign key, and index",
);
verify(
  !/\b(?:ALTER|DROP|TRUNCATE|DELETE FROM|INSERT INTO)\s+"public"\."(?:analysis_contracts|menu_evidence_sets|analysis_runs|analysis_snapshots)"/iu.test(
    draftSql,
  ),
  "SQL draft does not alter or mutate a C2.1 table",
);
verify(
  !/\b(?:DROP|TRUNCATE|DELETE FROM|INSERT INTO)\b/iu.test(draftSql),
  "SQL draft contains no destructive statement or seed data",
);
verify(
  !/\b(?:CREATE\s+(?:TRIGGER|FUNCTION|PROCEDURE|POLICY)|ENABLE\s+ROW\s+LEVEL\s+SECURITY|EXCLUDE\s+USING|GENERATED\s+ALWAYS)\b/iu.test(
    draftSql,
  ),
  "SQL draft adds no trigger, stored routine, RLS, exclusion constraint, or generated column",
);
verify(
  expectedForeignKeys.every(([name]) =>
    draftSql.includes(`CONSTRAINT "${name}"`),
  ) &&
    (draftSql.match(/ON DELETE RESTRICT/gu)?.length ?? 0) === 5 &&
    (draftSql.match(/ON UPDATE RESTRICT/gu)?.length ?? 0) === 5,
  "SQL draft mirrors every restrictive foreign key",
);
verify(
  draftSql.includes(
    'CONSTRAINT "menu_items_section_snapshot_fk"',
  ) &&
    draftSql.includes(
      'FOREIGN KEY ("menu_section_id", "menu_snapshot_id")',
    ) &&
    draftSql.includes(
      'REFERENCES "public"."menu_sections" ("id", "menu_snapshot_id")',
    ),
  "SQL draft preserves same-snapshot section membership",
);
verify(
  draftSql.includes("'NaN'::numeric") &&
    draftSql.includes("'Infinity'::numeric") &&
    draftSql.includes("'-Infinity'::numeric") &&
    draftSql.includes(
      'CREATE UNIQUE INDEX "menu_item_prices_one_base_ux"',
    ),
  "SQL draft rejects non-finite money and permits at most one base price",
);
verify(
  draftSql.includes("REVOKE ALL PRIVILEGES ON TABLE") &&
    draftSql.includes("FROM PUBLIC") &&
    draftSql.includes('FROM "foodseyo_runtime"') &&
    draftSql.includes("GRANT SELECT, INSERT") &&
    !/GRANT\s+(?:UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)/iu.test(draftSql),
  "SQL draft grants runtime only SELECT and INSERT after explicit revocation",
);
verify(
  draftSql.includes(
    "Structured-menu DDL must run as foodseyo_migrator",
  ) &&
    draftSql.includes(
      "foodseyo_migrator lacks required public schema privileges",
    ) &&
    draftSql.includes(
      "foodseyo_runtime must not be a neon_superuser member",
    ),
  "SQL draft fails clearly when owner and least-privilege role prerequisites are not met",
);
verify(
  !/raw_image|base64|file_?name|image_hash|exif|provider_raw|menu_projection_attempts/iu.test(
    draftSource + draftSql,
  ),
  "draft adds no prohibited source payload or materialization-attempt storage",
);
verify(
  !/DATABASE_URL|DATABASE_MIGRATION_URL|postgres(?:ql)?:\/\//iu.test(
    draftSource + draftSql,
  ),
  "draft contains no connection variable, URL, or credential material",
);
verify(
  networkGuard.callCount === 0,
  "structured menu schema draft validation makes zero external network calls",
);
networkGuard.restore();

report();
