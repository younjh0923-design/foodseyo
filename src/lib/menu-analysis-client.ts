import type { FoodseyoAnalysis } from "../domain/foodseyo-analysis.ts";
import { MenuAnalysisApiResponseSchema } from "../services/menu-analysis/menu-analysis-api.ts";
import { MenuImagePreprocessingError } from "./menu-image-preprocessing.ts";
import {
  MENU_ANALYSIS_TIMEOUT_MESSAGE,
  type MenuAnalysisUiErrorKind,
} from "./menu-analysis-ui-state.ts";

export const SAFE_MENU_ANALYSIS_ERROR_MESSAGE =
  "We couldn't complete the menu analysis. Check your connection and try again.";

export interface MenuAnalysisResponseLike {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export class SafeMenuAnalysisClientError extends Error {
  readonly kind: Extract<MenuAnalysisUiErrorKind, "api" | "response">;

  constructor(
    message: string,
    kind: Extract<MenuAnalysisUiErrorKind, "api" | "response">,
  ) {
    super(message);
    this.kind = kind;
    this.name = "SafeMenuAnalysisClientError";
  }
}

export interface SafeMenuAnalysisFailure {
  readonly message: string;
  readonly errorKind: MenuAnalysisUiErrorKind;
}

export async function parseMenuAnalysisResponse(
  response: MenuAnalysisResponseLike,
): Promise<FoodseyoAnalysis> {
  const responseBody = await response.json().catch(() => null);
  const parsed = MenuAnalysisApiResponseSchema.safeParse(responseBody);
  if (!parsed.success || response.ok !== parsed.data.ok) {
    throw new SafeMenuAnalysisClientError(
      SAFE_MENU_ANALYSIS_ERROR_MESSAGE,
      "response",
    );
  }
  if (!parsed.data.ok) {
    throw new SafeMenuAnalysisClientError(parsed.data.error.message, "api");
  }
  if (parsed.data.analysis.status === "failed") {
    throw new SafeMenuAnalysisClientError(
      SAFE_MENU_ANALYSIS_ERROR_MESSAGE,
      "response",
    );
  }
  return parsed.data.analysis;
}

export function getSafeMenuAnalysisFailure(
  error: unknown,
  options: { readonly signalAborted: boolean; readonly timedOut: boolean },
): SafeMenuAnalysisFailure | null {
  if (options.timedOut) {
    return { message: MENU_ANALYSIS_TIMEOUT_MESSAGE, errorKind: "timeout" };
  }
  if (
    options.signalAborted ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  ) {
    return null;
  }
  if (error instanceof MenuImagePreprocessingError) {
    return { message: error.message, errorKind: "input" };
  }
  if (error instanceof SafeMenuAnalysisClientError) {
    return { message: error.message, errorKind: error.kind };
  }
  return {
    message: SAFE_MENU_ANALYSIS_ERROR_MESSAGE,
    errorKind: error instanceof TypeError ? "network" : "response",
  };
}

export function getSafeMenuAnalysisErrorMessage(
  error: unknown,
  signalAborted: boolean,
): string | null {
  return getSafeMenuAnalysisFailure(error, {
    signalAborted,
    timedOut: false,
  })?.message ?? null;
}
