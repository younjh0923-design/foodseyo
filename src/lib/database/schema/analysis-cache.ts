import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const analysisContracts = pgTable(
  "analysis_contracts",
  {
    id: uuid("id").notNull().defaultRandom(),
    modelVersion: text("model_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    providerSchemaVersion: text("provider_schema_version").notNull(),
    canonicalSchemaVersion: text("canonical_schema_version").notNull(),
    consistencyProfileVersion: text("consistency_profile_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "analysis_contracts_pkey",
      columns: [table.id],
    }),
    unique("analysis_contracts_versions_uk").on(
      table.modelVersion,
      table.promptVersion,
      table.providerSchemaVersion,
      table.canonicalSchemaVersion,
      table.consistencyProfileVersion,
    ),
    check(
      "analysis_contracts_versions_nonblank_ck",
      sql`
        btrim(${table.modelVersion}) <> ''
        AND btrim(${table.promptVersion}) <> ''
        AND btrim(${table.providerSchemaVersion}) <> ''
        AND btrim(${table.canonicalSchemaVersion}) <> ''
        AND btrim(${table.consistencyProfileVersion}) <> ''
      `,
    ),
  ],
);

export const menuEvidenceSets = pgTable(
  "menu_evidence_sets",
  {
    id: uuid("id").notNull().defaultRandom(),
    inputKind: text("input_kind").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    fingerprintVersion: text("fingerprint_version").notNull(),
    imageCount: integer("image_count"),
    normalizedUrl: text("normalized_url"),
    sourceProvider: text("source_provider"),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "menu_evidence_sets_pkey",
      columns: [table.id],
    }),
    unique("menu_evidence_sets_identity_uk").on(
      table.sourceFingerprint,
      table.fingerprintVersion,
    ),
    check(
      "menu_evidence_sets_input_kind_ck",
      sql`
        ${table.inputKind} IN (
          'uploaded_menu_images',
          'official_menu_html',
          'official_menu_pdf',
          'online_ordering_menu',
          'listing_menu',
          'listing_menu_photo'
        )
      `,
    ),
    check(
      "menu_evidence_sets_source_fingerprint_nonblank_ck",
      sql`btrim(${table.sourceFingerprint}) <> ''`,
    ),
    check(
      "menu_evidence_sets_fingerprint_version_nonblank_ck",
      sql`btrim(${table.fingerprintVersion}) <> ''`,
    ),
    check(
      "menu_evidence_sets_image_count_ck",
      sql`${table.imageCount} IS NULL OR ${table.imageCount} > 0`,
    ),
    check(
      "menu_evidence_sets_normalized_url_nonblank_ck",
      sql`${table.normalizedUrl} IS NULL OR btrim(${table.normalizedUrl}) <> ''`,
    ),
    check(
      "menu_evidence_sets_source_provider_nonblank_ck",
      sql`${table.sourceProvider} IS NULL OR btrim(${table.sourceProvider}) <> ''`,
    ),
    check(
      "menu_evidence_sets_input_payload_ck",
      sql`
        (
          ${table.inputKind} = 'uploaded_menu_images'
          AND ${table.imageCount} IS NOT NULL
          AND ${table.normalizedUrl} IS NULL
        )
        OR
        (
          ${table.inputKind} <> 'uploaded_menu_images'
          AND ${table.normalizedUrl} IS NOT NULL
          AND btrim(${table.normalizedUrl}) <> ''
        )
      `,
    ),
  ],
);

export const analysisRuns = pgTable(
  "analysis_runs",
  {
    id: uuid("id").notNull().defaultRandom(),
    menuEvidenceSetId: uuid("menu_evidence_set_id").notNull(),
    analysisContractId: uuid("analysis_contract_id").notNull(),
    status: text("status").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    safeErrorCode: text("safe_error_code"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "analysis_runs_pkey",
      columns: [table.id],
    }),
    foreignKey({
      name: "analysis_runs_menu_evidence_set_fk",
      columns: [table.menuEvidenceSetId],
      foreignColumns: [menuEvidenceSets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "analysis_runs_analysis_contract_fk",
      columns: [table.analysisContractId],
      foreignColumns: [analysisContracts.id],
    }).onDelete("restrict"),
    unique("analysis_runs_attempt_uk").on(
      table.menuEvidenceSetId,
      table.analysisContractId,
      table.attemptNumber,
    ),
    unique("analysis_runs_snapshot_identity_uk").on(
      table.id,
      table.menuEvidenceSetId,
      table.analysisContractId,
    ),
    check(
      "analysis_runs_status_ck",
      sql`${table.status} IN ('processing', 'ready', 'failed')`,
    ),
    check(
      "analysis_runs_attempt_number_ck",
      sql`${table.attemptNumber} >= 1`,
    ),
    check(
      "analysis_runs_safe_error_code_nonblank_ck",
      sql`${table.safeErrorCode} IS NULL OR btrim(${table.safeErrorCode}) <> ''`,
    ),
    check(
      "analysis_runs_state_ck",
      sql`
        (
          ${table.status} = 'processing'
          AND ${table.leaseExpiresAt} IS NOT NULL
          AND ${table.finishedAt} IS NULL
          AND ${table.safeErrorCode} IS NULL
        )
        OR
        (
          ${table.status} = 'ready'
          AND ${table.leaseExpiresAt} IS NULL
          AND ${table.finishedAt} IS NOT NULL
          AND ${table.safeErrorCode} IS NULL
        )
        OR
        (
          ${table.status} = 'failed'
          AND ${table.leaseExpiresAt} IS NULL
          AND ${table.finishedAt} IS NOT NULL
          AND ${table.safeErrorCode} IS NOT NULL
          AND btrim(${table.safeErrorCode}) <> ''
        )
      `,
    ),
    check(
      "analysis_runs_finished_time_ck",
      sql`${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
    check(
      "analysis_runs_processing_lease_time_ck",
      sql`${table.status} <> 'processing' OR ${table.leaseExpiresAt} > ${table.startedAt}`,
    ),
    check(
      "analysis_runs_updated_time_ck",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    uniqueIndex("analysis_runs_one_processing_ux")
      .on(table.menuEvidenceSetId, table.analysisContractId)
      .where(sql`${table.status} = 'processing'`),
    index("analysis_runs_lookup_ix").on(
      table.menuEvidenceSetId,
      table.analysisContractId,
      table.status,
      table.createdAt.desc(),
    ),
  ],
);

export const analysisSnapshots = pgTable(
  "analysis_snapshots",
  {
    id: uuid("id").notNull().defaultRandom(),
    menuEvidenceSetId: uuid("menu_evidence_set_id").notNull(),
    analysisContractId: uuid("analysis_contract_id").notNull(),
    analysisRunId: uuid("analysis_run_id").notNull(),
    resultFingerprint: text("result_fingerprint").notNull(),
    canonicalResultJson: jsonb("canonical_result_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    safeInvalidationCode: text("safe_invalidation_code"),
  },
  (table) => [
    primaryKey({
      name: "analysis_snapshots_pkey",
      columns: [table.id],
    }),
    foreignKey({
      name: "analysis_snapshots_menu_evidence_set_fk",
      columns: [table.menuEvidenceSetId],
      foreignColumns: [menuEvidenceSets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "analysis_snapshots_analysis_contract_fk",
      columns: [table.analysisContractId],
      foreignColumns: [analysisContracts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "analysis_snapshots_run_evidence_contract_fk",
      columns: [
        table.analysisRunId,
        table.menuEvidenceSetId,
        table.analysisContractId,
      ],
      foreignColumns: [
        analysisRuns.id,
        analysisRuns.menuEvidenceSetId,
        analysisRuns.analysisContractId,
      ],
    }).onDelete("restrict"),
    check(
      "analysis_snapshots_result_fingerprint_nonblank_ck",
      sql`btrim(${table.resultFingerprint}) <> ''`,
    ),
    check(
      "analysis_snapshots_json_object_ck",
      sql`jsonb_typeof(${table.canonicalResultJson}) = 'object'`,
    ),
    check(
      "analysis_snapshots_expiry_time_ck",
      sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "analysis_snapshots_access_time_ck",
      sql`${table.lastAccessedAt} >= ${table.createdAt}`,
    ),
    check(
      "analysis_snapshots_invalidation_time_ck",
      sql`${table.invalidatedAt} IS NULL OR ${table.invalidatedAt} >= ${table.createdAt}`,
    ),
    check(
      "analysis_snapshots_invalidation_pair_ck",
      sql`
        (
          ${table.invalidatedAt} IS NULL
          AND ${table.safeInvalidationCode} IS NULL
        )
        OR
        (
          ${table.invalidatedAt} IS NOT NULL
          AND ${table.safeInvalidationCode} IS NOT NULL
        )
      `,
    ),
    check(
      "analysis_snapshots_safe_invalidation_code_nonblank_ck",
      sql`
        ${table.safeInvalidationCode} IS NULL
        OR btrim(${table.safeInvalidationCode}) <> ''
      `,
    ),
    index("analysis_snapshots_result_fingerprint_ix").on(
      table.resultFingerprint,
    ),
    uniqueIndex("analysis_snapshots_one_active_ux")
      .on(table.menuEvidenceSetId, table.analysisContractId)
      .where(sql`${table.invalidatedAt} IS NULL`),
  ],
);
