import {
  FOODSEYO_ANALYSIS_SCHEMA_VERSION,
  FoodseyoAnalysisSchema,
  type AnalysisIssue,
  type AnalysisStatus,
  type FoodseyoAnalysis,
  type FoodseyoAnalysisPayload,
  type InputContext,
} from "../../domain/foodseyo-analysis.ts";
import { AnalysisEnvelopeValidationError } from "./analysis-errors.ts";

export interface AnalysisEnvelopeDependencies {
  readonly createAnalysisId: () => string;
  readonly now: () => Date;
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

  const parsed = FoodseyoAnalysisSchema.safeParse({
    schemaVersion: FOODSEYO_ANALYSIS_SCHEMA_VERSION,
    analysisId: dependencies.createAnalysisId(),
    generatedAt,
    status,
    inputContext,
    payload,
    issues,
  });

  if (!parsed.success) {
    throw new AnalysisEnvelopeValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }

  return parsed.data;
}
