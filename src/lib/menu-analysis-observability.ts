import type { MenuAnalysisUiErrorKind } from "./menu-analysis-ui-state.ts";

export type MenuAnalysisClientStage =
  | "success"
  | "aborted"
  | "storage"
  | "navigation"
  | MenuAnalysisUiErrorKind;

export interface MenuAnalysisClientObservation {
  readonly referenceCode: string | null;
  readonly httpStatus: number | null;
  readonly clientPreprocessMs: number | null;
  readonly requestTotalMs: number | null;
  readonly responseByteLength: number | null;
  readonly clientParseValidationMs: number | null;
  readonly storageMs: number | null;
  readonly failureStageCode: MenuAnalysisClientStage;
  readonly structuralErrorCount: number;
  readonly semanticErrorCount: number;
}

export const roundedDuration = (startedAt: number, endedAt: number): number =>
  Math.max(0, Math.round(endedAt - startedAt));

export function logMenuAnalysisClientObservation(
  observation: MenuAnalysisClientObservation,
  logger: (label: string, value: MenuAnalysisClientObservation) => void = console.info,
): void {
  try {
    logger("[foodseyo-menu-analysis-client]", observation);
  } catch {
    // Observability must never change the user flow.
  }
}
