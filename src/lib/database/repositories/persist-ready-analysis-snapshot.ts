import { z } from "zod";

import type { ConsistentFoodseyoAnalysis } from "../../../domain/foodseyo-analysis.ts";
import {
  ANALYSIS_RUN_LEASE_DURATION_MS,
  createSnapshotResultFingerprint,
} from "../../../services/menu-analysis/menu-cache-contract.ts";
import type {
  AnalysisCacheQueryExecutor,
  AnalysisCacheTransactionManager,
} from "../database-port.ts";
import { analysisRunSelectColumns } from "./analysis-runs.ts";
import {
  AnalysisCacheRepositoryError,
  AnalysisRunRecordSchema,
  AnalysisSnapshotRecordSchema,
  ProcessingRunContextRowSchema,
  assertCanonicalIdentity,
  parseCanonicalAnalysis,
  parseRepositoryValue,
  type AnalysisRunRecord,
  type AnalysisSnapshotRecord,
  type ProcessingRunContextRow,
  type ValidatedAnalysisSnapshotRecord,
} from "./contracts.ts";

const PersistReadyAnalysisSnapshotInputSchema = z
  .strictObject({
    analysisRunId: z.string().uuid(),
    menuEvidenceSetId: z.string().uuid(),
    analysisContractId: z.string().uuid(),
    canonicalResult: z.unknown(),
    persistedAt: z.date(),
    expiresAt: z.date().nullable(),
  })
  .refine(
    (value) =>
      value.expiresAt === null || value.expiresAt > value.persistedAt,
  );

export interface PersistReadyAnalysisSnapshotInput {
  readonly analysisRunId: string;
  readonly menuEvidenceSetId: string;
  readonly analysisContractId: string;
  readonly canonicalResult: unknown;
  readonly persistedAt?: Date;
  readonly expiresAt?: Date | null;
}

export interface PersistReadyAnalysisSnapshotResult {
  readonly analysisRun: AnalysisRunRecord;
  readonly snapshot: ValidatedAnalysisSnapshotRecord;
}

export type PersistUncachedReadyAnalysisSnapshotInput =
  PersistReadyAnalysisSnapshotInput;

export type PersistUncachedReadyAnalysisSnapshotResult =
  | { readonly state: "already_present" }
  | ({
      readonly state: "persisted";
    } & PersistReadyAnalysisSnapshotResult);

interface PreparedReadySnapshotPersistence {
  readonly input: z.infer<typeof PersistReadyAnalysisSnapshotInputSchema>;
  readonly canonicalResult: ConsistentFoodseyoAnalysis;
  readonly resultFingerprint: string;
}

const processingContextSelectColumns = `
  ${analysisRunSelectColumns
    .split("\n")
    .map((column) => (column.trim() ? `run_record.${column.trim()}` : column))
    .join("\n")},
  evidence.source_fingerprint AS "sourceFingerprint",
  evidence.fingerprint_version AS "fingerprintVersion",
  contract.model_version AS "modelVersion",
  contract.prompt_version AS "promptVersion",
  contract.provider_schema_version AS "providerSchemaVersion",
  contract.canonical_schema_version AS "canonicalSchemaVersion",
  contract.consistency_profile_version AS "consistencyProfileVersion"
`;

const snapshotReturningColumns = `
  id,
  menu_evidence_set_id AS "menuEvidenceSetId",
  analysis_contract_id AS "analysisContractId",
  analysis_run_id AS "analysisRunId",
  result_fingerprint AS "resultFingerprint",
  canonical_result_json AS "canonicalResultJson",
  created_at AS "createdAt",
  last_accessed_at AS "lastAccessedAt",
  expires_at AS "expiresAt",
  invalidated_at AS "invalidatedAt",
  safe_invalidation_code AS "safeInvalidationCode"
`;

const validatePersistenceIdentity = (
  canonicalResult: ConsistentFoodseyoAnalysis,
  context: ProcessingRunContextRow,
): void => {
  assertCanonicalIdentity(canonicalResult, {
    sourceFingerprint: context.sourceFingerprint,
    fingerprintVersion: context.fingerprintVersion,
    modelVersion: context.modelVersion,
    promptVersion: context.promptVersion,
    providerSchemaVersion: context.providerSchemaVersion,
    canonicalSchemaVersion: context.canonicalSchemaVersion,
    consistencyProfileVersion: context.consistencyProfileVersion,
  });
};

const prepareReadySnapshotPersistence = async (
  candidate: PersistReadyAnalysisSnapshotInput,
): Promise<PreparedReadySnapshotPersistence> => {
  const input = parseRepositoryValue(
    PersistReadyAnalysisSnapshotInputSchema,
    {
      ...candidate,
      persistedAt: candidate.persistedAt ?? new Date(),
      expiresAt: candidate.expiresAt ?? null,
    },
    "INVALID_REPOSITORY_INPUT",
  );
  const canonicalResult = parseCanonicalAnalysis(input.canonicalResult);
  const resultFingerprint = await createSnapshotResultFingerprint(
    canonicalResult,
  );
  return { input, canonicalResult, resultFingerprint };
};

const persistPreparedReadySnapshot = async (
  executor: AnalysisCacheQueryExecutor,
  prepared: PreparedReadySnapshotPersistence,
): Promise<PersistReadyAnalysisSnapshotResult> => {
    const { input, canonicalResult, resultFingerprint } = prepared;
    const contextResult = await executor.query<ProcessingRunContextRow>({
      name: "foodseyo-lock-processing-run-for-ready-snapshot",
      text: `
        SELECT ${processingContextSelectColumns}
        FROM public.analysis_runs AS run_record
        JOIN public.menu_evidence_sets AS evidence
          ON evidence.id = run_record.menu_evidence_set_id
        JOIN public.analysis_contracts AS contract
          ON contract.id = run_record.analysis_contract_id
        WHERE run_record.id = $1
          AND run_record.menu_evidence_set_id = $2
          AND run_record.analysis_contract_id = $3
          AND run_record.status = 'processing'
          AND run_record.started_at <= $4
          AND run_record.lease_expires_at > $4
        FOR UPDATE OF run_record
      `,
      values: [
        input.analysisRunId,
        input.menuEvidenceSetId,
        input.analysisContractId,
        input.persistedAt,
      ],
    });
    const contextRow = contextResult.rows[0];
    if (!contextRow) {
      throw new AnalysisCacheRepositoryError("PROCESSING_RUN_NOT_OWNED");
    }
    const context = parseRepositoryValue(
      ProcessingRunContextRowSchema,
      contextRow,
    );
    if (
      context.id !== input.analysisRunId ||
      context.menuEvidenceSetId !== input.menuEvidenceSetId ||
      context.analysisContractId !== input.analysisContractId ||
      context.status !== "processing"
    ) {
      throw new AnalysisCacheRepositoryError("PROCESSING_RUN_NOT_OWNED");
    }
    validatePersistenceIdentity(canonicalResult, context);

    const snapshotResult =
      await executor.query<AnalysisSnapshotRecord>({
        name: "foodseyo-insert-ready-analysis-snapshot",
        text: `
          INSERT INTO public.analysis_snapshots (
            menu_evidence_set_id,
            analysis_contract_id,
            analysis_run_id,
            result_fingerprint,
            canonical_result_json,
            created_at,
            last_accessed_at,
            expires_at,
            invalidated_at,
            safe_invalidation_code
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6, $7, NULL, NULL)
          RETURNING ${snapshotReturningColumns}
        `,
        values: [
          input.menuEvidenceSetId,
          input.analysisContractId,
          input.analysisRunId,
          resultFingerprint,
          canonicalResult,
          input.persistedAt,
          input.expiresAt,
        ],
      });
    const snapshotRow = snapshotResult.rows[0];
    if (!snapshotRow) {
      throw new AnalysisCacheRepositoryError(
        "SNAPSHOT_PERSISTENCE_CONFLICT",
      );
    }
    const snapshot = parseRepositoryValue(
      AnalysisSnapshotRecordSchema,
      snapshotRow,
    );
    if (
      snapshot.menuEvidenceSetId !== input.menuEvidenceSetId ||
      snapshot.analysisContractId !== input.analysisContractId ||
      snapshot.analysisRunId !== input.analysisRunId ||
      snapshot.resultFingerprint !== resultFingerprint
    ) {
      throw new AnalysisCacheRepositoryError(
        "SNAPSHOT_PERSISTENCE_CONFLICT",
      );
    }

    const runResult = await executor.query<AnalysisRunRecord>({
      name: "foodseyo-mark-analysis-run-ready",
      text: `
        UPDATE public.analysis_runs
        SET status = 'ready',
            safe_error_code = NULL,
            lease_expires_at = NULL,
            finished_at = $4,
            updated_at = $4
        WHERE id = $1
          AND menu_evidence_set_id = $2
          AND analysis_contract_id = $3
          AND status = 'processing'
          AND started_at <= $4
          AND lease_expires_at > $4
        RETURNING ${analysisRunSelectColumns}
      `,
      values: [
        input.analysisRunId,
        input.menuEvidenceSetId,
        input.analysisContractId,
        input.persistedAt,
      ],
    });
    const runRow = runResult.rows[0];
    if (!runRow) {
      throw new AnalysisCacheRepositoryError(
        "ANALYSIS_RUN_TRANSITION_CONFLICT",
      );
    }
    const analysisRun = parseRepositoryValue(
      AnalysisRunRecordSchema,
      runRow,
    );
    if (analysisRun.status !== "ready") {
      throw new AnalysisCacheRepositoryError(
        "ANALYSIS_RUN_TRANSITION_CONFLICT",
      );
    }
    if (
      analysisRun.id !== input.analysisRunId ||
      analysisRun.menuEvidenceSetId !== input.menuEvidenceSetId ||
      analysisRun.analysisContractId !== input.analysisContractId
    ) {
      throw new AnalysisCacheRepositoryError(
        "ANALYSIS_RUN_TRANSITION_CONFLICT",
      );
    }

    return {
      analysisRun,
      snapshot: {
        ...snapshot,
        canonicalResultJson: canonicalResult,
      },
    };
};

export async function persistReadyAnalysisSnapshot(
  database: AnalysisCacheTransactionManager,
  candidate: PersistReadyAnalysisSnapshotInput,
): Promise<PersistReadyAnalysisSnapshotResult> {
  const prepared = await prepareReadySnapshotPersistence(candidate);
  return database.withTransaction((executor) =>
    persistPreparedReadySnapshot(executor, prepared),
  );
}

export async function persistUncachedReadyAnalysisSnapshot(
  database: AnalysisCacheTransactionManager,
  candidate: PersistUncachedReadyAnalysisSnapshotInput,
): Promise<PersistUncachedReadyAnalysisSnapshotResult> {
  const prepared = await prepareReadySnapshotPersistence(candidate);
  const leaseExpiresAt = new Date(
    prepared.input.persistedAt.getTime() +
      ANALYSIS_RUN_LEASE_DURATION_MS,
  );

  return database.withTransaction(async (executor) => {
    const activeResult = await executor.query<{ readonly id: string }>({
      name: "foodseyo-select-active-snapshot-before-uncached-persistence",
      text: `
        SELECT id
        FROM public.analysis_snapshots
        WHERE menu_evidence_set_id = $1
          AND analysis_contract_id = $2
          AND invalidated_at IS NULL
        LIMIT 1
      `,
      values: [
        prepared.input.menuEvidenceSetId,
        prepared.input.analysisContractId,
      ],
    });
    if (activeResult.rows[0]) return { state: "already_present" };

    const processingResult = await executor.query<AnalysisRunRecord>({
      name: "foodseyo-insert-post-provider-processing-analysis-run",
      text: `
        INSERT INTO public.analysis_runs (
          id,
          menu_evidence_set_id,
          analysis_contract_id,
          status,
          attempt_number,
          safe_error_code,
          started_at,
          lease_expires_at,
          finished_at,
          created_at,
          updated_at
        )
        SELECT
          $1,
          $2,
          $3,
          'processing',
          COALESCE(MAX(attempt_number), 0) + 1,
          NULL,
          $4,
          $5,
          NULL,
          $4,
          $4
        FROM public.analysis_runs
        WHERE menu_evidence_set_id = $2
          AND analysis_contract_id = $3
        RETURNING ${analysisRunSelectColumns}
      `,
      values: [
        prepared.input.analysisRunId,
        prepared.input.menuEvidenceSetId,
        prepared.input.analysisContractId,
        prepared.input.persistedAt,
        leaseExpiresAt,
      ],
    });
    const processingRow = processingResult.rows[0];
    if (!processingRow) {
      throw new AnalysisCacheRepositoryError("ANALYSIS_RUN_NOT_FOUND");
    }
    const processingRun = parseRepositoryValue(
      AnalysisRunRecordSchema,
      processingRow,
    );
    if (
      processingRun.id !== prepared.input.analysisRunId ||
      processingRun.menuEvidenceSetId !==
        prepared.input.menuEvidenceSetId ||
      processingRun.analysisContractId !==
        prepared.input.analysisContractId ||
      processingRun.status !== "processing"
    ) {
      throw new AnalysisCacheRepositoryError("ANALYSIS_RUN_NOT_FOUND");
    }

    const result = await persistPreparedReadySnapshot(executor, prepared);
    return { state: "persisted", ...result };
  });
}
