import "server-only";

import OpenAI from "openai";
import { AnalysisAbortedError } from "../analysis/analysis-errors.ts";
import {
  createMenuAnalysisServerConfig,
  readMenuAnalysisServerConfig,
} from "./menu-analysis-config.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import { MenuImageModelOutputSchema } from "./menu-image-model-schema.ts";
import { normalizeOpenAIMenuProviderError } from "./openai-menu-error-mapper.ts";
import type { MenuVisionProvider } from "./menu-vision-provider.ts";
import {
  MENU_ANALYSIS_MAX_RETRIES,
  MENU_ANALYSIS_TIMEOUT_MS,
  buildOpenAIMenuResponseRequest,
  type MenuAnalysisModel,
} from "./openai-menu-request.ts";

const responseRefusal = (response: Awaited<ReturnType<OpenAI["responses"]["parse"]>>) => {
  for (const output of response.output) {
    if (output.type !== "message") continue;
    for (const content of output.content) {
      if (content.type === "refusal") return content.refusal;
    }
  }
  return null;
};

export function createOpenAIMenuVisionProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  resolvedModel?: MenuAnalysisModel,
): MenuVisionProvider {
  const config = resolvedModel
    ? createMenuAnalysisServerConfig(environment, resolvedModel)
    : readMenuAnalysisServerConfig(environment);
  let client: OpenAI | null = null;

  const getClient = () => {
    client ??= new OpenAI({
      apiKey: config.apiKey,
      maxRetries: MENU_ANALYSIS_MAX_RETRIES,
      timeout: MENU_ANALYSIS_TIMEOUT_MS,
    });
    return client;
  };

  return {
    modelVersion: config.model,
    async analyzeMenuImages(input) {
      if (input.signal?.aborted) throw new AnalysisAbortedError();
      try {
        const response = await getClient().responses.parse(
          buildOpenAIMenuResponseRequest(input, config.model),
          input.signal ? { signal: input.signal } : undefined,
        );

        if (input.signal?.aborted) throw new AnalysisAbortedError();
        const refusal = responseRefusal(response);
        if (refusal) {
          throw new MenuAnalysisError(
            "MODEL_REFUSAL",
            "The model declined to analyze the supplied menu images.",
          );
        }
        if (response.status === "incomplete") {
          throw new MenuAnalysisError(
            "MODEL_OUTPUT_INCOMPLETE",
            "The model response ended before menu extraction completed.",
            true,
          );
        }
        if (response.status !== "completed" || response.output_parsed === null) {
          throw new MenuAnalysisError(
            "MODEL_OUTPUT_INVALID",
            "The model did not return a valid structured menu result.",
            true,
          );
        }

        const parsed = MenuImageModelOutputSchema.safeParse(response.output_parsed);
        if (!parsed.success) {
          throw new MenuAnalysisError(
            "MODEL_OUTPUT_INVALID",
            "The model returned invalid structured menu data.",
            true,
          );
        }
        return parsed.data;
      } catch (error) {
        throw normalizeOpenAIMenuProviderError(error, Boolean(input.signal?.aborted));
      }
    },
  };
}
