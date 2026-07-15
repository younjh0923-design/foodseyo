import {
  FoodseyoAnalysisPayloadSchema,
  type FoodseyoAnalysis,
} from "../../domain/foodseyo-analysis.ts";
import {
  AnalysisAbortedError,
  AnalysisIdGenerationError,
  AnalysisSemanticValidationError,
  AnalysisSerializationError,
  AnalysisStructuralValidationError,
} from "./analysis-errors.ts";
import type {
  AnalyzeFoodseyoOptions,
  AnalyzeFoodseyoRequest,
} from "./analysis-types.ts";
import { dispatchAnalysisRequest } from "./analyzers.ts";
import { createAnalysisEnvelope } from "./create-analysis-envelope.ts";
import { deriveAnalysisIssues, deriveAnalysisStatus } from "./derive-analysis-result.ts";
import { normalizeAnalysisPayloadCandidate } from "./normalize-analysis.ts";
import { validateAnalysisSemantics } from "./validate-analysis-semantics.ts";

const defaultCreateAnalysisId = (): string => {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new AnalysisIdGenerationError();
  }
  return globalThis.crypto.randomUUID();
};

export async function analyzeFoodseyoInput(
  request: AnalyzeFoodseyoRequest,
  options: AnalyzeFoodseyoOptions = {},
): Promise<FoodseyoAnalysis> {
  if (options.signal?.aborted) throw new AnalysisAbortedError();

  const draft = await dispatchAnalysisRequest(request, {
    signal: options.signal ?? null,
  });

  const normalizedCandidate = normalizeAnalysisPayloadCandidate(draft.payloadCandidate);
  const payloadResult = FoodseyoAnalysisPayloadSchema.safeParse(normalizedCandidate);
  if (!payloadResult.success) {
    throw new AnalysisStructuralValidationError(
      payloadResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    );
  }

  const payload = payloadResult.data;
  const semanticResult = validateAnalysisSemantics(payload);
  const status = deriveAnalysisStatus(draft, payload, semanticResult);
  if (semanticResult.errors.length > 0) {
    throw new AnalysisSemanticValidationError(semanticResult.errors);
  }

  const issues = deriveAnalysisIssues(
    payload,
    semanticResult.warnings,
    draft.operationalIssues,
    status,
    draft.degradedCapabilities,
  );

  const analysis = createAnalysisEnvelope(
    draft.inputContext,
    payload,
    status,
    issues,
    {
      createAnalysisId: options.createAnalysisId ?? defaultCreateAnalysisId,
      now: options.now ?? (() => new Date()),
    },
  );

  try {
    const serialized = JSON.stringify(analysis);
    if (typeof serialized !== "string") throw new AnalysisSerializationError();
  } catch (error) {
    if (error instanceof AnalysisSerializationError) throw error;
    throw new AnalysisSerializationError();
  }

  return analysis;
}
