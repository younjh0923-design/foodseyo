import { readFile } from "node:fs/promises";
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
  inspectActiveAnalysisSnapshot,
  invalidateActiveAnalysisSnapshot,
  persistUncachedReadyAnalysisSnapshot,
  touchActiveAnalysisSnapshot,
  type AnalysisContractRecord,
  type AnalysisRunRecord,
  type AnalysisSnapshotRecord,
  type MenuEvidenceSetRecord,
} from "../src/lib/database/repositories/index.ts";
import {
  resolveMenuAnalysisWithExactCache,
  type MenuAnalysisExactCache,
} from "../src/services/menu-analysis/menu-analysis-exact-cache.ts";
import {
  createMenuAnalysisPostHandler,
  type MenuAnalysisObservation,
} from "../src/services/menu-analysis/menu-analysis-post-handler.ts";
import { prepareMenuImagesAnalysis } from "../src/services/menu-analysis/menu-analysis-preparation.ts";
import {
  SOURCE_FINGERPRINT_VERSION,
  createSnapshotResultFingerprint,
} from "../src/services/menu-analysis/menu-cache-contract.ts";
import { createCurrentAnalysisFixture } from "./fixtures/current-analysis-fixture.mts";
import {
  captureError,
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo exact analysis cache integration validation",
  "Exact analysis cache integration validation failed",
);
const networkGuard = installNetworkGuard(
  "Exact cache integration validation must not use the network.",
);

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
const writeContext = {
  menuEvidenceSetId: "20000000-0000-4000-8000-000000000002",
  analysisContractId: "10000000-0000-4000-8000-000000000001",
};

let uncachedCalls = 0;
let persistCalls = 0;
const hitCache: MenuAnalysisExactCache = {
  async lookup() {
    return { state: "hit", analysis: canonical };
  },
  async persist() {
    persistCalls += 1;
    return "persisted";
  },
};
const hit = await resolveMenuAnalysisWithExactCache({
  prepared,
  cache: hitCache,
  async analyzeUncached() {
    uncachedCalls += 1;
    return canonical;
  },
});
verify(
  hit.cacheReadState === "hit" &&
    hit.cacheWriteState === "not_attempted" &&
    hit.analysis === canonical &&
    uncachedCalls === 0 &&
    persistCalls === 0,
  "a validated exact hit bypasses provider work and persistence",
);

let handlerProviderFactories = 0;
let handlerObservation: MenuAnalysisObservation | null = null;
const hitHandler = createMenuAnalysisPostHandler({
  analysisCache: hitCache,
  createProvider() {
    handlerProviderFactories += 1;
    throw new Error("provider factory must not run on a cache hit");
  },
  createCorrelationId: () =>
    "123e4567-e89b-12d3-a456-426614174000",
  logObservation(observation) {
    handlerObservation = observation;
  },
});
const hitFormData = new FormData();
hitFormData.append(
  "images",
  new Blob([imageBytes], { type: "image/jpeg" }),
  "synthetic.jpg",
);
const hitResponse = await hitHandler(
  new Request("http://localhost/api/analyze/menu-images", {
    method: "POST",
    body: hitFormData,
  }),
);
const hitBody = await hitResponse.json();
verify(
  hitResponse.status === 200 &&
    hitBody.ok === true &&
    hitBody.analysis?.analysisId === canonical.analysisId &&
    handlerProviderFactories === 0 &&
    handlerObservation?.cacheReadState === "hit" &&
    handlerObservation.providerCallCount === 0,
  "the POST analysis flow returns an exact hit without constructing or calling a provider",
);

const missCache: MenuAnalysisExactCache = {
  async lookup() {
    return { state: "miss", writeContext };
  },
  async persist() {
    persistCalls += 1;
    return "persisted";
  },
};
const miss = await resolveMenuAnalysisWithExactCache({
  prepared,
  cache: missCache,
  async analyzeUncached() {
    uncachedCalls += 1;
    return canonical;
  },
});
verify(
  miss.cacheReadState === "miss" &&
    miss.cacheWriteState === "persisted" &&
    uncachedCalls === 1 &&
    persistCalls === 1,
  "a miss executes one uncached analysis and persists the validated result",
);

const alreadyPresent = await resolveMenuAnalysisWithExactCache({
  prepared,
  cache: {
    async lookup() {
      return { state: "miss", writeContext };
    },
    async persist() {
      return "already_present";
    },
  },
  async analyzeUncached() {
    return canonical;
  },
});
verify(
  alreadyPresent.cacheWriteState === "already_present" &&
    alreadyPresent.analysis === canonical,
  "a concurrent active snapshot keeps the already validated live result",
);

for (const [label, cache] of [
  [
    "lookup failure",
    {
      async lookup() {
        throw new Error("synthetic lookup failure");
      },
      async persist() {
        throw new Error("must not persist");
      },
    },
  ],
  [
    "unconfirmed quarantine",
    {
      async lookup() {
        return { state: "bypass" as const };
      },
      async persist() {
        throw new Error("must not persist");
      },
    },
  ],
] as const) {
  let calls = 0;
  const fallback = await resolveMenuAnalysisWithExactCache({
    prepared,
    cache,
    async analyzeUncached() {
      calls += 1;
      return canonical;
    },
  });
  verify(
    fallback.cacheReadState === "bypass" &&
      fallback.cacheWriteState === "not_attempted" &&
      fallback.analysis === canonical &&
      calls === 1,
    `${label} fails open to one uncached analysis without persistence`,
  );
}

const failedPersistence = await resolveMenuAnalysisWithExactCache({
  prepared,
  cache: {
    async lookup() {
      return { state: "miss", writeContext };
    },
    async persist() {
      throw new Error("synthetic persistence failure");
    },
  },
  async analyzeUncached() {
    return canonical;
  },
});
verify(
  failedPersistence.cacheWriteState === "failed" &&
    failedPersistence.analysis === canonical,
  "persistence failure returns the already validated live result uncached",
);

const wrongIdentity = structuredClone(canonical);
wrongIdentity.analysisMetadata.sourceFingerprint = `source_${"9".repeat(64)}`;
let wrongIdentityCalls = 0;
const rejectedHit = await resolveMenuAnalysisWithExactCache({
  prepared,
  cache: {
    async lookup() {
      return { state: "hit", analysis: wrongIdentity };
    },
    async persist() {
      throw new Error("must not persist a rejected hit replacement");
    },
  },
  async analyzeUncached() {
    wrongIdentityCalls += 1;
    return canonical;
  },
});
verify(
  rejectedHit.cacheReadState === "bypass" &&
    rejectedHit.cacheWriteState === "not_attempted" &&
    rejectedHit.analysis === canonical &&
    wrongIdentityCalls === 1,
  "defense-in-depth rejects a cache hit with mismatched exact identity",
);

interface ScriptedQuery {
  readonly name: string;
  readonly rows: readonly QueryResultRow[];
}

const queryResult = <Row extends QueryResultRow>(
  rows: readonly Row[],
): QueryResult<Row> => ({
  command: "SELECT",
  rowCount: rows.length,
  oid: 0,
  fields: [],
  rows: [...rows],
});

class ScriptedExecutor implements AnalysisCacheQueryExecutor {
  private readonly script: ScriptedQuery[];

  constructor(script: ScriptedQuery[]) {
    this.script = script;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    const step = this.script.shift();
    if (!step || step.name !== config.name) {
      throw new Error("Unexpected exact-cache repository query.");
    }
    return queryResult(step.rows as readonly Row[]);
  }

  get complete(): boolean {
    return this.script.length === 0;
  }
}

class ScriptedDatabase
  extends ScriptedExecutor
  implements AnalysisCacheTransactionManager
{
  commits = 0;
  rollbacks = 0;

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
}

const startedAt = new Date("2026-07-17T15:00:00.000Z");
const persistedAt = new Date("2026-07-17T15:00:10.000Z");
const leaseExpiresAt = new Date("2026-07-17T15:02:10.000Z");
const runId = "30000000-0000-4000-8000-000000000003";
const snapshotId = "40000000-0000-4000-8000-000000000004";
const contractRecord: AnalysisContractRecord = {
  id: writeContext.analysisContractId,
  ...prepared.cacheIdentity.analysisContract,
  createdAt: startedAt,
};
const evidenceRecord: MenuEvidenceSetRecord = {
  id: writeContext.menuEvidenceSetId,
  inputKind: "uploaded_menu_images",
  sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
  fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
  imageCount: prepared.imageCount,
  normalizedUrl: null,
  sourceProvider: null,
  observedAt: startedAt,
  createdAt: startedAt,
};
const processingRun: AnalysisRunRecord = {
  id: runId,
  ...writeContext,
  status: "processing",
  attemptNumber: 1,
  safeErrorCode: null,
  startedAt: persistedAt,
  leaseExpiresAt,
  finishedAt: null,
  createdAt: persistedAt,
  updatedAt: persistedAt,
};
const readyRun: AnalysisRunRecord = {
  ...processingRun,
  status: "ready",
  leaseExpiresAt: null,
  finishedAt: persistedAt,
  updatedAt: persistedAt,
};
const resultFingerprint = await createSnapshotResultFingerprint(canonical);
const snapshotRecord: AnalysisSnapshotRecord = {
  id: snapshotId,
  ...writeContext,
  analysisRunId: runId,
  resultFingerprint,
  canonicalResultJson: canonical,
  createdAt: persistedAt,
  lastAccessedAt: persistedAt,
  expiresAt: null,
  invalidatedAt: null,
  safeInvalidationCode: null,
};
const snapshotContext = {
  ...snapshotRecord,
  sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
  fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
  ...prepared.cacheIdentity.analysisContract,
};

const invalidInspectionExecutor = new ScriptedExecutor([
  {
    name: "foodseyo-select-active-analysis-snapshot",
    rows: [
      {
        ...snapshotContext,
        resultFingerprint: `foodseyo-snapshot-result-v1:${"0".repeat(64)}`,
      },
    ],
  },
]);
const invalidInspection = await inspectActiveAnalysisSnapshot(
  invalidInspectionExecutor,
  writeContext,
);
verify(
  invalidInspection.state === "invalid" &&
    invalidInspection.safeInvalidationCode ===
      "SNAPSHOT_INTEGRITY_FAILURE" &&
    invalidInspectionExecutor.complete,
  "snapshot inspection identifies a fingerprint-corrupt row without returning it",
);

const quarantineExecutor = new ScriptedExecutor([
  {
    name: "foodseyo-invalidate-active-analysis-snapshot",
    rows: [{ id: snapshotId }],
  },
]);
verify(
  (await invalidateActiveAnalysisSnapshot(quarantineExecutor, {
    snapshotId,
    ...writeContext,
    invalidatedAt: persistedAt,
    safeInvalidationCode: "SNAPSHOT_INTEGRITY_FAILURE",
  })) && quarantineExecutor.complete,
  "corrupt snapshot quarantine is one guarded non-destructive update",
);
const lostQuarantineExecutor = new ScriptedExecutor([
  {
    name: "foodseyo-invalidate-active-analysis-snapshot",
    rows: [],
  },
]);
verify(
  !(await invalidateActiveAnalysisSnapshot(lostQuarantineExecutor, {
    snapshotId,
    ...writeContext,
    invalidatedAt: persistedAt,
    safeInvalidationCode: "SNAPSHOT_INTEGRITY_FAILURE",
  })),
  "an unconfirmed quarantine is observable and cannot authorize replacement",
);

const touchExecutor = new ScriptedExecutor([
  {
    name: "foodseyo-touch-active-analysis-snapshot",
    rows: [{ id: snapshotId }],
  },
]);
verify(
  await touchActiveAnalysisSnapshot(touchExecutor, {
    snapshotId,
    ...writeContext,
    accessedAt: persistedAt,
  }),
  "valid cache access updates only guarded access metadata",
);

const processingContext = {
  ...processingRun,
  sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
  fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
  ...prepared.cacheIdentity.analysisContract,
};
const persistenceDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-select-active-snapshot-before-uncached-persistence",
    rows: [],
  },
  {
    name: "foodseyo-insert-post-provider-processing-analysis-run",
    rows: [processingRun],
  },
  {
    name: "foodseyo-lock-processing-run-for-ready-snapshot",
    rows: [processingContext],
  },
  {
    name: "foodseyo-insert-ready-analysis-snapshot",
    rows: [snapshotRecord],
  },
  {
    name: "foodseyo-mark-analysis-run-ready",
    rows: [readyRun],
  },
]);
const persisted = await persistUncachedReadyAnalysisSnapshot(
  persistenceDatabase,
  {
    analysisRunId: runId,
    ...writeContext,
    canonicalResult: canonical,
    persistedAt,
  },
);
verify(
  persisted.state === "persisted" &&
    persistenceDatabase.commits === 1 &&
    persistenceDatabase.rollbacks === 0 &&
    persistenceDatabase.complete,
  "post-provider run creation, snapshot insert, and ready transition commit atomically",
);

const concurrentDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-select-active-snapshot-before-uncached-persistence",
    rows: [{ id: snapshotId }],
  },
]);
verify(
  (await persistUncachedReadyAnalysisSnapshot(concurrentDatabase, {
    analysisRunId: runId,
    ...writeContext,
    canonicalResult: canonical,
    persistedAt,
  })).state === "already_present" &&
    concurrentDatabase.commits === 1 &&
    concurrentDatabase.complete,
  "an already-active snapshot prevents a duplicate post-provider run",
);

const rollbackDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-select-active-snapshot-before-uncached-persistence",
    rows: [],
  },
  {
    name: "foodseyo-insert-post-provider-processing-analysis-run",
    rows: [processingRun],
  },
  {
    name: "foodseyo-lock-processing-run-for-ready-snapshot",
    rows: [processingContext],
  },
  {
    name: "foodseyo-insert-ready-analysis-snapshot",
    rows: [snapshotRecord],
  },
  {
    name: "foodseyo-mark-analysis-run-ready",
    rows: [],
  },
]);
verify(
  (await captureError(() =>
    persistUncachedReadyAnalysisSnapshot(rollbackDatabase, {
      analysisRunId: runId,
      ...writeContext,
      canonicalResult: canonical,
      persistedAt,
    }),
  )) !== null &&
    rollbackDatabase.commits === 0 &&
    rollbackDatabase.rollbacks === 1,
  "post-provider persistence failure rolls back the run and snapshot together",
);

const [
  routeSource,
  databaseCacheSource,
  handlerSource,
  runtimeCacheSource,
  coordinatorSource,
] = await Promise.all([
  readFile(
    new URL(
      "../src/app/api/analyze/menu-images/route.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../src/services/menu-analysis/database-menu-analysis-exact-cache.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../src/services/menu-analysis/menu-analysis-post-handler.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../src/services/menu-analysis/runtime-menu-analysis-exact-cache.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../src/services/menu-analysis/menu-analysis-exact-cache.ts",
      import.meta.url,
    ),
    "utf8",
  ),
]);
verify(
  routeSource.includes("createRuntimeMenuAnalysisExactCache") &&
    routeSource.includes("analysisCache"),
  "the live route is wired to the lazy server-only exact-cache adapter",
);
verify(
  handlerSource.indexOf(
    "const prepared = await prepareMenuImagesAnalysis",
  ) <
    handlerSource.indexOf(
      "const cacheResult = await resolveMenuAnalysisWithExactCache",
    ) &&
    handlerSource.includes("createPreparedMenuImagesAnalyzer"),
  "complete cache identity is prepared before lookup and reused on a miss",
);
verify(
  runtimeCacheSource.includes('import "server-only"') &&
    runtimeCacheSource.includes("createDatabaseMenuAnalysisExactCache") &&
    databaseCacheSource.includes("inspectActiveAnalysisSnapshot") &&
    databaseCacheSource.includes("invalidateActiveAnalysisSnapshot") &&
    databaseCacheSource.includes("persistUncachedReadyAnalysisSnapshot"),
  "the server-only runtime wrapper delegates to validated read, quarantine, and atomic persistence",
);
verify(
  !/setTimeout|ANALYSIS_CACHE_BUSY|ANALYSIS_CACHE_INDETERMINATE|ANALYSIS_IN_PROGRESS|ANALYSIS_TEMPORARILY_UNAVAILABLE/u.test(
    `${runtimeCacheSource}\n${databaseCacheSource}\n${coordinatorSource}`,
  ),
  "C2.1-D adds no lease polling or C2.1-E public failure policy",
);
verify(
  !/DELETE|DATABASE_MIGRATION_URL|OPENAI_API_KEY/u.test(
    `${runtimeCacheSource}\n${databaseCacheSource}\n${coordinatorSource}`,
  ),
  "exact-cache integration has no delete, migrator credential, or provider secret path",
);
verify(
  contractRecord.id === writeContext.analysisContractId &&
    evidenceRecord.id === writeContext.menuEvidenceSetId,
  "synthetic repository identities remain internally exact",
);
verify(
  networkGuard.callCount === 0,
  "exact-cache integration validation makes zero network calls",
);
networkGuard.restore();

report();
