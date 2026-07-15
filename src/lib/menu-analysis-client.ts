import type { FoodseyoAnalysis } from "../domain/foodseyo-analysis.ts";
import { MenuAnalysisApiResponseSchema } from "../services/menu-analysis/menu-analysis-api.ts";
import { MenuImagePreprocessingError } from "./menu-image-preprocessing.ts";

export const SAFE_MENU_ANALYSIS_ERROR_MESSAGE =
  "We couldn't complete the menu analysis. Check your connection and try again.";

export interface MenuAnalysisResponseLike {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export class SafeMenuAnalysisClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeMenuAnalysisClientError";
  }
}

export async function parseMenuAnalysisResponse(
  response: MenuAnalysisResponseLike,
): Promise<FoodseyoAnalysis> {
  const responseBody = await response.json().catch(() => null);
  const parsed = MenuAnalysisApiResponseSchema.safeParse(responseBody);
  if (!parsed.success || response.ok !== parsed.data.ok) {
    throw new SafeMenuAnalysisClientError(SAFE_MENU_ANALYSIS_ERROR_MESSAGE);
  }
  if (!parsed.data.ok) {
    throw new SafeMenuAnalysisClientError(parsed.data.error.message);
  }
  return parsed.data.analysis;
}

export function getSafeMenuAnalysisErrorMessage(
  error: unknown,
  signalAborted: boolean,
): string | null {
  if (
    signalAborted ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  ) {
    return null;
  }
  if (error instanceof MenuImagePreprocessingError) return error.message;
  if (error instanceof SafeMenuAnalysisClientError) return error.message;
  return SAFE_MENU_ANALYSIS_ERROR_MESSAGE;
}
