import {
  FOODSEYO_ANALYSIS_LEGACY_SCHEMA_VERSION,
  FoodseyoAnalysisSchema,
  type AnalysisMetadata,
  type AnalysisIssue,
  type AnalysisStatus,
  type FoodseyoAnalysis,
  type FoodseyoAnalysisPayload,
  type FoodseyoAnalysisSchemaVersion,
  type InputContext,
} from "../../domain/foodseyo-analysis.ts";
import { AnalysisEnvelopeValidationError } from "./analysis-errors.ts";

export interface AnalysisEnvelopeDependencies {
  readonly createAnalysisId: () => string;
  readonly now: () => Date;
  readonly schemaVersion?: FoodseyoAnalysisSchemaVersion;
  readonly analysisMetadata?: AnalysisMetadata;
}

export function createAnalysisEnvelope(
  inputContext: InputContext,
  payload: FoodseyoAnalysisPayload,
  status: AnalysisStatus,
  issues: readonly AnalysisIssue[],
  dependencies: AnalysisEnvelopeDependencies,
): FoodseyoAnalysis {
  let generatedAt: string;
  try {
    generatedAt = dependencies.now().toISOString();
  } catch {
    throw new AnalysisEnvelopeValidationError([
      { path: ["generatedAt"], message: "Clock did not return a valid date." },
    ]);
  }

  const schemaVersion =
    dependencies.schemaVersion ?? FOODSEYO_ANALYSIS_LEGACY_SCHEMA_VERSION;
  const envelope = {
    schemaVersion,
    analysisId: dependencies.createAnalysisId(),
    generatedAt,
    status,
    inputContext,
    payload,
    issues,
    ...(schemaVersion !== FOODSEYO_ANALYSIS_LEGACY_SCHEMA_VERSION
      ? { analysisMetadata: dependencies.analysisMetadata }
      : {}),
  };
  const parsed = FoodseyoAnalysisSchema.safeParse(envelope);

  if (!parsed.success) {
    throw new AnalysisEnvelopeValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }

  return parsed.data;
}
