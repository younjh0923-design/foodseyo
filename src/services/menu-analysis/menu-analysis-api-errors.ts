import {
  AnalysisAbortedError,
  AnalysisEnvelopeValidationError,
  AnalysisSemanticValidationError,
  AnalysisStructuralValidationError,
} from "../analysis/analysis-errors.ts";
import type { MenuAnalysisApiErrorCode, MenuAnalysisApiErrorResponse } from "./menu-analysis-api.ts";
import { MenuAnalysisCachePublicError } from "./menu-analysis-exact-cache.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import { MenuUploadValidationError } from "./menu-upload-validation.ts";

export interface SafeMenuAnalysisError {
  readonly status: number;
  readonly body: MenuAnalysisApiErrorResponse;
  readonly retryAfterSeconds?: number;
}

const safeError = (
  status: number,
  code: MenuAnalysisApiErrorCode,
  message: string,
  retryable: boolean,
): SafeMenuAnalysisError => ({
  status,
  body: { ok: false, error: { code, message, retryable } },
});

export function mapMenuAnalysisError(error: unknown): SafeMenuAnalysisError {
  if (error instanceof MenuAnalysisCachePublicError) {
    return {
      ...safeError(
        error.result.httpStatus,
        error.result.code,
        error.message,
        error.result.retryable,
      ),
      ...("retryAfterSeconds" in error.result
        ? { retryAfterSeconds: error.result.retryAfterSeconds }
        : {}),
    };
  }
  if (error instanceof MenuUploadValidationError) {
    return safeError(error.status, error.code, error.message, false);
  }
  if (error instanceof AnalysisAbortedError) {
    return safeError(504, "OPENAI_TIMEOUT", "Menu analysis did not finish in time.", true);
  }
  if (
    error instanceof AnalysisStructuralValidationError ||
    error instanceof AnalysisSemanticValidationError ||
    error instanceof AnalysisEnvelopeValidationError
  ) {
    return safeError(
      502,
      "ANALYSIS_VALIDATION_FAILED",
      "The menu result could not be validated safely.",
      true,
    );
  }
  if (error instanceof MenuAnalysisError) {
    switch (error.code) {
      case "OPENAI_NOT_CONFIGURED":
      case "OPENAI_MODEL_UNSUPPORTED":
        return safeError(
          503,
          "OPENAI_NOT_CONFIGURED",
          "Menu analysis is not available on this deployment yet.",
          false,
        );
      case "OPENAI_AUTH_FAILED":
        return safeError(
          503,
          "OPENAI_AUTH_FAILED",
          "Menu analysis is not available on this deployment yet.",
          false,
        );
      case "OPENAI_RATE_LIMITED":
        return safeError(429, "OPENAI_RATE_LIMITED", "Menu analysis is busy. Try again shortly.", true);
      case "OPENAI_TIMEOUT":
        return safeError(504, "OPENAI_TIMEOUT", "Menu analysis took too long. Try again.", true);
      case "OPENAI_UNAVAILABLE":
        return safeError(502, "OPENAI_UNAVAILABLE", "Menu analysis is temporarily unavailable.", true);
      case "MODEL_REFUSAL":
        return safeError(422, "MODEL_REFUSAL", "These images could not be analyzed.", false);
      case "MODEL_OUTPUT_INCOMPLETE":
        return safeError(502, "MODEL_OUTPUT_INCOMPLETE", "Menu analysis ended before completion.", true);
      case "MENU_NOT_READABLE":
      case "MENU_DISHES_MISSING":
        return safeError(
          422,
          "MENU_NOT_READABLE",
          "We couldn’t read this menu clearly. Retake the photo with the text in focus.",
          false,
        );
      case "INVALID_MENU_IMAGE_INPUT":
        return safeError(
          400,
          "INVALID_MENU_IMAGE_INPUT",
          "The menu image input is invalid.",
          false,
        );
      case "TOO_MANY_MENU_IMAGES":
        return safeError(
          400,
          "TOO_MANY_IMAGES",
          "Choose no more than 10 menu images.",
          false,
        );
      case "MENU_IMAGE_BYTES_EXCEEDED":
        return safeError(
          413,
          "TOTAL_UPLOAD_TOO_LARGE",
          "These menu images are too large to analyze together.",
          false,
        );
      case "MODEL_OUTPUT_INVALID":
      case "INVALID_SOURCE_IMAGE_INDEX":
      case "CANONICAL_ADAPTER_FAILED":
        return safeError(
          502,
          "MODEL_OUTPUT_INVALID",
          "The menu result was incomplete or invalid. Try again.",
          true,
        );
    }
  }
  return safeError(
    500,
    "INTERNAL_ANALYSIS_ERROR",
    "Something went wrong while analyzing the menu.",
    false,
  );
}
