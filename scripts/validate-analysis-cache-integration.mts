import type {
  QueryConfig,
  QueryResult,
  QueryResultRow,
} from "pg";

import type {
  AnalysisCacheQueryExecutor,
  AnalysisCacheTransactionManager,
} from "../src/lib/database/database-port.ts";
import {
  acquireAnalysisRunOwnership,
  type AnalysisContractRecord,
  type AnalysisRunRecord,
  type MenuEvidenceSetRecord,
} from "../src/lib/database/repositories/index.ts";
import { createDatabaseMenuAnalysisExactCache } from "../src/services/menu-analysis/database-menu-analysis-exact-cache.ts";
import {
  MenuAnalysisCachePublicError,
  resolveMenuAnalysisWithExactCache,
  type MenuAnalysisCacheOwnership,
  type MenuAnalysisExactCache,
} from "../src/services/menu-analysis/menu-analysis-exact-cache.ts";
import { createMenuAnalysisPostHandler } from "../src/services/menu-analysis/menu-analysis-post-handler.ts";
import { prepareMenuImagesAnalysis } from "../src/services/menu-analysis/menu-analysis-preparation.ts";
import {
  ANALYSIS_CACHE_BUSY_WAIT_MAX_MS,
  ANALYSIS_RUN_LEASE_DURATION_MS,
} from "../src/services/menu-analysis/menu-cache-contract.ts";
import { createCurrentAnalysisFixture } from "./fixtures/current-analysis-fixture.mts";
import {
  captureError,
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo analysis ownership integration validation",
  "Analysis ownership integration validation failed",
);
const networkGuard = installNetworkGuard(
  "Analysis ownership validation must not use the network.",
);

const queryResult = <Row extends QueryResultRow>(
  rows: readonly Row[],
): QueryResult<Row> => ({
  command: "SELECT",
  rowCount: rows.length,
  oid: 0,
  fields: [],
  rows: [...rows],
});

const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1]);
const prepared = await prepareMenuImagesAnalysis(
  {
    type: "menu_images",
    images: [
      {
        id: "synthetic-page",
        fileName: null,
        mediaType: "image/jpeg",
        byteLength: imageBytes.byteLength,
        async read() {
          return imageBytes.slice();
        },
      },
    ],
    userEnteredRestaurantName: null,
    location: null,
  },
  { environment: { OPENAI_MODEL: "gpt-5.6" } },
);
const canonical = await createCurrentAnalysisFixture({
  sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
  versions: prepared.versions,
});
const identity = {
  menuEvidenceSetId: "20000000-0000-4000-8000-000000000002",
  analysisContractId: "10000000-0000-4000-8000-000000000001",
};
const ownership: MenuAnalysisCacheOwnership = {
  ...identity,
  analysisRunId: "30000000-0000-4000-8000-000000000003",
  leaseExpiresAt: new Date("2026-07-17T15:02:00.000Z"),
};

let disabledProviderCalls = 0;
const disabled = await resolveMenuAnalysisWithExactCache({
  prepared,
  async analyzeUncached() {
    disabledProviderCalls += 1;
    return canonical;
  },
});
verify(
  disabled.cacheReadState === "disabled" &&
    disabledProviderCalls === 1 &&
    disabled.analysis === canonical,
  "a disabled cache preserves the existing uncached analysis path",
);

let hitProviderCalls = 0;
const hitCache: MenuAnalysisExactCache = {
  async claim() {
    return { state: "hit", analysis: canonical };
  },
  async poll() {
    throw new Error("a direct hit must not poll");
  },
  async persistOwned() {
    throw new Error("a direct hit must not persist");
  },
  async failOwned() {
    throw new Error("a direct hit must not transition a run");
  },
};
const hit = await resolveMenuAnalysisWithExactCache({
  prepared,
  cache: hitCache,
  async analyzeUncached() {
    hitProviderCalls += 1;
    return canonical;
  },
});
verify(
  hit.cacheReadState === "hit" &&
    hit.cacheWriteState === "not_attempted" &&
    hitProviderCalls === 0,
  "a valid exact hit returns the completed snapshot with zero provider calls",
);

let bypassProviderCalls = 0;
let bypassPersistenceCalls = 0;
const bypass = await resolveMenuAnalysisWithExactCache({
  prepared,
  cache: {
    async claim() {
      return { state: "bypass" };
    },
    async poll() {
      throw new Error("bypass must not poll");
    },
    async persistOwned() {
      bypassPersistenceCalls += 1;
      return "persisted";
    },
    async failOwned() {
      return false;
    },
  },
  async analyzeUncached() {
    bypassProviderCalls += 1;
    return canonical;
  },
});
verify(
  bypass.cacheReadState === "bypass" &&
    bypass.cacheWriteState === "not_attempted" &&
    bypassProviderCalls === 1 &&
    bypassPersistenceCalls === 0,
  "pre-ownership failure and unconfirmed quarantine fail open without replacement persistence",
);

let ownerProviderCalls = 0;
let persistedOwnership: MenuAnalysisCacheOwnership | null = null;
const owned = await resolveMenuAnalysisWithExactCache({
  prepared,
  cache: {
    async claim() {
      return {
        state: "owner",
        ownership,
        recoveredExpiredLease: false,
      };
    },
    async poll() {
      throw new Error("an owner must not poll itself");
    },
    async persistOwned(candidate) {
      persistedOwnership = candidate;
      return "persisted";
    },
    async failOwned() {
      return false;
    },
  },
  async analyzeUncached() {
    ownerProviderCalls += 1;
    return canonical;
  },
});
verify(
  owned.cacheReadState === "miss" &&
    owned.cacheWriteState === "persisted" &&
    ownerProviderCalls === 1 &&
    persistedOwnership?.analysisRunId === ownership.analysisRunId,
  "only a confirmed owner invokes the provider and persists with its exact run identity",
);

let failedRunCode: string | null = null;
const providerFailure = new Error("synthetic provider failure");
const observedProviderFailure = await captureError(() =>
  resolveMenuAnalysisWithExactCache({
    prepared,
    cache: {
      async claim() {
        return {
          state: "owner",
          ownership,
          recoveredExpiredLease: false,
        };
      },
      async poll() {
        throw new Error("owner failure must not poll");
      },
      async persistOwned() {
        throw new Error("provider failure must not persist");
      },
      async failOwned(_candidate, safeErrorCode) {
        failedRunCode = safeErrorCode;
        return true;
      },
    },
    async analyzeUncached() {
      throw providerFailure;
    },
  }),
);
verify(
  observedProviderFailure === providerFailure &&
    failedRunCode === "ANALYSIS_PROVIDER_FAILED",
  "provider failure performs a best-effort guarded failure transition for the owned run",
);

const wrongIdentity = structuredClone(canonical);
wrongIdentity.analysisMetadata.sourceFingerprint =
  `source_${"9".repeat(64)}`;
let invalidCanonicalPersistCalls = 0;
let invalidCanonicalFailureCode: string | null = null;
const invalidCanonicalError = await captureError(() =>
  resolveMenuAnalysisWithExactCache({
    prepared,
    cache: {
      async claim() {
        return {
          state: "owner",
          ownership,
          recoveredExpiredLease: false,
        };
      },
      async poll() {
        throw new Error("owner validation must not poll");
      },
      async persistOwned() {
        invalidCanonicalPersistCalls += 1;
        return "persisted";
      },
      async failOwned(_candidate, safeErrorCode) {
        invalidCanonicalFailureCode = safeErrorCode;
        return true;
      },
    },
    async analyzeUncached() {
      return wrongIdentity;
    },
  }),
);
verify(
  invalidCanonicalError instanceof Error &&
    invalidCanonicalPersistCalls === 0 &&
    invalidCanonicalFailureCode === "ANALYSIS_VALIDATION_FAILED",
  "an invalid or identity-mismatched canonical result is neither returned nor persisted",
);

let persistenceFailureCode: string | null = null;
const persistenceFailure = await resolveMenuAnalysisWithExactCache({
  prepared,
  cache: {
    async claim() {
      return {
        state: "owner",
        ownership,
        recoveredExpiredLease: false,
      };
    },
    async poll() {
      throw new Error("owner persistence must not poll");
    },
    async persistOwned() {
      throw new Error("synthetic atomic persistence failure");
    },
    async failOwned(_candidate, safeErrorCode) {
      persistenceFailureCode = safeErrorCode;
      return true;
    },
  },
  async analyzeUncached() {
    return canonical;
  },
});
verify(
  persistenceFailure.analysis.analysisId === canonical.analysisId &&
    persistenceFailure.cacheWriteState === "failed" &&
    persistenceFailureCode === "SNAPSHOT_PERSISTENCE_FAILED",
  "atomic persistence failure returns only the already validated live result uncached",
);

class CoordinatingCache implements MenuAnalysisExactCache {
  private ownerAssigned = false;
  private completedSnapshot: typeof canonical | null = null;
  readonly ownerRunIds: string[] = [];
  private resolvePersisted: () => void = () => undefined;
  readonly persisted = new Promise<void>((resolve) => {
    this.resolvePersisted = resolve;
  });

  async claim() {
    if (this.completedSnapshot) {
      return {
        state: "hit" as const,
        analysis: this.completedSnapshot,
      };
    }
    if (!this.ownerAssigned) {
      this.ownerAssigned = true;
      this.ownerRunIds.push(ownership.analysisRunId);
      return {
        state: "owner" as const,
        ownership,
        recoveredExpiredLease: false,
      };
    }
    return { state: "busy" as const, identity };
  }

  async poll() {
    return this.completedSnapshot
      ? { state: "hit" as const, analysis: this.completedSnapshot }
      : { state: "pending" as const };
  }

  async persistOwned(
    candidate: MenuAnalysisCacheOwnership,
    analysis: typeof canonical,
  ) {
    if (candidate.analysisRunId !== ownership.analysisRunId) {
      throw new Error("non-owner persistence was attempted");
    }
    this.completedSnapshot = analysis;
    this.resolvePersisted();
    return "persisted" as const;
  }

  async failOwned() {
    return false;
  }
}

const coordinatingCache = new CoordinatingCache();
let concurrentProviderCalls = 0;
let releaseProvider: ((analysis: typeof canonical) => void) | null = null;
const providerStarted = new Promise<void>((resolve) => {
  releaseProvider = (analysis) => {
    resolveProvider?.(analysis);
  };
  resolve();
});
let resolveProvider:
  | ((analysis: typeof canonical) => void)
  | null = null;
const providerResult = new Promise<typeof canonical>((resolve) => {
  resolveProvider = resolve;
});
const ownerRequest = resolveMenuAnalysisWithExactCache({
  prepared,
  cache: coordinatingCache,
  async analyzeUncached() {
    concurrentProviderCalls += 1;
    await providerStarted;
    return providerResult;
  },
});
await Promise.resolve();
const duplicateRequest = resolveMenuAnalysisWithExactCache({
  prepared,
  cache: coordinatingCache,
  coordinator: {
    now: () => 0,
    async sleep() {
      releaseProvider?.(canonical);
      await coordinatingCache.persisted;
    },
  },
  async analyzeUncached() {
    concurrentProviderCalls += 1;
    return canonical;
  },
});
const [ownerResult, duplicateResult] = await Promise.all([
  ownerRequest,
  duplicateRequest,
]);
verify(
  coordinatingCache.ownerRunIds.length === 1 &&
    concurrentProviderCalls === 1 &&
    ownerResult.cacheWriteState === "persisted" &&
    duplicateResult.cacheReadState === "hit" &&
    duplicateResult.analysis.analysisId === canonical.analysisId,
  "concurrent identical requests elect exactly one owner and the duplicate reuses its completed snapshot",
);

let virtualNow = 0;
const busyPollIntervals: number[] = [];
let busyProviderCalls = 0;
const busyError = await captureError(() =>
  resolveMenuAnalysisWithExactCache({
    prepared,
    cache: {
      async claim() {
        return { state: "busy", identity };
      },
      async poll() {
        return { state: "pending" };
      },
      async persistOwned() {
        throw new Error("busy request must not persist");
      },
      async failOwned() {
        return false;
      },
    },
    coordinator: {
      now: () => virtualNow,
      async sleep(milliseconds) {
        busyPollIntervals.push(milliseconds);
        virtualNow += milliseconds;
      },
    },
    async analyzeUncached() {
      busyProviderCalls += 1;
      return canonical;
    },
  }),
);
verify(
  busyError instanceof MenuAnalysisCachePublicError &&
    busyError.result.code === "ANALYSIS_IN_PROGRESS" &&
    busyError.result.httpStatus === 409 &&
    busyError.result.retryAfterSeconds === 2 &&
    virtualNow === ANALYSIS_CACHE_BUSY_WAIT_MAX_MS &&
    busyPollIntervals.every(
      (interval) => interval >= 100 && interval <= 250,
    ) &&
    busyProviderCalls === 0,
  "an unresolved active owner polls for exactly the frozen bound then returns the frozen 409 policy",
);

let indeterminateProviderCalls = 0;
const indeterminateError = await captureError(() =>
  resolveMenuAnalysisWithExactCache({
    prepared,
    cache: {
      async claim() {
        return { state: "indeterminate" };
      },
      async poll() {
        throw new Error("indeterminate acquisition must not poll");
      },
      async persistOwned() {
        throw new Error("indeterminate acquisition must not persist");
      },
      async failOwned() {
        return false;
      },
    },
    async analyzeUncached() {
      indeterminateProviderCalls += 1;
      return canonical;
    },
  }),
);
verify(
  indeterminateError instanceof MenuAnalysisCachePublicError &&
    indeterminateError.result.code ===
      "ANALYSIS_TEMPORARILY_UNAVAILABLE" &&
    indeterminateError.result.httpStatus === 503 &&
    indeterminateProviderCalls === 0,
  "indeterminate ownership fails closed with the frozen 503 policy and no provider call",
);

const ambiguousAt = new Date("2026-07-17T16:00:00.000Z");
const proposedRunId = "30000000-0000-4000-8000-000000000099";
const contractRecord: AnalysisContractRecord = {
  id: identity.analysisContractId,
  ...prepared.cacheIdentity.analysisContract,
  createdAt: ambiguousAt,
};
const evidenceRecord: MenuEvidenceSetRecord = {
  id: identity.menuEvidenceSetId,
  inputKind: "uploaded_menu_images",
  sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
  fingerprintVersion: prepared.cacheIdentity.sourceFingerprintVersion,
  imageCount: prepared.imageCount,
  normalizedUrl: null,
  sourceProvider: null,
  observedAt: ambiguousAt,
  createdAt: ambiguousAt,
};
const proposedRun: AnalysisRunRecord = {
  id: proposedRunId,
  ...identity,
  status: "processing",
  attemptNumber: 1,
  safeErrorCode: null,
  startedAt: ambiguousAt,
  leaseExpiresAt: new Date(
    ambiguousAt.getTime() + ANALYSIS_RUN_LEASE_DURATION_MS,
  ),
  finishedAt: null,
  createdAt: ambiguousAt,
  updatedAt: ambiguousAt,
};

class UnconfirmedQuarantineDatabase
  implements AnalysisCacheTransactionManager
{
  async query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    switch (config.name) {
      case "foodseyo-insert-analysis-contract":
      case "foodseyo-insert-uploaded-menu-evidence":
        return queryResult([]);
      case "foodseyo-select-analysis-contract":
        return queryResult([contractRecord] as unknown as Row[]);
      case "foodseyo-select-menu-evidence":
        return queryResult([evidenceRecord] as unknown as Row[]);
      case "foodseyo-select-active-analysis-snapshot":
        return queryResult([
          {
            id: "40000000-0000-4000-8000-000000000004",
            ...identity,
            analysisRunId: ownership.analysisRunId,
            resultFingerprint:
              `foodseyo-snapshot-result-v1:${"0".repeat(64)}`,
            canonicalResultJson: { invalid: true },
            createdAt: ambiguousAt,
            lastAccessedAt: ambiguousAt,
            expiresAt: null,
            invalidatedAt: null,
            safeInvalidationCode: null,
            sourceFingerprint:
              prepared.cacheIdentity.sourceFingerprint,
            fingerprintVersion:
              prepared.cacheIdentity.sourceFingerprintVersion,
            ...prepared.cacheIdentity.analysisContract,
          },
        ] as unknown as Row[]);
      case "foodseyo-invalidate-active-analysis-snapshot":
        return queryResult([]);
      default:
        throw new Error(
          `Unexpected quarantine query: ${config.name ?? "unnamed"}.`,
        );
    }
  }

  async withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    void work;
    throw new Error("unconfirmed quarantine must not acquire ownership");
  }
}

let quarantineRunIdCalls = 0;
const unconfirmedQuarantineCache =
  createDatabaseMenuAnalysisExactCache({
    getDatabase: () => new UnconfirmedQuarantineDatabase(),
    createRunId: () => {
      quarantineRunIdCalls += 1;
      return proposedRunId;
    },
    now: () => ambiguousAt,
  });
const unconfirmedQuarantineClaim =
  await unconfirmedQuarantineCache.claim(prepared);
verify(
  unconfirmedQuarantineClaim.state === "bypass" &&
    quarantineRunIdCalls === 0,
  "a corrupt snapshot whose quarantine cannot be confirmed never creates ownership or authorizes replacement persistence",
);

class AmbiguousAcquisitionDatabase
  implements AnalysisCacheTransactionManager
{
  readonly recoverProposedOwner: boolean;

  constructor(recoverProposedOwner: boolean) {
    this.recoverProposedOwner = recoverProposedOwner;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    switch (config.name) {
      case "foodseyo-insert-analysis-contract":
      case "foodseyo-insert-uploaded-menu-evidence":
        return queryResult([]);
      case "foodseyo-select-analysis-contract":
        return queryResult([contractRecord] as unknown as Row[]);
      case "foodseyo-select-menu-evidence":
        return queryResult([evidenceRecord] as unknown as Row[]);
      case "foodseyo-select-active-analysis-snapshot":
        return queryResult([]);
      case "foodseyo-select-analysis-run":
        return queryResult(
          this.recoverProposedOwner
            ? ([proposedRun] as unknown as Row[])
            : [],
        );
      case "foodseyo-select-processing-analysis-run-for-identity":
        return queryResult([]);
      default:
        throw new Error(
          `Unexpected ambiguous-acquisition query: ${config.name ?? "unnamed"}.`,
        );
    }
  }

  async withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    void work;
    throw new Error("synthetic ambiguous commit");
  }
}

const ambiguousCache = createDatabaseMenuAnalysisExactCache({
  getDatabase: () => new AmbiguousAcquisitionDatabase(false),
  createRunId: () => proposedRunId,
  now: () => ambiguousAt,
});
let ambiguousProviderCalls = 0;
const ambiguousError = await captureError(() =>
  resolveMenuAnalysisWithExactCache({
    prepared,
    cache: ambiguousCache,
    async analyzeUncached() {
      ambiguousProviderCalls += 1;
      return canonical;
    },
  }),
);
verify(
  ambiguousError instanceof MenuAnalysisCachePublicError &&
    ambiguousError.result.code ===
      "ANALYSIS_TEMPORARILY_UNAVAILABLE" &&
    ambiguousProviderCalls === 0,
  "an ambiguous acquisition that cannot prove ownership re-reads once and never fails open",
);

const recoveredAmbiguousCache = createDatabaseMenuAnalysisExactCache({
  getDatabase: () => new AmbiguousAcquisitionDatabase(true),
  createRunId: () => proposedRunId,
  now: () => ambiguousAt,
});
const recoveredAmbiguousClaim =
  await recoveredAmbiguousCache.claim(prepared);
verify(
  recoveredAmbiguousClaim.state === "owner" &&
    recoveredAmbiguousClaim.ownership.analysisRunId === proposedRunId,
  "an ambiguous commit recovers ownership only from the exact application-generated run UUID",
);

let corruptPollProviderCalls = 0;
const corruptPollError = await captureError(() =>
  resolveMenuAnalysisWithExactCache({
    prepared,
    cache: {
      async claim() {
        return { state: "busy", identity };
      },
      async poll() {
        return { state: "indeterminate" };
      },
      async persistOwned() {
        throw new Error("unsafe polled snapshot must not persist");
      },
      async failOwned() {
        return false;
      },
    },
    coordinator: {
      now: () => 0,
      async sleep() {},
    },
    async analyzeUncached() {
      corruptPollProviderCalls += 1;
      return canonical;
    },
  }),
);
verify(
  corruptPollError instanceof MenuAnalysisCachePublicError &&
    corruptPollError.result.code ===
      "ANALYSIS_TEMPORARILY_UNAVAILABLE" &&
    corruptPollProviderCalls === 0,
  "an unsafe or unquarantinable polled snapshot is never returned or replaced after ownership exists",
);

const formData = new FormData();
formData.append(
  "images",
  new Blob([imageBytes], { type: "image/jpeg" }),
  "synthetic.jpg",
);
let handlerTime = 0;
const busyHandler = createMenuAnalysisPostHandler({
  analysisCache: {
    async claim() {
      return { state: "busy", identity };
    },
    async poll() {
      return { state: "pending" };
    },
    async persistOwned() {
      throw new Error("busy HTTP request must not persist");
    },
    async failOwned() {
      return false;
    },
  },
  cacheCoordinator: {
    now: () => handlerTime,
    async sleep(milliseconds) {
      handlerTime += milliseconds;
    },
  },
  createProvider() {
    throw new Error("busy HTTP request must not construct a provider");
  },
  createCorrelationId: () =>
    "123e4567-e89b-12d3-a456-426614174000",
  logObservation() {},
});
const busyResponse = await busyHandler(
  new Request("http://localhost/api/analyze/menu-images", {
    method: "POST",
    body: formData,
  }),
);
const busyBody = await busyResponse.json();
verify(
  busyResponse.status === 409 &&
    busyResponse.headers.get("Retry-After") === "2" &&
    busyBody.error?.code === "ANALYSIS_IN_PROGRESS" &&
    busyBody.error?.retryable === true,
  "the public busy response exposes exactly HTTP 409, ANALYSIS_IN_PROGRESS, and Retry-After 2",
);

const unavailableFormData = new FormData();
unavailableFormData.append(
  "images",
  new Blob([imageBytes], { type: "image/jpeg" }),
  "synthetic.jpg",
);
const unavailableHandler = createMenuAnalysisPostHandler({
  analysisCache: {
    async claim() {
      return { state: "indeterminate" };
    },
    async poll() {
      throw new Error("indeterminate HTTP request must not poll");
    },
    async persistOwned() {
      throw new Error("indeterminate HTTP request must not persist");
    },
    async failOwned() {
      return false;
    },
  },
  createProvider() {
    throw new Error("indeterminate HTTP request must not construct a provider");
  },
  createCorrelationId: () =>
    "123e4567-e89b-12d3-a456-426614174000",
  logObservation() {},
});
const unavailableResponse = await unavailableHandler(
  new Request("http://localhost/api/analyze/menu-images", {
    method: "POST",
    body: unavailableFormData,
  }),
);
const unavailableBody = await unavailableResponse.json();
verify(
  unavailableResponse.status === 503 &&
    unavailableResponse.headers.get("Retry-After") === null &&
    unavailableBody.error?.code ===
      "ANALYSIS_TEMPORARILY_UNAVAILABLE" &&
    unavailableBody.error?.retryable === true,
  "the indeterminate public response exposes exactly HTTP 503 without a fabricated retry header",
);

interface ScriptedQuery {
  readonly name: string;
  readonly rows: readonly QueryResultRow[];
}

class ScriptedDatabase implements AnalysisCacheTransactionManager {
  private readonly script: ScriptedQuery[];
  commits = 0;
  rollbacks = 0;

  constructor(script: ScriptedQuery[]) {
    this.script = script;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    const step = this.script.shift();
    if (!step || step.name !== config.name) {
      throw new Error(
        `Unexpected ownership query: ${config.name ?? "unnamed"}.`,
      );
    }
    return queryResult(step.rows as readonly Row[]);
  }

  async withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    try {
      const result = await work(this);
      this.commits += 1;
      return result;
    } catch (error) {
      this.rollbacks += 1;
      throw error;
    }
  }

  get complete(): boolean {
    return this.script.length === 0;
  }
}

const acquiredAt = new Date("2026-07-17T15:00:00.000Z");
const activeRun: AnalysisRunRecord = {
  id: ownership.analysisRunId,
  ...identity,
  status: "processing",
  attemptNumber: 1,
  safeErrorCode: null,
  startedAt: acquiredAt,
  leaseExpiresAt: new Date(
    acquiredAt.getTime() + ANALYSIS_RUN_LEASE_DURATION_MS,
  ),
  finishedAt: null,
  createdAt: acquiredAt,
  updatedAt: acquiredAt,
};
const expiredObservedAt = new Date(
  activeRun.leaseExpiresAt!.getTime() + 1,
);
const expiredRun: AnalysisRunRecord = {
  ...activeRun,
  leaseExpiresAt: new Date(expiredObservedAt.getTime() - 1),
};
const failedExpiredRun: AnalysisRunRecord = {
  ...expiredRun,
  status: "failed",
  safeErrorCode: "LEASE_EXPIRED",
  leaseExpiresAt: null,
  finishedAt: expiredObservedAt,
  updatedAt: expiredObservedAt,
};
const recoveredRunId = "30000000-0000-4000-8000-000000000004";
const recoveredRun: AnalysisRunRecord = {
  ...activeRun,
  id: recoveredRunId,
  attemptNumber: 2,
  startedAt: expiredObservedAt,
  leaseExpiresAt: new Date(
    expiredObservedAt.getTime() + ANALYSIS_RUN_LEASE_DURATION_MS,
  ),
  createdAt: expiredObservedAt,
  updatedAt: expiredObservedAt,
};
const recoveryDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-lock-processing-analysis-run-for-ownership",
    rows: [expiredRun],
  },
  {
    name: "foodseyo-fail-expired-processing-analysis-run",
    rows: [failedExpiredRun],
  },
  {
    name: "foodseyo-select-next-analysis-run-attempt",
    rows: [{ nextAttemptNumber: 2 }],
  },
  {
    name: "foodseyo-insert-processing-analysis-run",
    rows: [recoveredRun],
  },
]);
const recovered = await acquireAnalysisRunOwnership(recoveryDatabase, {
  proposedRunId: recoveredRunId,
  ...identity,
  acquiredAt: expiredObservedAt,
});
verify(
  recovered.state === "owner" &&
    recovered.analysisRun.id === recoveredRunId &&
    recovered.analysisRun.attemptNumber === 2 &&
    recovered.recoveredExpiredRunId === expiredRun.id &&
    recoveryDatabase.commits === 1 &&
    recoveryDatabase.rollbacks === 0 &&
    recoveryDatabase.complete,
  "expired ownership is failed as LEASE_EXPIRED and atomically replaced by the next append-only attempt",
);

const busyDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-lock-processing-analysis-run-for-ownership",
    rows: [activeRun],
  },
]);
const busyOwnership = await acquireAnalysisRunOwnership(busyDatabase, {
  proposedRunId: recoveredRunId,
  ...identity,
  acquiredAt: new Date(acquiredAt.getTime() + 1_000),
});
verify(
  busyOwnership.state === "busy" &&
    busyOwnership.analysisRun.id === activeRun.id &&
    busyDatabase.complete,
  "an active lease cannot be replaced by another proposed owner",
);

verify(
  networkGuard.callCount === 0,
  "ownership and concurrency validation makes zero network and OpenAI calls",
);
networkGuard.restore();

report();
