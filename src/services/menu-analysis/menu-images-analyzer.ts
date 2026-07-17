import { FOODSEYO_ANALYSIS_SCHEMA_VERSION } from "../../domain/foodseyo-analysis.ts";
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
  prepareMenuImagesAnalysis,
  type MenuAnalysisPreparationDependencies,
  type PreparedMenuImagesAnalysis,
} from "./menu-analysis-preparation.ts";
import { MenuImageModelOutputSchema } from "./menu-image-model-schema.ts";
import type { MenuVisionProvider } from "./menu-vision-provider.ts";
import type { MenuAnalysisModel } from "./openai-menu-request.ts";

export interface MenuImagesAnalyzerDependencies
  extends Omit<MenuAnalysisPreparationDependencies, "environment"> {
  readonly createProvider: (modelVersion: MenuAnalysisModel) => MenuVisionProvider;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

export interface PreparedMenuImagesAnalyzerDependencies {
  readonly createProvider: (modelVersion: MenuAnalysisModel) => MenuVisionProvider;
}

export function createPreparedMenuImagesAnalyzer(
  prepared: PreparedMenuImagesAnalysis,
  dependencies: PreparedMenuImagesAnalyzerDependencies,
): AnalysisAnalyzer<MenuImagesAnalyzeRequest> {
  return {
    inputType: "menu_images",
    async analyze(
      request: MenuImagesAnalyzeRequest,
      context: AnalyzerExecutionContext,
    ): Promise<AnalysisDraft> {
      const provider = dependencies.createProvider(prepared.modelVersion);
      if (provider.modelVersion !== prepared.modelVersion) {
        throw new MenuAnalysisError(
          "OPENAI_MODEL_UNSUPPORTED",
          "The menu provider model does not match the prepared analysis contract.",
        );
      }

      const providerOutput = await provider.analyzeMenuImages({
        images: prepared.images,
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
        payload = await adaptMenuImageModelOutput({
          modelOutput: parsedOutput.data,
          imageCount: prepared.imageCount,
          userEnteredRestaurantName: request.userEnteredRestaurantName,
          sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
          versions: prepared.versions,
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
        schemaVersion: FOODSEYO_ANALYSIS_SCHEMA_VERSION,
        analysisMetadata: {
          sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
          versions: prepared.versions,
        },
        inputContext: {
          type: "menu_images",
          imageCount: prepared.imageCount,
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

export function createMenuImagesAnalyzer(
  dependencies: MenuImagesAnalyzerDependencies,
): AnalysisAnalyzer<MenuImagesAnalyzeRequest> {
  return {
    inputType: "menu_images",
    async analyze(
      request: MenuImagesAnalyzeRequest,
      context: AnalyzerExecutionContext,
    ): Promise<AnalysisDraft> {
      const prepared = await prepareMenuImagesAnalysis(
        request,
        {
          environment: dependencies.environment ?? process.env,
          createImageHash: dependencies.createImageHash,
          createSourceIdentity: dependencies.createSourceIdentity,
        },
        context.signal,
      );

      return createPreparedMenuImagesAnalyzer(prepared, {
        createProvider: dependencies.createProvider,
      }).analyze(request, context);
    },
  };
}
