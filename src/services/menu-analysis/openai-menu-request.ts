import { zodTextFormat } from "openai/helpers/zod";
import type {
  ResponseInputImage,
  ResponseInputText,
} from "openai/resources/responses/responses";
import { MenuImageModelOutputSchema } from "./menu-image-model-schema.ts";
import {
  MENU_IMAGE_DEVELOPER_PROMPT,
  buildMenuImageUserPrompt,
} from "./menu-image-prompt.ts";
import type { MenuVisionProviderInput } from "./menu-vision-provider.ts";

export const ALLOWED_MENU_ANALYSIS_MODELS = [
  "gpt-5.6",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
] as const;

export const DEFAULT_MENU_ANALYSIS_MODEL = "gpt-5.6" as const;
export const MENU_ANALYSIS_REASONING_EFFORT = "low" as const;
export const MENU_ANALYSIS_MAX_OUTPUT_TOKENS = 12_000;
export const MENU_ANALYSIS_TIMEOUT_MS = 80_000;
export const MENU_ANALYSIS_MAX_RETRIES = 1;

export type MenuAnalysisModel = (typeof ALLOWED_MENU_ANALYSIS_MODELS)[number];

export function isMenuAnalysisModel(value: string): value is MenuAnalysisModel {
  return (ALLOWED_MENU_ANALYSIS_MODELS as readonly string[]).includes(value);
}

const toDataUrl = (mediaType: string, bytes: Uint8Array): string =>
  `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;

export function buildOpenAIMenuResponseRequest(
  input: MenuVisionProviderInput,
  model: MenuAnalysisModel,
) {
  const content: Array<ResponseInputText | ResponseInputImage> = [
    {
      type: "input_text",
      text: buildMenuImageUserPrompt(input.images.length, input.userEnteredRestaurantName),
    },
  ];

  for (const image of input.images) {
    content.push(
      { type: "input_text", text: `Image ${image.index}` },
      {
        type: "input_image",
        image_url: toDataUrl(image.mediaType, image.bytes),
        detail: "high",
      },
    );
  }

  return {
    model,
    instructions: MENU_IMAGE_DEVELOPER_PROMPT,
    input: [{ role: "user" as const, content }],
    text: {
      format: zodTextFormat(MenuImageModelOutputSchema, "foodseyo_menu_image_analysis"),
    },
    reasoning: { effort: MENU_ANALYSIS_REASONING_EFFORT },
    max_output_tokens: MENU_ANALYSIS_MAX_OUTPUT_TOKENS,
    store: false,
  };
}
