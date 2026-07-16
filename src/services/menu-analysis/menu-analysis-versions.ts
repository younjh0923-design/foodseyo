import {
  FOODSEYO_ANALYSIS_SCHEMA_VERSION,
  type AnalysisConsistencyVersionMetadata,
} from "../../domain/foodseyo-analysis.ts";
import { createAnalysisConsistencyVersionMetadata } from "../../lib/analysis-consistency/metadata.ts";

export const MENU_IMAGE_PROMPT_VERSION = "menu-image-prompt-v2" as const;
export const MENU_IMAGE_PROVIDER_SCHEMA_VERSION =
  "menu-image-provider-schema-v2" as const;

export const createMenuAnalysisVersionMetadata = (
  modelVersion: string,
): AnalysisConsistencyVersionMetadata => ({
  ...createAnalysisConsistencyVersionMetadata({
    modelVersion,
    promptVersion: MENU_IMAGE_PROMPT_VERSION,
    providerSchemaVersion: MENU_IMAGE_PROVIDER_SCHEMA_VERSION,
    canonicalSchemaVersion: FOODSEYO_ANALYSIS_SCHEMA_VERSION,
  }),
  canonicalSchemaVersion: FOODSEYO_ANALYSIS_SCHEMA_VERSION,
});
