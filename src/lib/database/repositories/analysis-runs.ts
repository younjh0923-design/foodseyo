import type { AnalysisCacheQueryExecutor } from "../database-port.ts";
import {
  AnalysisCacheRepositoryError,
  AnalysisRunRecordSchema,
  CreateProcessingAnalysisRunInputSchema,
  MarkProcessingAnalysisRunFailedInputSchema,
  parseRepositoryValue,
  type AnalysisRunRecord,
  type CreateProcessingAnalysisRunInput,
  type MarkProcessingAnalysisRunFailedInput,
} from "./contracts.ts";

export const analysisRunSelectColumns = `
  id,
  menu_evidence_set_id AS "menuEvidenceSetId",
  analysis_contract_id AS "analysisContractId",
  status,
  attempt_number AS "attemptNumber",
  safe_error_code AS "safeErrorCode",
  started_at AS "startedAt",
  lease_expires_at AS "leaseExpiresAt",
  finished_at AS "finishedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export async function createProcessingAnalysisRun(
  executor: AnalysisCacheQueryExecutor,
  candidate: CreateProcessingAnalysisRunInput,
): Promise<AnalysisRunRecord> {
  const input = parseRepositoryValue(
    CreateProcessingAnalysisRunInputSchema,
    candidate,
    "INVALID_REPOSITORY_INPUT",
  );
  const result = await executor.query<AnalysisRunRecord>({
    name: "foodseyo-insert-processing-analysis-run",
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
      VALUES ($1, $2, $3, 'processing', $4, NULL, $5, $6, NULL, $5, $5)
      RETURNING ${analysisRunSelectColumns}
    `,
    values: [
      input.id,
      input.menuEvidenceSetId,
      input.analysisContractId,
      input.attemptNumber,
      input.startedAt,
      input.leaseExpiresAt,
    ],
  });
  const row = result.rows[0];
  if (!row) {
    throw new AnalysisCacheRepositoryError("ANALYSIS_RUN_NOT_FOUND");
  }
  const record = parseRepositoryValue(AnalysisRunRecordSchema, row);
  if (
    record.id !== input.id ||
    record.menuEvidenceSetId !== input.menuEvidenceSetId ||
    record.analysisContractId !== input.analysisContractId ||
    record.status !== "processing" ||
    record.attemptNumber !== input.attemptNumber
  ) {
    throw new AnalysisCacheRepositoryError("ANALYSIS_RUN_NOT_FOUND");
  }
  return record;
}

export async function findAnalysisRunById(
  executor: AnalysisCacheQueryExecutor,
  id: string,
): Promise<AnalysisRunRecord | null> {
  const parsedId = parseRepositoryValue(
    AnalysisRunRecordSchema.shape.id,
    id,
    "INVALID_REPOSITORY_INPUT",
  );
  const result = await executor.query<AnalysisRunRecord>({
    name: "foodseyo-select-analysis-run",
    text: `
      SELECT ${analysisRunSelectColumns}
      FROM public.analysis_runs
      WHERE id = $1
      LIMIT 1
    `,
    values: [parsedId],
  });
  const row = result.rows[0];
  return row ? parseRepositoryValue(AnalysisRunRecordSchema, row) : null;
}

export async function markProcessingAnalysisRunFailed(
  executor: AnalysisCacheQueryExecutor,
  candidate: MarkProcessingAnalysisRunFailedInput,
): Promise<AnalysisRunRecord> {
  const input = parseRepositoryValue(
    MarkProcessingAnalysisRunFailedInputSchema,
    candidate,
    "INVALID_REPOSITORY_INPUT",
  );
  const result = await executor.query<AnalysisRunRecord>({
    name: "foodseyo-fail-processing-analysis-run",
    text: `
      UPDATE public.analysis_runs
      SET status = 'failed',
          safe_error_code = $4,
          lease_expires_at = NULL,
          finished_at = $5,
          updated_at = $5
      WHERE id = $1
        AND menu_evidence_set_id = $2
        AND analysis_contract_id = $3
        AND status = 'processing'
        AND started_at <= $5
      RETURNING ${analysisRunSelectColumns}
    `,
    values: [
      input.id,
      input.menuEvidenceSetId,
      input.analysisContractId,
      input.safeErrorCode,
      input.failedAt,
    ],
  });
  const row = result.rows[0];
  if (!row) {
    throw new AnalysisCacheRepositoryError(
      "ANALYSIS_RUN_TRANSITION_CONFLICT",
    );
  }
  const record = parseRepositoryValue(AnalysisRunRecordSchema, row);
  if (
    record.id !== input.id ||
    record.menuEvidenceSetId !== input.menuEvidenceSetId ||
    record.analysisContractId !== input.analysisContractId ||
    record.status !== "failed" ||
    record.safeErrorCode !== input.safeErrorCode
  ) {
    throw new AnalysisCacheRepositoryError(
      "ANALYSIS_RUN_TRANSITION_CONFLICT",
    );
  }
  return record;
}
