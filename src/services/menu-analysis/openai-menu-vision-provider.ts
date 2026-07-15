import "server-only";

import OpenAI from "openai";
import { z } from "zod";
import { AnalysisAbortedError } from "../analysis/analysis-errors.ts";
import { readMenuAnalysisServerConfig } from "./menu-analysis-config.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import { MenuImageModelOutputSchema } from "./menu-image-model-schema.ts";
import type { MenuVisionProvider } from "./menu-vision-provider.ts";
import {
  MENU_ANALYSIS_MAX_RETRIES,
  MENU_ANALYSIS_TIMEOUT_MS,
  buildOpenAIMenuResponseRequest,
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
): MenuVisionProvider {
  const config = readMenuAnalysisServerConfig(environment);
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
        if (error instanceof MenuAnalysisError || error instanceof AnalysisAbortedError) {
          throw error;
        }
        if (input.signal?.aborted || error instanceof OpenAI.APIUserAbortError) {
          throw new AnalysisAbortedError();
        }
        if (error instanceof OpenAI.RateLimitError) {
          throw new MenuAnalysisError(
            "OPENAI_RATE_LIMITED",
            "Menu analysis is temporarily rate limited.",
            true,
          );
        }
        if (error instanceof OpenAI.APIConnectionTimeoutError) {
          throw new MenuAnalysisError(
            "OPENAI_TIMEOUT",
            "Menu analysis timed out.",
            true,
          );
        }
        if (
          error instanceof OpenAI.APIConnectionError ||
          (error instanceof OpenAI.APIError && (error.status ?? 0) >= 500)
        ) {
          throw new MenuAnalysisError(
            "OPENAI_UNAVAILABLE",
            "Menu analysis is temporarily unavailable.",
            true,
          );
        }
        if (error instanceof z.ZodError) {
          throw new MenuAnalysisError(
            "MODEL_OUTPUT_INVALID",
            "The model returned invalid structured menu data.",
            true,
          );
        }
        throw new MenuAnalysisError(
          "OPENAI_UNAVAILABLE",
          "Menu analysis is temporarily unavailable.",
          true,
        );
      }
    },
  };
}
