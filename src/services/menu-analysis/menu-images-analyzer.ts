import { AnalysisAbortedError } from "../analysis/analysis-errors.ts";
import type {
  AnalysisAnalyzer,
  AnalysisDraft,
  AnalyzerExecutionContext,
  MenuImagesAnalyzeRequest,
} from "../analysis/analysis-types.ts";
import { adaptMenuImageModelOutput } from "./menu-image-adapter.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import { MenuImageModelOutputSchema } from "./menu-image-model-schema.ts";
import type { MenuVisionProvider } from "./menu-vision-provider.ts";

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

      const images = [];
      for (const [index, image] of request.images.entries()) {
        if (!image.mediaType || !ALLOWED_MEDIA_TYPES.has(image.mediaType)) {
          throw new MenuAnalysisError(
            "MODEL_OUTPUT_INVALID",
            "Menu analyzer received an unsupported transient image type.",
          );
        }
        const bytes = await image.read();
        if (context.signal?.aborted) throw new AnalysisAbortedError();
        if (bytes.byteLength === 0) {
          throw new MenuAnalysisError(
            "MODEL_OUTPUT_INVALID",
            "Menu analyzer received an empty transient image.",
          );
        }
        images.push({
          index,
          mediaType: image.mediaType as "image/jpeg" | "image/png" | "image/webp",
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
