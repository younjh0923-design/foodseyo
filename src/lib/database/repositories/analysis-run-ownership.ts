import { z } from "zod";

import { ANALYSIS_RUN_LEASE_DURATION_MS } from "../../../services/menu-analysis/menu-cache-contract.ts";
import type {
  AnalysisCacheQueryExecutor,
  AnalysisCacheTransactionManager,
} from "../database-port.ts";
import {
  analysisRunSelectColumns,
  createProcessingAnalysisRun,
} from "./analysis-runs.ts";
import {
  AnalysisCacheRepositoryError,
  AnalysisRunRecordSchema,
  parseRepositoryValue,
  type AnalysisRunRecord,
} from "./contracts.ts";

export const EXPIRED_ANALYSIS_RUN_SAFE_ERROR_CODE =
  "LEASE_EXPIRED" as const;

const AnalysisRunOwnershipInputSchema = z.strictObject({
  proposedRunId: z.string().uuid(),
  menuEvidenceSetId: z.string().uuid(),
  analysisContractId: z.string().uuid(),
  acquiredAt: z.date(),
});

export interface AnalysisRunOwnershipInput {
  readonly proposedRunId: string;
  readonly menuEvidenceSetId: string;
  readonly analysisContractId: string;
  readonly acquiredAt: Date;
}

export type AnalysisRunOwnershipResult =
  | {
      readonly state: "owner";
      readonly analysisRun: AnalysisRunRecord;
      readonly recoveredExpiredRunId: string | null;
    }
  | {
      readonly state: "busy";
      readonly analysisRun: AnalysisRunRecord;
    };

export async function findProcessingAnalysisRunForIdentity(
  executor: AnalysisCacheQueryExecutor,
  input: {
    readonly menuEvidenceSetId: string;
    readonly analysisContractId: string;
  },
): Promise<AnalysisRunRecord | null> {
  const parsed = z
    .strictObject({
      menuEvidenceSetId: z.string().uuid(),
      analysisContractId: z.string().uuid(),
    })
    .safeParse(input);
  if (!parsed.success) {
    throw new AnalysisCacheRepositoryError("INVALID_REPOSITORY_INPUT");
  }
  const result = await executor.query<AnalysisRunRecord>({
    name: "foodseyo-select-processing-analysis-run-for-identity",
    text: `
      SELECT ${analysisRunSelectColumns}
      FROM public.analysis_runs
      WHERE menu_evidence_set_id = $1
        AND analysis_contract_id = $2
        AND status = 'processing'
      LIMIT 1
    `,
    values: [
      parsed.data.menuEvidenceSetId,
      parsed.data.analysisContractId,
    ],
  });
  const row = result.rows[0];
  return row ? parseRepositoryValue(AnalysisRunRecordSchema, row) : null;
}

const lockProcessingAnalysisRunForIdentity = async (
  executor: AnalysisCacheQueryExecutor,
  input: z.infer<typeof AnalysisRunOwnershipInputSchema>,
): Promise<AnalysisRunRecord | null> => {
  const result = await executor.query<AnalysisRunRecord>({
    name: "foodseyo-lock-processing-analysis-run-for-ownership",
    text: `
      SELECT ${analysisRunSelectColumns}
      FROM public.analysis_runs
      WHERE menu_evidence_set_id = $1
        AND analysis_contract_id = $2
        AND status = 'processing'
      LIMIT 1
      FOR UPDATE
    `,
    values: [input.menuEvidenceSetId, input.analysisContractId],
  });
  const row = result.rows[0];
  return row ? parseRepositoryValue(AnalysisRunRecordSchema, row) : null;
};

const findNextAttemptNumber = async (
  executor: AnalysisCacheQueryExecutor,
  input: z.infer<typeof AnalysisRunOwnershipInputSchema>,
): Promise<number> => {
  const result = await executor.query<{ readonly nextAttemptNumber: number }>({
    name: "foodseyo-select-next-analysis-run-attempt",
    text: `
      SELECT COALESCE(MAX(attempt_number), 0)::integer + 1
        AS "nextAttemptNumber"
      FROM public.analysis_runs
      WHERE menu_evidence_set_id = $1
        AND analysis_contract_id = $2
    `,
    values: [input.menuEvidenceSetId, input.analysisContractId],
  });
  return parseRepositoryValue(
    z.number().int().positive(),
    result.rows[0]?.nextAttemptNumber,
  );
};

const failExpiredProcessingRun = async (
  executor: AnalysisCacheQueryExecutor,
  input: z.infer<typeof AnalysisRunOwnershipInputSchema>,
  expiredRun: AnalysisRunRecord,
): Promise<void> => {
  const result = await executor.query<AnalysisRunRecord>({
    name: "foodseyo-fail-expired-processing-analysis-run",
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
        AND lease_expires_at <= $5
      RETURNING ${analysisRunSelectColumns}
    `,
    values: [
      expiredRun.id,
      input.menuEvidenceSetId,
      input.analysisContractId,
      EXPIRED_ANALYSIS_RUN_SAFE_ERROR_CODE,
      input.acquiredAt,
    ],
  });
  const row = result.rows[0];
  if (!row) {
    throw new AnalysisCacheRepositoryError(
      "ANALYSIS_RUN_TRANSITION_CONFLICT",
    );
  }
  const failed = parseRepositoryValue(AnalysisRunRecordSchema, row);
  if (
    failed.id !== expiredRun.id ||
    failed.status !== "failed" ||
    failed.safeErrorCode !== EXPIRED_ANALYSIS_RUN_SAFE_ERROR_CODE
  ) {
    throw new AnalysisCacheRepositoryError(
      "ANALYSIS_RUN_TRANSITION_CONFLICT",
    );
  }
};

export async function acquireAnalysisRunOwnership(
  database: AnalysisCacheTransactionManager,
  candidate: AnalysisRunOwnershipInput,
): Promise<AnalysisRunOwnershipResult> {
  const input = parseRepositoryValue(
    AnalysisRunOwnershipInputSchema,
    candidate,
    "INVALID_REPOSITORY_INPUT",
  );
  const leaseExpiresAt = new Date(
    input.acquiredAt.getTime() + ANALYSIS_RUN_LEASE_DURATION_MS,
  );

  return database.withTransaction(async (executor) => {
    const current = await lockProcessingAnalysisRunForIdentity(
      executor,
      input,
    );
    if (
      current?.leaseExpiresAt &&
      current.leaseExpiresAt > input.acquiredAt
    ) {
      return { state: "busy", analysisRun: current };
    }

    if (current) {
      await failExpiredProcessingRun(executor, input, current);
    }
    const attemptNumber = await findNextAttemptNumber(executor, input);
    const analysisRun = await createProcessingAnalysisRun(executor, {
      id: input.proposedRunId,
      menuEvidenceSetId: input.menuEvidenceSetId,
      analysisContractId: input.analysisContractId,
      attemptNumber,
      startedAt: input.acquiredAt,
      leaseExpiresAt,
    });
    return {
      state: "owner",
      analysisRun,
      recoveredExpiredRunId: current?.id ?? null,
    };
  });
}
