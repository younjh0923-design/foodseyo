import { createMenuAnalysisPostHandler } from "@/services/menu-analysis/menu-analysis-post-handler";
import { createOpenAIMenuVisionProvider } from "@/services/menu-analysis/openai-menu-vision-provider";
import { createRuntimeMenuAnalysisExactCache } from "@/services/menu-analysis/runtime-menu-analysis-exact-cache";

export const runtime = "nodejs";
export const maxDuration = 90;

const analysisCache = createRuntimeMenuAnalysisExactCache();

export const POST = createMenuAnalysisPostHandler({
  analysisCache,
  createProvider: (modelVersion) =>
    createOpenAIMenuVisionProvider(process.env, modelVersion),
});
