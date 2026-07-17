import {
  ConsistentFoodseyoAnalysisSchema,
  type ConsistentFoodseyoAnalysis,
  type FoodseyoAnalysis,
} from "../../domain/foodseyo-analysis.ts";
import { validateAnalysisSemantics } from "../analysis/validate-analysis-semantics.ts";
import type { PreparedMenuImagesAnalysis } from "./menu-analysis-preparation.ts";

export interface MenuAnalysisCacheWriteContext {
  readonly menuEvidenceSetId: string;
  readonly analysisContractId: string;
}

export type MenuAnalysisExactCacheLookup =
  | {
      readonly state: "hit";
      readonly analysis: ConsistentFoodseyoAnalysis;
    }
  | {
      readonly state: "miss";
      readonly writeContext: MenuAnalysisCacheWriteContext;
    }
  | { readonly state: "bypass" };

export interface MenuAnalysisExactCache {
  lookup(
    prepared: PreparedMenuImagesAnalysis,
  ): Promise<MenuAnalysisExactCacheLookup>;
  persist(
    writeContext: MenuAnalysisCacheWriteContext,
    analysis: ConsistentFoodseyoAnalysis,
  ): Promise<"persisted" | "already_present">;
}

export type MenuAnalysisCacheReadState =
  | "not_attempted"
  | "disabled"
  | "hit"
  | "miss"
  | "bypass";

export type MenuAnalysisCacheWriteState =
  | "not_attempted"
  | "persisted"
  | "already_present"
  | "failed";

export interface MenuAnalysisExactCacheResult {
  readonly analysis: FoodseyoAnalysis;
  readonly cacheReadState: MenuAnalysisCacheReadState;
  readonly cacheWriteState: MenuAnalysisCacheWriteState;
}

const isUsableExactCacheHit = (
  candidate: unknown,
  prepared: PreparedMenuImagesAnalysis,
): candidate is ConsistentFoodseyoAnalysis => {
  const parsed = ConsistentFoodseyoAnalysisSchema.safeParse(candidate);
  if (
    !parsed.success ||
    validateAnalysisSemantics(parsed.data.payload).errors.length > 0
  ) {
    return false;
  }

  const analysis = parsed.data;
  const versions = analysis.analysisMetadata.versions;
  const expected = prepared.cacheIdentity.analysisContract;
  return (
    analysis.schemaVersion === expected.canonicalSchemaVersion &&
    analysis.analysisMetadata.sourceFingerprint ===
      prepared.cacheIdentity.sourceFingerprint &&
    versions.modelVersion === expected.modelVersion &&
    versions.promptVersion === expected.promptVersion &&
    versions.providerSchemaVersion === expected.providerSchemaVersion &&
    versions.canonicalSchemaVersion === expected.canonicalSchemaVersion &&
    versions.consistencyProfileVersion ===
      expected.consistencyProfileVersion &&
    analysis.inputContext.type === "menu_images" &&
    analysis.inputContext.imageCount === prepared.imageCount &&
    analysis.inputContext.locationUsed === false &&
    analysis.inputContext.storageScope === "session_only"
  );
};

export async function resolveMenuAnalysisWithExactCache(input: {
  readonly prepared: PreparedMenuImagesAnalysis;
  readonly cache?: MenuAnalysisExactCache;
  readonly analyzeUncached: () => Promise<FoodseyoAnalysis>;
}): Promise<MenuAnalysisExactCacheResult> {
  if (!input.cache) {
    return {
      analysis: await input.analyzeUncached(),
      cacheReadState: "disabled",
      cacheWriteState: "not_attempted",
    };
  }

  let lookup: MenuAnalysisExactCacheLookup;
  try {
    lookup = await input.cache.lookup(input.prepared);
  } catch {
    return {
      analysis: await input.analyzeUncached(),
      cacheReadState: "bypass",
      cacheWriteState: "not_attempted",
    };
  }

  if (lookup.state === "hit") {
    if (isUsableExactCacheHit(lookup.analysis, input.prepared)) {
      return {
        analysis: lookup.analysis,
        cacheReadState: "hit",
        cacheWriteState: "not_attempted",
      };
    }
    return {
      analysis: await input.analyzeUncached(),
      cacheReadState: "bypass",
      cacheWriteState: "not_attempted",
    };
  }

  if (lookup.state === "bypass") {
    return {
      analysis: await input.analyzeUncached(),
      cacheReadState: "bypass",
      cacheWriteState: "not_attempted",
    };
  }

  const analysis = await input.analyzeUncached();
  const canonical = ConsistentFoodseyoAnalysisSchema.safeParse(analysis);
  if (
    !canonical.success ||
    validateAnalysisSemantics(canonical.data.payload).errors.length > 0
  ) {
    return {
      analysis,
      cacheReadState: "miss",
      cacheWriteState: "failed",
    };
  }

  try {
    return {
      analysis,
      cacheReadState: "miss",
      cacheWriteState: await input.cache.persist(
        lookup.writeContext,
        canonical.data,
      ),
    };
  } catch {
    return {
      analysis,
      cacheReadState: "miss",
      cacheWriteState: "failed",
    };
  }
}
