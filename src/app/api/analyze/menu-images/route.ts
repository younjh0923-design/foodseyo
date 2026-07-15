import { createMenuAnalysisPostHandler } from "@/services/menu-analysis/menu-analysis-post-handler";
import { createOpenAIMenuVisionProvider } from "@/services/menu-analysis/openai-menu-vision-provider";

export const runtime = "nodejs";
export const maxDuration = 90;

export const POST = createMenuAnalysisPostHandler({
  createProvider: createOpenAIMenuVisionProvider,
});
