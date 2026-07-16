import { ANALYSIS_CONSISTENCY_PROFILE_VERSION } from "./profile.ts";

export interface AnalysisConsistencyVersionMetadata {
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly consistencyProfileVersion: typeof ANALYSIS_CONSISTENCY_PROFILE_VERSION;
}

export interface AnalysisConsistencyVersionInput {
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
}

export const VERSION_TOKEN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/u;

const normalizeVersionToken = (value: string): string =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ");

export function createAnalysisConsistencyVersionMetadata(
  input: AnalysisConsistencyVersionInput,
): AnalysisConsistencyVersionMetadata {
  const modelVersion = normalizeVersionToken(input.modelVersion);
  const promptVersion = normalizeVersionToken(input.promptVersion);
  const schemaVersion = normalizeVersionToken(input.schemaVersion);

  if (
    !VERSION_TOKEN_PATTERN.test(modelVersion) ||
    !VERSION_TOKEN_PATTERN.test(promptVersion) ||
    !VERSION_TOKEN_PATTERN.test(schemaVersion)
  ) {
    throw new TypeError("Consistency version metadata contains an invalid token.");
  }

  return {
    modelVersion,
    promptVersion,
    schemaVersion,
    consistencyProfileVersion: ANALYSIS_CONSISTENCY_PROFILE_VERSION,
  };
}
