import { demoFoodseyoAnalysis } from "../../data/demoFoodseyoAnalysis.ts";
import type { InputType } from "../../domain/foodseyo-analysis.ts";
import {
  AnalysisAbortedError,
  AnalysisCapabilityUnavailableError,
  DemoFixtureNotFoundError,
  UnsupportedAnalysisInputError,
} from "./analysis-errors.ts";
import type {
  AnalysisAnalyzer,
  AnalysisDraft,
  AnalyzerExecutionContext,
  AnalyzeFoodseyoRequest,
  AnalyzeRequestByType,
  DemoAnalyzeRequest,
} from "./analysis-types.ts";

type UnimplementedAnalyzeRequest = Exclude<AnalyzeFoodseyoRequest, DemoAnalyzeRequest>;

class DemoAnalyzer implements AnalysisAnalyzer<DemoAnalyzeRequest> {
  readonly inputType = "demo" as const;

  async analyze(
    request: DemoAnalyzeRequest,
    context: AnalyzerExecutionContext,
  ): Promise<AnalysisDraft> {
    if (context.signal?.aborted) throw new AnalysisAbortedError();
    if (
      demoFoodseyoAnalysis.inputContext.type !== "demo" ||
      request.fixtureId !== demoFoodseyoAnalysis.inputContext.fixtureId
    ) {
      throw new DemoFixtureNotFoundError(request.fixtureId);
    }

    return {
      inputContext: {
        type: "demo",
        fixtureId: request.fixtureId,
        clearlyLabeledDemo: true,
        storageScope: "session_only",
      },
      payloadCandidate: structuredClone(demoFoodseyoAnalysis.payload),
      operationalIssues: [],
      completedCapabilities: ["demo_analysis"],
      degradedCapabilities: [],
      coreCapability: "demo_analysis",
    };
  }
}

class CapabilityUnavailableAnalyzer<TRequest extends UnimplementedAnalyzeRequest>
  implements AnalysisAnalyzer<TRequest>
{
  readonly inputType: TRequest["type"];

  constructor(inputType: TRequest["type"]) {
    this.inputType = inputType;
  }

  async analyze(
    request: TRequest,
    context: AnalyzerExecutionContext,
  ): Promise<AnalysisDraft> {
    if (context.signal?.aborted) throw new AnalysisAbortedError();
    throw new AnalysisCapabilityUnavailableError(request.type);
  }
}

export type AnalyzerRegistry = {
  readonly [TInputType in InputType]: AnalysisAnalyzer<
    AnalyzeRequestByType<TInputType>
  >;
};

export const analyzerRegistry: AnalyzerRegistry = {
  menu_images: new CapabilityUnavailableAnalyzer<AnalyzeRequestByType<"menu_images">>(
    "menu_images",
  ),
  restaurant_photo: new CapabilityUnavailableAnalyzer<
    AnalyzeRequestByType<"restaurant_photo">
  >("restaurant_photo"),
  restaurant_screen: new CapabilityUnavailableAnalyzer<
    AnalyzeRequestByType<"restaurant_screen">
  >("restaurant_screen"),
  restaurant_link: new CapabilityUnavailableAnalyzer<
    AnalyzeRequestByType<"restaurant_link">
  >("restaurant_link"),
  nearby_search: new CapabilityUnavailableAnalyzer<AnalyzeRequestByType<"nearby_search">>(
    "nearby_search",
  ),
  demo: new DemoAnalyzer(),
};

const assertNeverInput = (request: never): never => {
  void request;
  throw new UnsupportedAnalysisInputError();
};

export async function dispatchAnalysisRequest(
  request: AnalyzeFoodseyoRequest,
  context: AnalyzerExecutionContext,
): Promise<AnalysisDraft> {
  switch (request.type) {
    case "menu_images":
      return analyzerRegistry.menu_images.analyze(request, context);
    case "restaurant_photo":
      return analyzerRegistry.restaurant_photo.analyze(request, context);
    case "restaurant_screen":
      return analyzerRegistry.restaurant_screen.analyze(request, context);
    case "restaurant_link":
      return analyzerRegistry.restaurant_link.analyze(request, context);
    case "nearby_search":
      return analyzerRegistry.nearby_search.analyze(request, context);
    case "demo":
      return analyzerRegistry.demo.analyze(request, context);
  }

  return assertNeverInput(request);
}
