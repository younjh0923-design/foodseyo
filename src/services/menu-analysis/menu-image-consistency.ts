import type {
  AnalysisConsistencyVersionMetadata,
  DishConsistency,
  DishConsistencyWording,
} from "../../domain/foodseyo-analysis.ts";
import {
  normalizeDishConsistency,
  renderDishConsistencyWording,
  validateAnalysisConsistency,
  type ConsistencyIssue,
} from "../../lib/analysis-consistency/index.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";

export interface LiveDishConsistencyResult {
  readonly consistency: DishConsistency;
  readonly wording: DishConsistencyWording;
  readonly normalizedIssueCount: number;
  readonly degraded: boolean;
}

const blockingConsistencyError = (): MenuAnalysisError =>
  new MenuAnalysisError(
    "MODEL_OUTPUT_INVALID",
    "Menu provider output could not satisfy the consistency contract.",
    true,
  );

const hasTextureContradiction = (issues: readonly ConsistencyIssue[]): boolean =>
  issues.some((issue) => issue.code === "texture_contradiction");

export function finalizeLiveDishConsistency(
  input: unknown,
  versions: AnalysisConsistencyVersionMetadata,
): LiveDishConsistencyResult {
  const normalized = normalizeDishConsistency(input);
  let consistency: DishConsistency = {
    basicTastes: [...normalized.value.basicTastes],
    flavorNotes: [...normalized.value.flavorNotes],
    heatLevel: normalized.value.heatLevel,
    richnessLevel: normalized.value.richnessLevel,
    textures: [...normalized.value.textures],
    ingredients: [...normalized.value.ingredients],
  };
  const initialIssues = validateAnalysisConsistency({ versions, consistency });
  let finalIssues = initialIssues;
  let degraded = normalized.issues.length > 0;

  if (hasTextureContradiction(initialIssues)) {
    consistency = { ...consistency, textures: [] };
    degraded = true;
    finalIssues = validateAnalysisConsistency({ versions, consistency });
  }

  if (finalIssues.length > 0) throw blockingConsistencyError();

  return {
    consistency,
    wording: renderDishConsistencyWording(consistency),
    normalizedIssueCount: normalized.issues.length,
    degraded,
  };
}
