export type MenuAnalysisErrorCode =
  | "OPENAI_NOT_CONFIGURED"
  | "OPENAI_MODEL_UNSUPPORTED"
  | "OPENAI_RATE_LIMITED"
  | "OPENAI_TIMEOUT"
  | "OPENAI_UNAVAILABLE"
  | "MODEL_REFUSAL"
  | "MODEL_OUTPUT_INCOMPLETE"
  | "MODEL_OUTPUT_INVALID"
  | "INVALID_SOURCE_IMAGE_INDEX"
  | "MENU_NOT_READABLE"
  | "MENU_DISHES_MISSING"
  | "CANONICAL_ADAPTER_FAILED";

export class MenuAnalysisError extends Error {
  readonly code: MenuAnalysisErrorCode;
  readonly retryable: boolean;

  constructor(code: MenuAnalysisErrorCode, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = "MenuAnalysisError";
  }
}
