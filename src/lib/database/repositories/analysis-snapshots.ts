import { z } from "zod";

import type { AnalysisCacheQueryExecutor } from "../database-port.ts";
import { createSnapshotResultFingerprint } from "../../../services/menu-analysis/menu-cache-contract.ts";
import {
  ActiveSnapshotContextRowSchema,
  AnalysisCacheRepositoryError,
  assertCanonicalIdentity,
  parseCanonicalAnalysis,
  parseRepositoryValue,
  type ActiveSnapshotContextRow,
  type ValidatedAnalysisSnapshotRecord,
} from "./contracts.ts";

export const SAFE_SNAPSHOT_INVALIDATION_CODES = [
  "INVALID_DATABASE_ROW",
  "INVALID_CANONICAL_ANALYSIS",
  "CANONICAL_IDENTITY_MISMATCH",
  "SNAPSHOT_INTEGRITY_FAILURE",
  "SNAPSHOT_EXPIRED",
] as const;
export type SafeSnapshotInvalidationCode =
  (typeof SAFE_SNAPSHOT_INVALIDATION_CODES)[number];

const snapshotSelectColumns = `
  snapshot.id,
  snapshot.menu_evidence_set_id AS "menuEvidenceSetId",
  snapshot.analysis_contract_id AS "analysisContractId",
  snapshot.analysis_run_id AS "analysisRunId",
  snapshot.result_fingerprint AS "resultFingerprint",
  snapshot.canonical_result_json AS "canonicalResultJson",
  snapshot.created_at AS "createdAt",
  snapshot.last_accessed_at AS "lastAccessedAt",
  snapshot.expires_at AS "expiresAt",
  snapshot.invalidated_at AS "invalidatedAt",
  snapshot.safe_invalidation_code AS "safeInvalidationCode",
  evidence.source_fingerprint AS "sourceFingerprint",
  evidence.fingerprint_version AS "fingerprintVersion",
  contract.model_version AS "modelVersion",
  contract.prompt_version AS "promptVersion",
  contract.provider_schema_version AS "providerSchemaVersion",
  contract.canonical_schema_version AS "canonicalSchemaVersion",
  contract.consistency_profile_version AS "consistencyProfileVersion"
`;

const ActiveSnapshotIdentitySchema = z.strictObject({
  menuEvidenceSetId: z.string().uuid(),
  analysisContractId: z.string().uuid(),
});

const ActiveSnapshotInvalidationTargetSchema = z.object({
  id: z.string().uuid(),
  menuEvidenceSetId: z.string().uuid(),
  analysisContractId: z.string().uuid(),
});

const InvalidateActiveSnapshotInputSchema = z.strictObject({
  snapshotId: z.string().uuid(),
  menuEvidenceSetId: z.string().uuid(),
  analysisContractId: z.string().uuid(),
  invalidatedAt: z.date(),
  safeInvalidationCode: z.enum(SAFE_SNAPSHOT_INVALIDATION_CODES),
});

export type ActiveAnalysisSnapshotInspection =
  | { readonly state: "none" }
  | {
      readonly state: "valid";
      readonly snapshot: ValidatedAnalysisSnapshotRecord;
    }
  | {
      readonly state: "invalid";
      readonly snapshotId: string;
      readonly menuEvidenceSetId: string;
      readonly analysisContractId: string;
      readonly safeInvalidationCode: SafeSnapshotInvalidationCode;
    };

const toSafeInvalidationCode = (
  error: AnalysisCacheRepositoryError,
): SafeSnapshotInvalidationCode => {
  switch (error.code) {
    case "INVALID_DATABASE_ROW":
    case "INVALID_CANONICAL_ANALYSIS":
    case "CANONICAL_IDENTITY_MISMATCH":
    case "SNAPSHOT_INTEGRITY_FAILURE":
      return error.code;
    default:
      return "SNAPSHOT_INTEGRITY_FAILURE";
  }
};

export async function inspectActiveAnalysisSnapshot(
  executor: AnalysisCacheQueryExecutor,
  identity: {
    readonly menuEvidenceSetId: string;
    readonly analysisContractId: string;
  },
): Promise<ActiveAnalysisSnapshotInspection> {
  const ids = parseRepositoryValue(
    ActiveSnapshotIdentitySchema,
    identity,
    "INVALID_REPOSITORY_INPUT",
  );
  const result = await executor.query<ActiveSnapshotContextRow>({
    name: "foodseyo-select-active-analysis-snapshot",
    text: `
      SELECT ${snapshotSelectColumns}
      FROM public.analysis_snapshots AS snapshot
      JOIN public.menu_evidence_sets AS evidence
        ON evidence.id = snapshot.menu_evidence_set_id
      JOIN public.analysis_contracts AS contract
        ON contract.id = snapshot.analysis_contract_id
      WHERE snapshot.menu_evidence_set_id = $1
        AND snapshot.analysis_contract_id = $2
        AND snapshot.invalidated_at IS NULL
      ORDER BY snapshot.created_at DESC
      LIMIT 1
    `,
    values: [ids.menuEvidenceSetId, ids.analysisContractId],
  });
  const raw = result.rows[0];
  if (!raw) return { state: "none" };

  const target = parseRepositoryValue(
    ActiveSnapshotInvalidationTargetSchema,
    raw,
  );
  if (
    target.menuEvidenceSetId !== ids.menuEvidenceSetId ||
    target.analysisContractId !== ids.analysisContractId
  ) {
    throw new AnalysisCacheRepositoryError("SNAPSHOT_INTEGRITY_FAILURE");
  }

  try {
    const row = parseRepositoryValue(ActiveSnapshotContextRowSchema, raw);
    const canonicalResultJson = parseCanonicalAnalysis(
      row.canonicalResultJson,
    );
    assertCanonicalIdentity(canonicalResultJson, row);
    const resultFingerprint = await createSnapshotResultFingerprint(
      canonicalResultJson,
    );
    if (resultFingerprint !== row.resultFingerprint) {
      throw new AnalysisCacheRepositoryError("SNAPSHOT_INTEGRITY_FAILURE");
    }

    return {
      state: "valid",
      snapshot: {
        id: row.id,
        menuEvidenceSetId: row.menuEvidenceSetId,
        analysisContractId: row.analysisContractId,
        analysisRunId: row.analysisRunId,
        resultFingerprint: row.resultFingerprint,
        canonicalResultJson,
        createdAt: row.createdAt,
        lastAccessedAt: row.lastAccessedAt,
        expiresAt: row.expiresAt,
        invalidatedAt: row.invalidatedAt,
        safeInvalidationCode: row.safeInvalidationCode,
      },
    };
  } catch (error) {
    if (!(error instanceof AnalysisCacheRepositoryError)) throw error;
    return {
      state: "invalid",
      snapshotId: target.id,
      menuEvidenceSetId: target.menuEvidenceSetId,
      analysisContractId: target.analysisContractId,
      safeInvalidationCode: toSafeInvalidationCode(error),
    };
  }
}

export async function findActiveAnalysisSnapshot(
  executor: AnalysisCacheQueryExecutor,
  identity: {
    readonly menuEvidenceSetId: string;
    readonly analysisContractId: string;
  },
): Promise<ValidatedAnalysisSnapshotRecord | null> {
  const inspection = await inspectActiveAnalysisSnapshot(executor, identity);
  if (inspection.state === "none") return null;
  if (inspection.state === "invalid") {
    throw new AnalysisCacheRepositoryError(
      inspection.safeInvalidationCode,
    );
  }
  return inspection.snapshot;
}

export async function invalidateActiveAnalysisSnapshot(
  executor: AnalysisCacheQueryExecutor,
  candidate: {
    readonly snapshotId: string;
    readonly menuEvidenceSetId: string;
    readonly analysisContractId: string;
    readonly invalidatedAt?: Date;
    readonly safeInvalidationCode: SafeSnapshotInvalidationCode;
  },
): Promise<boolean> {
  const input = parseRepositoryValue(
    InvalidateActiveSnapshotInputSchema,
    {
      ...candidate,
      invalidatedAt: candidate.invalidatedAt ?? new Date(),
    },
    "INVALID_REPOSITORY_INPUT",
  );
  const result = await executor.query<{ readonly id: string }>({
    name: "foodseyo-invalidate-active-analysis-snapshot",
    text: `
      UPDATE public.analysis_snapshots
      SET invalidated_at = $4,
          safe_invalidation_code = $5
      WHERE id = $1
        AND menu_evidence_set_id = $2
        AND analysis_contract_id = $3
        AND invalidated_at IS NULL
      RETURNING id
    `,
    values: [
      input.snapshotId,
      input.menuEvidenceSetId,
      input.analysisContractId,
      input.invalidatedAt,
      input.safeInvalidationCode,
    ],
  });
  const row = result.rows[0];
  if (!row) return false;
  const returnedId = parseRepositoryValue(
    z.object({ id: z.string().uuid() }),
    row,
  ).id;
  return returnedId === input.snapshotId;
}

export async function touchActiveAnalysisSnapshot(
  executor: AnalysisCacheQueryExecutor,
  candidate: {
    readonly snapshotId: string;
    readonly menuEvidenceSetId: string;
    readonly analysisContractId: string;
    readonly accessedAt?: Date;
  },
): Promise<boolean> {
  const input = parseRepositoryValue(
    z.strictObject({
      snapshotId: z.string().uuid(),
      menuEvidenceSetId: z.string().uuid(),
      analysisContractId: z.string().uuid(),
      accessedAt: z.date(),
    }),
    {
      ...candidate,
      accessedAt: candidate.accessedAt ?? new Date(),
    },
    "INVALID_REPOSITORY_INPUT",
  );
  const result = await executor.query<{ readonly id: string }>({
    name: "foodseyo-touch-active-analysis-snapshot",
    text: `
      UPDATE public.analysis_snapshots
      SET last_accessed_at = GREATEST(last_accessed_at, $4)
      WHERE id = $1
        AND menu_evidence_set_id = $2
        AND analysis_contract_id = $3
        AND invalidated_at IS NULL
      RETURNING id
    `,
    values: [
      input.snapshotId,
      input.menuEvidenceSetId,
      input.analysisContractId,
      input.accessedAt,
    ],
  });
  const row = result.rows[0];
  if (!row) return false;
  return parseRepositoryValue(
    z.object({ id: z.string().uuid() }),
    row,
  ).id === input.snapshotId;
}
