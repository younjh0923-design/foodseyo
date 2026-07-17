import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import {
  DEFAULT_MENU_ANALYSIS_MODEL,
  isMenuAnalysisModel,
  type MenuAnalysisModel,
} from "./openai-menu-request.ts";

export interface MenuAnalysisServerConfig {
  readonly apiKey: string;
  readonly model: MenuAnalysisModel;
}

export function resolveMenuAnalysisModel(value: string | undefined): MenuAnalysisModel {
  const model = value?.trim() || DEFAULT_MENU_ANALYSIS_MODEL;
  if (!isMenuAnalysisModel(model)) {
    throw new MenuAnalysisError(
      "OPENAI_MODEL_UNSUPPORTED",
      "The configured menu-analysis model is not supported.",
    );
  }
  return model;
}

export function readMenuAnalysisApiKey(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new MenuAnalysisError(
      "OPENAI_NOT_CONFIGURED",
      "Menu analysis is not configured on this server.",
    );
  }
  return apiKey;
}

export function createMenuAnalysisServerConfig(
  environment: Readonly<Record<string, string | undefined>>,
  resolvedModel: MenuAnalysisModel,
): MenuAnalysisServerConfig {
  return {
    apiKey: readMenuAnalysisApiKey(environment),
    model: resolvedModel,
  };
}

export function readMenuAnalysisServerConfig(
  environment: Readonly<Record<string, string | undefined>>,
): MenuAnalysisServerConfig {
  const apiKey = readMenuAnalysisApiKey(environment);

  return {
    apiKey,
    model: resolveMenuAnalysisModel(environment.OPENAI_MODEL),
  };
}
