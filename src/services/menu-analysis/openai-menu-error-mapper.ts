import OpenAI from "openai";
import { z } from "zod";
import { AnalysisAbortedError } from "../analysis/analysis-errors.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";

export function normalizeOpenAIMenuProviderError(
  error: unknown,
  signalAborted: boolean,
): MenuAnalysisError | AnalysisAbortedError {
  if (error instanceof MenuAnalysisError || error instanceof AnalysisAbortedError) {
    return error;
  }
  if (signalAborted || error instanceof OpenAI.APIUserAbortError) {
    return new AnalysisAbortedError();
  }
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError ||
    (error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403))
  ) {
    return new MenuAnalysisError(
      "OPENAI_AUTH_FAILED",
      "Menu analysis authentication or permission configuration failed.",
      false,
    );
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new MenuAnalysisError(
      "OPENAI_RATE_LIMITED",
      "Menu analysis is temporarily rate limited.",
      true,
    );
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new MenuAnalysisError("OPENAI_TIMEOUT", "Menu analysis timed out.", true);
  }
  if (
    error instanceof OpenAI.APIConnectionError ||
    (error instanceof OpenAI.APIError && (error.status ?? 0) >= 500)
  ) {
    return new MenuAnalysisError(
      "OPENAI_UNAVAILABLE",
      "Menu analysis is temporarily unavailable.",
      true,
    );
  }
  if (error instanceof z.ZodError) {
    return new MenuAnalysisError(
      "MODEL_OUTPUT_INVALID",
      "The model returned invalid structured menu data.",
      true,
    );
  }
  return new MenuAnalysisError(
    "OPENAI_UNAVAILABLE",
    "Menu analysis is temporarily unavailable.",
    true,
  );
}
