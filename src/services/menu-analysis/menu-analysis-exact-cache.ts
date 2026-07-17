import {
  ConsistentFoodseyoAnalysisSchema,
  type ConsistentFoodseyoAnalysis,
  type FoodseyoAnalysis,
} from "../../domain/foodseyo-analysis.ts";
import { validateAnalysisSemantics } from "../analysis/validate-analysis-semantics.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import type { PreparedMenuImagesAnalysis } from "./menu-analysis-preparation.ts";
import {
  ANALYSIS_CACHE_BUSY_PUBLIC_RESULT,
  ANALYSIS_CACHE_BUSY_WAIT_MAX_MS,
  ANALYSIS_CACHE_INDETERMINATE_PUBLIC_RESULT,
  ANALYSIS_CACHE_POLL_INTERVAL_MAX_MS,
  ANALYSIS_CACHE_POLL_INTERVAL_MIN_MS,
} from "./menu-cache-contract.ts";

export interface MenuAnalysisCacheIdentityContext {
  readonly menuEvidenceSetId: string;
  readonly analysisContractId: string;
}

export interface MenuAnalysisCacheOwnership
  extends MenuAnalysisCacheIdentityContext {
  readonly analysisRunId: string;
  readonly leaseExpiresAt: Date;
}

export type MenuAnalysisExactCacheClaim =
  | {
      readonly state: "hit";
      readonly analysis: ConsistentFoodseyoAnalysis;
    }
  | {
      readonly state: "owner";
      readonly ownership: MenuAnalysisCacheOwnership;
      readonly recoveredExpiredLease: boolean;
    }
  | {
      readonly state: "busy";
      readonly identity: MenuAnalysisCacheIdentityContext;
    }
  | { readonly state: "bypass" }
  | { readonly state: "indeterminate" };

export type MenuAnalysisExactCachePoll =
  | {
      readonly state: "hit";
      readonly analysis: ConsistentFoodseyoAnalysis;
    }
  | { readonly state: "pending" }
  | { readonly state: "indeterminate" };

export interface MenuAnalysisExactCache {
  claim(
    prepared: PreparedMenuImagesAnalysis,
  ): Promise<MenuAnalysisExactCacheClaim>;
  poll(
    identity: MenuAnalysisCacheIdentityContext,
  ): Promise<MenuAnalysisExactCachePoll>;
  persistOwned(
    ownership: MenuAnalysisCacheOwnership,
    analysis: ConsistentFoodseyoAnalysis,
  ): Promise<"persisted">;
  failOwned(
    ownership: MenuAnalysisCacheOwnership,
    safeErrorCode: string,
  ): Promise<boolean>;
}

export type MenuAnalysisCacheReadState =
  | "not_attempted"
  | "disabled"
  | "hit"
  | "miss"
  | "bypass"
  | "busy"
  | "indeterminate";

export type MenuAnalysisCacheWriteState =
  | "not_attempted"
  | "persisted"
  | "failed";

export interface MenuAnalysisExactCacheResult {
  readonly analysis: FoodseyoAnalysis;
  readonly cacheReadState: MenuAnalysisCacheReadState;
  readonly cacheWriteState: MenuAnalysisCacheWriteState;
}

type AnalysisCachePublicResult =
  | typeof ANALYSIS_CACHE_BUSY_PUBLIC_RESULT
  | typeof ANALYSIS_CACHE_INDETERMINATE_PUBLIC_RESULT;

export class MenuAnalysisCachePublicError extends Error {
  readonly result: AnalysisCachePublicResult;
  readonly cacheReadState: "busy" | "indeterminate";
  readonly cacheWriteState = "not_attempted" as const;

  constructor(result: AnalysisCachePublicResult) {
    super(
      result.code === "ANALYSIS_IN_PROGRESS"
        ? "This menu analysis is already in progress. Try again shortly."
        : "Menu analysis is temporarily unavailable. Try again shortly.",
    );
    this.name = "MenuAnalysisCachePublicError";
    this.result = result;
    this.cacheReadState =
      result.code === "ANALYSIS_IN_PROGRESS" ? "busy" : "indeterminate";
  }
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

const failOwnedBestEffort = async (
  cache: MenuAnalysisExactCache,
  ownership: MenuAnalysisCacheOwnership,
  safeErrorCode: string,
): Promise<void> => {
  try {
    await cache.failOwned(ownership, safeErrorCode);
  } catch {
    // The original provider or persistence failure remains authoritative.
  }
};

const defaultSleep = (
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export interface MenuAnalysisExactCacheCoordinatorDependencies {
  readonly now?: () => number;
  readonly sleep?: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly pollIntervalMs?: number;
}

const pollForCompletedSnapshot = async (input: {
  readonly cache: MenuAnalysisExactCache;
  readonly prepared: PreparedMenuImagesAnalysis;
  readonly identity: MenuAnalysisCacheIdentityContext;
  readonly signal?: AbortSignal;
  readonly dependencies?: MenuAnalysisExactCacheCoordinatorDependencies;
}): Promise<ConsistentFoodseyoAnalysis | null> => {
  const now = input.dependencies?.now ?? (() => performance.now());
  const sleep = input.dependencies?.sleep ?? defaultSleep;
  const interval = Math.min(
    ANALYSIS_CACHE_POLL_INTERVAL_MAX_MS,
    Math.max(
      ANALYSIS_CACHE_POLL_INTERVAL_MIN_MS,
      input.dependencies?.pollIntervalMs ?? 200,
    ),
  );
  const startedAt = now();

  while (now() - startedAt < ANALYSIS_CACHE_BUSY_WAIT_MAX_MS) {
    const remaining =
      ANALYSIS_CACHE_BUSY_WAIT_MAX_MS - (now() - startedAt);
    await sleep(Math.min(interval, remaining), input.signal);
    const polled = await input.cache.poll(input.identity);
    if (polled.state === "indeterminate") {
      throw new MenuAnalysisCachePublicError(
        ANALYSIS_CACHE_INDETERMINATE_PUBLIC_RESULT,
      );
    }
    if (polled.state === "hit") {
      return isUsableExactCacheHit(polled.analysis, input.prepared)
        ? polled.analysis
        : null;
    }
  }
  return null;
};

export async function resolveMenuAnalysisWithExactCache(input: {
  readonly prepared: PreparedMenuImagesAnalysis;
  readonly cache?: MenuAnalysisExactCache;
  readonly analyzeUncached: () => Promise<FoodseyoAnalysis>;
  readonly signal?: AbortSignal;
  readonly coordinator?: MenuAnalysisExactCacheCoordinatorDependencies;
}): Promise<MenuAnalysisExactCacheResult> {
  if (!input.cache) {
    return {
      analysis: await input.analyzeUncached(),
      cacheReadState: "disabled",
      cacheWriteState: "not_attempted",
    };
  }

  let claim: MenuAnalysisExactCacheClaim;
  try {
    claim = await input.cache.claim(input.prepared);
  } catch {
    return {
      analysis: await input.analyzeUncached(),
      cacheReadState: "bypass",
      cacheWriteState: "not_attempted",
    };
  }

  if (claim.state === "hit") {
    if (isUsableExactCacheHit(claim.analysis, input.prepared)) {
      return {
        analysis: claim.analysis,
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

  if (claim.state === "bypass") {
    return {
      analysis: await input.analyzeUncached(),
      cacheReadState: "bypass",
      cacheWriteState: "not_attempted",
    };
  }

  if (claim.state === "indeterminate") {
    throw new MenuAnalysisCachePublicError(
      ANALYSIS_CACHE_INDETERMINATE_PUBLIC_RESULT,
    );
  }

  if (claim.state === "busy") {
    const completed = await pollForCompletedSnapshot({
      cache: input.cache,
      prepared: input.prepared,
      identity: claim.identity,
      signal: input.signal,
      dependencies: input.coordinator,
    });
    if (completed) {
      return {
        analysis: completed,
        cacheReadState: "hit",
        cacheWriteState: "not_attempted",
      };
    }
    throw new MenuAnalysisCachePublicError(
      ANALYSIS_CACHE_BUSY_PUBLIC_RESULT,
    );
  }

  let analysis: FoodseyoAnalysis;
  try {
    analysis = await input.analyzeUncached();
  } catch (error) {
    await failOwnedBestEffort(
      input.cache,
      claim.ownership,
      "ANALYSIS_PROVIDER_FAILED",
    );
    throw error;
  }
  const canonical = ConsistentFoodseyoAnalysisSchema.safeParse(analysis);
  if (
    !canonical.success ||
    validateAnalysisSemantics(canonical.data.payload).errors.length > 0 ||
    !isUsableExactCacheHit(canonical.data, input.prepared)
  ) {
    await failOwnedBestEffort(
      input.cache,
      claim.ownership,
      "ANALYSIS_VALIDATION_FAILED",
    );
    throw new MenuAnalysisError(
      "MODEL_OUTPUT_INVALID",
      "The canonical analysis did not pass persistence validation.",
      true,
    );
  }

  try {
    await input.cache.persistOwned(claim.ownership, canonical.data);
    return {
      analysis: canonical.data,
      cacheReadState: "miss",
      cacheWriteState: "persisted",
    };
  } catch {
    await failOwnedBestEffort(
      input.cache,
      claim.ownership,
      "SNAPSHOT_PERSISTENCE_FAILED",
    );
    return {
      analysis: canonical.data,
      cacheReadState: "miss",
      cacheWriteState: "failed",
    };
  }
}
