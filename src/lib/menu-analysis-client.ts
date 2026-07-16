import type { FoodseyoAnalysis } from "../domain/foodseyo-analysis.ts";
import {
  MENU_ANALYSIS_CORRELATION_HEADER,
  MenuAnalysisApiResponseSchema,
} from "../services/menu-analysis/menu-analysis-api.ts";
import { validateAnalysisSemantics } from "../services/analysis/validate-analysis-semantics.ts";
import { MenuImagePreprocessingError } from "./menu-image-preprocessing.ts";
import {
  MENU_ANALYSIS_TIMEOUT_MESSAGE,
  type MenuAnalysisUiErrorKind,
} from "./menu-analysis-ui-state.ts";

export const SAFE_MENU_ANALYSIS_ERROR_MESSAGE =
  "We couldn't reach the menu analysis service. Check your connection and try again.";
export const MENU_ANALYSIS_RESPONSE_BODY_MESSAGE =
  "The menu analysis response could not be read. Try again.";
export const MENU_ANALYSIS_RESPONSE_JSON_MESSAGE =
  "The menu analysis response was incomplete. Try again.";
export const MENU_ANALYSIS_RESPONSE_SCHEMA_MESSAGE =
  "The menu analysis response was not in the expected format. Try again.";
export const MENU_ANALYSIS_RESPONSE_MISMATCH_MESSAGE =
  "The menu analysis response was inconsistent. Try again.";
export const MENU_ANALYSIS_FAILED_STATUS_MESSAGE =
  "The menu analysis did not produce a usable result. Try again with a clearer image.";
export const MENU_ANALYSIS_EMPTY_MENU_MESSAGE =
  "No menu dishes were found. Try again with a clearer image.";
export const MENU_ANALYSIS_SEMANTIC_MESSAGE =
  "The menu analysis result could not be verified. Try again.";

interface MenuAnalysisResponseHeadersLike {
  get(name: string): string | null;
}

export interface MenuAnalysisResponseLike {
  readonly ok: boolean;
  readonly status?: number;
  readonly headers?: MenuAnalysisResponseHeadersLike;
  text(): Promise<string>;
}

export interface MenuAnalysisResponseObservation {
  readonly referenceCode: string | null;
  readonly httpStatus: number | null;
  readonly responseByteLength: number | null;
  readonly clientParseValidationMs: number | null;
  readonly failureStageCode:
    | "success"
    | "api"
    | "response_body"
    | "response_json"
    | "response_schema"
    | "response_mismatch"
    | "failed_analysis"
    | "empty_menu"
    | "semantic_validation";
  readonly structuralErrorCount: number;
  readonly semanticErrorCount: number;
}

export interface ParseMenuAnalysisResponseOptions {
  readonly now?: () => number;
  readonly observe?: (observation: MenuAnalysisResponseObservation) => void;
}

export class SafeMenuAnalysisClientError extends Error {
  readonly kind: Exclude<
    MenuAnalysisUiErrorKind,
    "input" | "network" | "timeout"
  >;
  readonly referenceCode: string | null;

  constructor(
    message: string,
    kind: Exclude<MenuAnalysisUiErrorKind, "input" | "network" | "timeout">,
    referenceCode: string | null,
  ) {
    super(message);
    this.kind = kind;
    this.referenceCode = referenceCode;
    this.name = "SafeMenuAnalysisClientError";
  }
}

export interface SafeMenuAnalysisFailure {
  readonly message: string;
  readonly errorKind: MenuAnalysisUiErrorKind;
  readonly referenceCode: string | null;
}

const toReferenceCode = (value: string | null): string | null => {
  if (!value || !/^[A-Za-z0-9-]{8,64}$/.test(value)) return null;
  const compact = value.replaceAll("-", "").slice(0, 8).toUpperCase();
  return compact.length === 8 ? compact : null;
};

export async function parseMenuAnalysisResponse(
  response: MenuAnalysisResponseLike,
  options: ParseMenuAnalysisResponseOptions = {},
): Promise<FoodseyoAnalysis> {
  const now = options.now ?? (() => performance.now());
  const referenceCode = toReferenceCode(
    response.headers?.get(MENU_ANALYSIS_CORRELATION_HEADER) ?? null,
  );
  const httpStatus = response.status ?? null;
  let responseByteLength: number | null = null;
  let parseStartedAt: number | null = null;
  const observe = (
    failureStageCode: MenuAnalysisResponseObservation["failureStageCode"],
    structuralErrorCount = 0,
    semanticErrorCount = 0,
  ): void => {
    if (!options.observe) return;
    try {
      options.observe({
        referenceCode,
        httpStatus,
        responseByteLength,
        clientParseValidationMs:
          parseStartedAt === null
            ? null
            : Math.max(0, Math.round(now() - parseStartedAt)),
        failureStageCode,
        structuralErrorCount,
        semanticErrorCount,
      });
    } catch {
      // Observability must never change response handling.
    }
  };
  let responseText: string;
  try {
    responseText = await response.text();
  } catch {
    observe("response_body");
    throw new SafeMenuAnalysisClientError(
      MENU_ANALYSIS_RESPONSE_BODY_MESSAGE,
      "response_body",
      referenceCode,
    );
  }
  responseByteLength = new TextEncoder().encode(responseText).byteLength;
  parseStartedAt = now();

  let responseBody: unknown;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    observe("response_json");
    throw new SafeMenuAnalysisClientError(
      MENU_ANALYSIS_RESPONSE_JSON_MESSAGE,
      "response_json",
      referenceCode,
    );
  }

  const parsed = MenuAnalysisApiResponseSchema.safeParse(responseBody);
  if (!parsed.success) {
    observe("response_schema", parsed.error.issues.length);
    throw new SafeMenuAnalysisClientError(
      MENU_ANALYSIS_RESPONSE_SCHEMA_MESSAGE,
      "response_schema",
      referenceCode,
    );
  }
  if (response.ok !== parsed.data.ok) {
    observe("response_mismatch");
    throw new SafeMenuAnalysisClientError(
      MENU_ANALYSIS_RESPONSE_MISMATCH_MESSAGE,
      "response_mismatch",
      referenceCode,
    );
  }
  if (!parsed.data.ok) {
    observe("api");
    throw new SafeMenuAnalysisClientError(
      parsed.data.error.message,
      "api",
      referenceCode,
    );
  }
  if (parsed.data.analysis.status === "failed") {
    observe("failed_analysis");
    throw new SafeMenuAnalysisClientError(
      MENU_ANALYSIS_FAILED_STATUS_MESSAGE,
      "failed_analysis",
      referenceCode,
    );
  }
  if (!parsed.data.analysis.payload.menu?.dishes.length) {
    observe("empty_menu");
    throw new SafeMenuAnalysisClientError(
      MENU_ANALYSIS_EMPTY_MENU_MESSAGE,
      "empty_menu",
      referenceCode,
    );
  }
  const semanticErrors = validateAnalysisSemantics(
    parsed.data.analysis.payload,
  ).errors;
  if (semanticErrors.length > 0) {
    observe("semantic_validation", 0, semanticErrors.length);
    throw new SafeMenuAnalysisClientError(
      MENU_ANALYSIS_SEMANTIC_MESSAGE,
      "semantic_validation",
      referenceCode,
    );
  }
  observe("success");
  return parsed.data.analysis;
}

export function getSafeMenuAnalysisFailure(
  error: unknown,
  options: { readonly signalAborted: boolean; readonly timedOut: boolean },
): SafeMenuAnalysisFailure | null {
  if (options.timedOut) {
    return {
      message: MENU_ANALYSIS_TIMEOUT_MESSAGE,
      errorKind: "timeout",
      referenceCode: null,
    };
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
    return { message: error.message, errorKind: "input", referenceCode: null };
  }
  if (error instanceof SafeMenuAnalysisClientError) {
    return {
      message: error.message,
      errorKind: error.kind,
      referenceCode: error.referenceCode,
    };
  }
  return {
    message:
      error instanceof TypeError
        ? SAFE_MENU_ANALYSIS_ERROR_MESSAGE
        : MENU_ANALYSIS_RESPONSE_BODY_MESSAGE,
    errorKind: error instanceof TypeError ? "network" : "response_body",
    referenceCode: null,
  };
}
