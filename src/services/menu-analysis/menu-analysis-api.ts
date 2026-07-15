import { z } from "zod";
import { FoodseyoAnalysisSchema } from "../../domain/foodseyo-analysis.ts";

export const MENU_ANALYSIS_API_ERROR_CODES = [
  "INVALID_MULTIPART_REQUEST",
  "NO_IMAGES",
  "TOO_MANY_IMAGES",
  "UNSUPPORTED_IMAGE_TYPE",
  "IMAGE_CONTENT_TYPE_MISMATCH",
  "EMPTY_IMAGE",
  "IMAGE_TOO_LARGE",
  "TOTAL_UPLOAD_TOO_LARGE",
  "INVALID_RESTAURANT_NAME",
  "OPENAI_NOT_CONFIGURED",
  "OPENAI_RATE_LIMITED",
  "OPENAI_TIMEOUT",
  "OPENAI_UNAVAILABLE",
  "MODEL_REFUSAL",
  "MODEL_OUTPUT_INCOMPLETE",
  "MODEL_OUTPUT_INVALID",
  "MENU_NOT_READABLE",
  "ANALYSIS_VALIDATION_FAILED",
  "INTERNAL_ANALYSIS_ERROR",
] as const;

export const MenuAnalysisApiErrorCodeSchema = z.enum(MENU_ANALYSIS_API_ERROR_CODES);

export const MenuAnalysisApiSuccessSchema = z.strictObject({
  ok: z.literal(true),
  analysis: FoodseyoAnalysisSchema,
});

export const MenuAnalysisApiErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({
    code: MenuAnalysisApiErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
});

export const MenuAnalysisApiResponseSchema = z.discriminatedUnion("ok", [
  MenuAnalysisApiSuccessSchema,
  MenuAnalysisApiErrorSchema,
]);

export type MenuAnalysisApiErrorCode = z.infer<typeof MenuAnalysisApiErrorCodeSchema>;
export type MenuAnalysisApiSuccess = z.infer<typeof MenuAnalysisApiSuccessSchema>;
export type MenuAnalysisApiErrorResponse = z.infer<typeof MenuAnalysisApiErrorSchema>;
export type MenuAnalysisApiResponse = z.infer<typeof MenuAnalysisApiResponseSchema>;
