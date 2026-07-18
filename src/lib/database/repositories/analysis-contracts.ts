import type { AnalysisCacheQueryExecutor } from "../database-port.ts";
import {
  AnalysisCacheRepositoryError,
  AnalysisContractIdentitySchema,
  AnalysisContractRecordSchema,
  parseRepositoryValue,
  type AnalysisContractIdentity,
  type AnalysisContractRecord,
} from "./contracts.ts";

const selectColumns = `
  id,
  model_version AS "modelVersion",
  prompt_version AS "promptVersion",
  provider_schema_version AS "providerSchemaVersion",
  canonical_schema_version AS "canonicalSchemaVersion",
  consistency_profile_version AS "consistencyProfileVersion",
  created_at AS "createdAt"
`;

export async function getOrCreateAnalysisContract(
  executor: AnalysisCacheQueryExecutor,
  candidate: AnalysisContractIdentity,
): Promise<AnalysisContractRecord> {
  const input = parseRepositoryValue(
    AnalysisContractIdentitySchema,
    candidate,
    "INVALID_REPOSITORY_INPUT",
  );
  const values = [
    input.modelVersion,
    input.promptVersion,
    input.providerSchemaVersion,
    input.canonicalSchemaVersion,
    input.consistencyProfileVersion,
  ];

  await executor.query({
    name: "foodseyo-insert-analysis-contract",
    text: `
      INSERT INTO public.analysis_contracts (
        model_version,
        prompt_version,
        provider_schema_version,
        canonical_schema_version,
        consistency_profile_version
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (
        model_version,
        prompt_version,
        provider_schema_version,
        canonical_schema_version,
        consistency_profile_version
      ) DO NOTHING
    `,
    values,
  });

  const result = await executor.query<AnalysisContractRecord>({
    name: "foodseyo-select-analysis-contract",
    text: `
      SELECT ${selectColumns}
      FROM public.analysis_contracts
      WHERE model_version = $1
        AND prompt_version = $2
        AND provider_schema_version = $3
        AND canonical_schema_version = $4
        AND consistency_profile_version = $5
      LIMIT 1
    `,
    values,
  });
  const row = result.rows[0];
  if (!row) {
    throw new AnalysisCacheRepositoryError(
      "ANALYSIS_CONTRACT_NOT_RESOLVED",
    );
  }
  const record = parseRepositoryValue(AnalysisContractRecordSchema, row);
  if (
    Object.entries(input).some(
      ([key, value]) =>
        record[key as keyof AnalysisContractIdentity] !== value,
    )
  ) {
    throw new AnalysisCacheRepositoryError(
      "ANALYSIS_CONTRACT_NOT_RESOLVED",
    );
  }
  return record;
}
