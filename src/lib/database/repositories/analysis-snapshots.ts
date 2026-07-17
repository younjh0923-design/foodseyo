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

export async function findActiveAnalysisSnapshot(
  executor: AnalysisCacheQueryExecutor,
  identity: {
    readonly menuEvidenceSetId: string;
    readonly analysisContractId: string;
  },
): Promise<ValidatedAnalysisSnapshotRecord | null> {
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
  if (!raw) return null;

  const row = parseRepositoryValue(ActiveSnapshotContextRowSchema, raw);
  if (
    row.menuEvidenceSetId !== ids.menuEvidenceSetId ||
    row.analysisContractId !== ids.analysisContractId
  ) {
    throw new AnalysisCacheRepositoryError("SNAPSHOT_INTEGRITY_FAILURE");
  }
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
  };
}
