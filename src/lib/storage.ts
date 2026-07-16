import {
  FOODSEYO_ANALYSIS_SUPPORTED_SCHEMA_VERSIONS,
  FoodseyoAnalysisSchema,
  type FoodseyoAnalysis,
} from "../domain/foodseyo-analysis.ts";
import { validateAnalysisSemantics } from "../services/analysis/validate-analysis-semantics.ts";

export const CURRENT_ANALYSIS_STORAGE_KEY = "foodseyo.currentAnalysis";

export function serializeCurrentAnalysis(analysis: FoodseyoAnalysis): string {
  return JSON.stringify(FoodseyoAnalysisSchema.parse(analysis));
}

export type CurrentAnalysisReadResult =
  | { readonly status: "success"; readonly analysis: FoodseyoAnalysis }
  | {
      readonly status:
        | "missing"
        | "invalid-json"
        | "invalid-schema"
        | "unsupported-version"
        | "failed-analysis"
        | "empty-menu"
        | "unavailable";
    };

export interface CurrentAnalysisStorageReader {
  getItem(key: string): string | null;
}

export interface CurrentAnalysisStorageWriter extends CurrentAnalysisStorageReader {
  setItem(key: string, value: string): void;
}

export interface CurrentAnalysisStorageRemover {
  removeItem(key: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseCurrentAnalysisStorageValue(
  value: string | null,
): CurrentAnalysisReadResult {
  if (value === null || value.trim().length === 0) return { status: "missing" };

  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    return { status: "invalid-json" };
  }

  if (
    isRecord(candidate) &&
    typeof candidate.schemaVersion === "string" &&
    !(FOODSEYO_ANALYSIS_SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(
      candidate.schemaVersion,
    )
  ) {
    return { status: "unsupported-version" };
  }

  const parsed = FoodseyoAnalysisSchema.safeParse(candidate);
  if (!parsed.success) return { status: "invalid-schema" };
  if (parsed.data.status === "failed") return { status: "failed-analysis" };
  if (!parsed.data.payload.menu?.dishes.length) return { status: "empty-menu" };
  if (validateAnalysisSemantics(parsed.data.payload).errors.length > 0) {
    return { status: "invalid-schema" };
  }

  return { status: "success", analysis: parsed.data };
}

export function parseStoredCurrentAnalysis(value: string | null): FoodseyoAnalysis | null {
  const result = parseCurrentAnalysisStorageValue(value);
  return result.status === "success" ? result.analysis : null;
}

export function readCurrentAnalysisResult(
  storage?: CurrentAnalysisStorageReader,
): CurrentAnalysisReadResult {
  try {
    const target =
      storage ?? (typeof window !== "undefined" ? window.sessionStorage : null);
    if (!target) return { status: "unavailable" };
    return parseCurrentAnalysisStorageValue(
      target.getItem(CURRENT_ANALYSIS_STORAGE_KEY),
    );
  } catch {
    return { status: "unavailable" };
  }
}

export function readCurrentAnalysis(): FoodseyoAnalysis | null {
  const result = readCurrentAnalysisResult();
  return result.status === "success" ? result.analysis : null;
}

export function writeCurrentAnalysis(analysis: FoodseyoAnalysis): void {
  window.sessionStorage.setItem(CURRENT_ANALYSIS_STORAGE_KEY, serializeCurrentAnalysis(analysis));
}

export function tryWriteCurrentAnalysis(
  analysis: FoodseyoAnalysis,
  storage?: CurrentAnalysisStorageWriter,
): boolean {
  try {
    const target =
      storage ?? (typeof window !== "undefined" ? window.sessionStorage : null);
    if (!target) return false;
    const serialized = serializeCurrentAnalysis(analysis);
    target.setItem(CURRENT_ANALYSIS_STORAGE_KEY, serialized);
    const confirmed = parseCurrentAnalysisStorageValue(
      target.getItem(CURRENT_ANALYSIS_STORAGE_KEY),
    );
    return (
      confirmed.status === "success" &&
      confirmed.analysis.analysisId === analysis.analysisId
    );
  } catch {
    return false;
  }
}

export function removeCurrentAnalysis(): void {
  window.sessionStorage.removeItem(CURRENT_ANALYSIS_STORAGE_KEY);
}

export function tryRemoveCurrentAnalysis(
  storage?: CurrentAnalysisStorageRemover,
): boolean {
  try {
    const target =
      storage ?? (typeof window !== "undefined" ? window.sessionStorage : null);
    if (!target) return false;
    target.removeItem(CURRENT_ANALYSIS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
