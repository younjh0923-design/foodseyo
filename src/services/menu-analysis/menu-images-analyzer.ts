import { AnalysisAbortedError } from "../analysis/analysis-errors.ts";
import type {
  AnalysisAnalyzer,
  AnalysisDraft,
  AnalyzerExecutionContext,
  MenuImagesAnalyzeRequest,
} from "../analysis/analysis-types.ts";
import { adaptMenuImageModelOutput } from "./menu-image-adapter.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import {
  MAX_MENU_IMAGE_COUNT,
  SERVER_MENU_IMAGE_MAX_BYTES,
  isSupportedMenuImageType,
} from "./menu-image-limits.ts";
import { MenuImageModelOutputSchema } from "./menu-image-model-schema.ts";
import type { MenuVisionProvider } from "./menu-vision-provider.ts";

export interface MenuImagesAnalyzerDependencies {
  readonly provider: MenuVisionProvider;
}

export function createMenuImagesAnalyzer(
  dependencies: MenuImagesAnalyzerDependencies,
): AnalysisAnalyzer<MenuImagesAnalyzeRequest> {
  return {
    inputType: "menu_images",
    async analyze(
      request: MenuImagesAnalyzeRequest,
      context: AnalyzerExecutionContext,
    ): Promise<AnalysisDraft> {
      if (context.signal?.aborted) throw new AnalysisAbortedError();
      if (request.images.length === 0) {
        throw new MenuAnalysisError(
          "INVALID_MENU_IMAGE_INPUT",
          "Menu analysis requires at least one image.",
        );
      }
      if (request.images.length > MAX_MENU_IMAGE_COUNT) {
        throw new MenuAnalysisError(
          "TOO_MANY_MENU_IMAGES",
          `Menu analysis accepts no more than ${MAX_MENU_IMAGE_COUNT} images.`,
        );
      }

      const images = [];
      let actualTotalBytes = 0;
      for (const [index, image] of request.images.entries()) {
        if (context.signal?.aborted) throw new AnalysisAbortedError();
        if (!image.mediaType || !isSupportedMenuImageType(image.mediaType)) {
          throw new MenuAnalysisError(
            "INVALID_MENU_IMAGE_INPUT",
            "Menu analyzer received an unsupported transient image type.",
          );
        }
        let bytes: Uint8Array;
        try {
          bytes = await image.read();
        } catch {
          if (context.signal?.aborted) throw new AnalysisAbortedError();
          throw new MenuAnalysisError(
            "INVALID_MENU_IMAGE_INPUT",
            "A transient menu image could not be read.",
          );
        }
        if (context.signal?.aborted) throw new AnalysisAbortedError();
        if (bytes.byteLength === 0) {
          throw new MenuAnalysisError(
            "INVALID_MENU_IMAGE_INPUT",
            "Menu analyzer received an empty transient image.",
          );
        }
        if (image.byteLength !== null && image.byteLength !== bytes.byteLength) {
          throw new MenuAnalysisError(
            "INVALID_MENU_IMAGE_INPUT",
            "Transient image metadata does not match the actual bytes.",
          );
        }
        actualTotalBytes += bytes.byteLength;
        if (actualTotalBytes > SERVER_MENU_IMAGE_MAX_BYTES) {
          throw new MenuAnalysisError(
            "MENU_IMAGE_BYTES_EXCEEDED",
            "Transient menu image bytes exceed the server analysis limit.",
          );
        }
        images.push({
          index,
          mediaType: image.mediaType,
          bytes,
        });
      }

      const providerOutput = await dependencies.provider.analyzeMenuImages({
        images,
        userEnteredRestaurantName: request.userEnteredRestaurantName,
        signal: context.signal,
      });
      if (context.signal?.aborted) throw new AnalysisAbortedError();

      const parsedOutput = MenuImageModelOutputSchema.safeParse(providerOutput);
      if (!parsedOutput.success) {
        throw new MenuAnalysisError(
          "MODEL_OUTPUT_INVALID",
          "Menu provider returned invalid structured output.",
        );
      }

      let payload;
      try {
        payload = adaptMenuImageModelOutput({
          modelOutput: parsedOutput.data,
          imageCount: request.images.length,
          userEnteredRestaurantName: request.userEnteredRestaurantName,
        });
      } catch (error) {
        if (error instanceof MenuAnalysisError) throw error;
        throw new MenuAnalysisError(
          "CANONICAL_ADAPTER_FAILED",
          "The menu result could not be converted to the Foodseyo contract.",
          true,
        );
      }
      const degraded = parsedOutput.data.analysisQuality === "partial";

      return {
        inputContext: {
          type: "menu_images",
          imageCount: request.images.length,
          userEnteredRestaurantName: request.userEnteredRestaurantName,
          locationUsed: false,
          storageScope: "session_only",
        },
        payloadCandidate: payload,
        operationalIssues: [],
        completedCapabilities: ["menu_analysis"],
        degradedCapabilities: degraded ? ["menu_analysis"] : [],
        coreCapability: "menu_analysis",
      };
    },
  };
}
