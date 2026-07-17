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
  ANALYSIS_CACHE_POOL_MAX_CONNECTIONS,
  AnalysisCacheRuntimeConfigurationError,
  createAnalysisCachePoolConfig,
} from "../src/lib/database/runtime-config.ts";
import {
  AnalysisCacheRepositoryError,
  createProcessingAnalysisRun,
  findActiveAnalysisSnapshot,
  findAnalysisRunById,
  getOrCreateAnalysisContract,
  getOrCreateUploadedMenuEvidenceSet,
  markProcessingAnalysisRunFailed,
  persistReadyAnalysisSnapshot,
  type AnalysisContractRecord,
  type AnalysisRunRecord,
  type AnalysisSnapshotRecord,
  type MenuEvidenceSetRecord,
} from "../src/lib/database/repositories/index.ts";
import {
  SOURCE_FINGERPRINT_VERSION,
  createSnapshotResultFingerprint,
} from "../src/services/menu-analysis/menu-cache-contract.ts";
import { createMenuAnalysisVersionMetadata } from "../src/services/menu-analysis/menu-analysis-versions.ts";
import {
  captureError,
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";
import { createCurrentAnalysisFixture } from "./fixtures/current-analysis-fixture.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo analysis cache repository validation",
  "Analysis cache repository validation failed",
);
const networkGuard = installNetworkGuard(
  "Analysis cache repository validation must not use the network.",
);

interface ScriptedQuery {
  readonly name: string;
  readonly rows: readonly QueryResultRow[];
  readonly inspect?: (config: QueryConfig) => void;
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
  readonly observedNames: string[] = [];
  private readonly script: ScriptedQuery[];

  constructor(script: ScriptedQuery[]) {
    this.script = script;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    const step = this.script.shift();
    if (!step || config.name !== step.name) {
      throw new Error("Unexpected repository query.");
    }
    step.inspect?.(config);
    this.observedNames.push(step.name);
    return queryResult(step.rows as readonly Row[]);
  }

  get complete(): boolean {
    return this.script.length === 0;
  }
}

class ScriptedTransactionManager
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

const contractId = "10000000-0000-4000-8000-000000000001";
const evidenceId = "20000000-0000-4000-8000-000000000002";
const runId = "30000000-0000-4000-8000-000000000003";
const snapshotId = "40000000-0000-4000-8000-000000000004";
const sourceFingerprint = `source_${"1".repeat(64)}`;
const startedAt = new Date("2026-07-17T12:00:00.000Z");
const persistedAt = new Date("2026-07-17T12:00:10.000Z");
const leaseExpiresAt = new Date("2026-07-17T12:02:00.000Z");
const versions = createMenuAnalysisVersionMetadata("gpt-5.6");
const contractIdentity = {
  modelVersion: versions.modelVersion,
  promptVersion: versions.promptVersion,
  providerSchemaVersion: versions.providerSchemaVersion,
  canonicalSchemaVersion: versions.canonicalSchemaVersion,
  consistencyProfileVersion: versions.consistencyProfileVersion,
};
const contractRecord: AnalysisContractRecord = {
  id: contractId,
  ...contractIdentity,
  createdAt: startedAt,
};
const evidenceRecord: MenuEvidenceSetRecord = {
  id: evidenceId,
  inputKind: "uploaded_menu_images",
  sourceFingerprint,
  fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
  imageCount: 1,
  normalizedUrl: null,
  sourceProvider: null,
  observedAt: startedAt,
  createdAt: startedAt,
};
const processingRun: AnalysisRunRecord = {
  id: runId,
  menuEvidenceSetId: evidenceId,
  analysisContractId: contractId,
  status: "processing",
  attemptNumber: 1,
  safeErrorCode: null,
  startedAt,
  leaseExpiresAt,
  finishedAt: null,
  createdAt: startedAt,
  updatedAt: startedAt,
};
const readyRun: AnalysisRunRecord = {
  ...processingRun,
  status: "ready",
  leaseExpiresAt: null,
  finishedAt: persistedAt,
  updatedAt: persistedAt,
};
const failedRun: AnalysisRunRecord = {
  ...processingRun,
  status: "failed",
  safeErrorCode: "PROVIDER_FAILED",
  leaseExpiresAt: null,
  finishedAt: persistedAt,
  updatedAt: persistedAt,
};

const safeRuntimeUrl =
  "postgresql://foodseyo_runtime:synthetic@ep-test-pooler.example.neon.tech/foodseyo?sslmode=require&channel_binding=require";
const poolConfig = createAnalysisCachePoolConfig({
  DATABASE_URL: safeRuntimeUrl,
});
verify(
  poolConfig.connectionString === safeRuntimeUrl &&
    poolConfig.max === ANALYSIS_CACHE_POOL_MAX_CONNECTIONS &&
    poolConfig.max === 5,
  "runtime configuration accepts only the bounded pooled runtime contract",
);
for (const invalidUrl of [
  undefined,
  "postgresql://foodseyo_migrator:synthetic@ep-test-pooler.example.neon.tech/foodseyo?sslmode=require&channel_binding=require",
  "postgresql://foodseyo_runtime:synthetic@ep-test.example.neon.tech/foodseyo?sslmode=require&channel_binding=require",
  "postgresql://foodseyo_runtime:synthetic@ep-test-pooler.example.neon.tech/foodseyo?sslmode=disable&channel_binding=require",
]) {
  verify(
    (await captureError(() =>
      createAnalysisCachePoolConfig({ DATABASE_URL: invalidUrl }),
    )) instanceof AnalysisCacheRuntimeConfigurationError,
    "runtime configuration rejects a non-runtime, non-pooled, or non-TLS contract",
  );
}

const runtimeSource = await readFile(
  new URL("../src/lib/database/runtime.ts", import.meta.url),
  "utf8",
);
verify(
  runtimeSource.includes('import "server-only"') &&
    runtimeSource.includes("attachDatabasePool(pool)") &&
    runtimeSource.includes("let runtimeDatabase") &&
    runtimeSource.includes("createAnalysisCachePoolConfig(process.env)"),
  "runtime client is server-only, module-scoped, pooled, and Fluid Compute attached",
);
verify(
  !runtimeSource.includes("DATABASE_MIGRATION_URL") &&
    !runtimeSource.includes("DATABASE_URL_UNPOOLED"),
  "runtime client reads no migration or direct database contract",
);

const contractExecutor = new ScriptedExecutor([
  { name: "foodseyo-insert-analysis-contract", rows: [] },
  {
    name: "foodseyo-select-analysis-contract",
    rows: [contractRecord],
  },
]);
verify(
  (await getOrCreateAnalysisContract(
    contractExecutor,
    contractIdentity,
  )).id === contractId && contractExecutor.complete,
  "analysis contract repository resolves the immutable five-value identity",
);
verify(
  (await captureError(() =>
    getOrCreateAnalysisContract(contractExecutor, {
      ...contractIdentity,
      promptVersion: ` ${contractIdentity.promptVersion}`,
    }),
  )) instanceof AnalysisCacheRepositoryError,
  "analysis contract repository rejects identity normalization drift",
);

const evidenceExecutor = new ScriptedExecutor([
  { name: "foodseyo-insert-uploaded-menu-evidence", rows: [] },
  { name: "foodseyo-select-menu-evidence", rows: [evidenceRecord] },
]);
verify(
  (await getOrCreateUploadedMenuEvidenceSet(evidenceExecutor, {
    sourceFingerprint,
    fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
    imageCount: 1,
    observedAt: startedAt,
  })).id === evidenceId && evidenceExecutor.complete,
  "menu evidence repository resolves the exact uploaded-image identity",
);
const conflictingEvidenceExecutor = new ScriptedExecutor([
  { name: "foodseyo-insert-uploaded-menu-evidence", rows: [] },
  {
    name: "foodseyo-select-menu-evidence",
    rows: [{ ...evidenceRecord, imageCount: 2 }],
  },
]);
verify(
  (await captureError(() =>
    getOrCreateUploadedMenuEvidenceSet(conflictingEvidenceExecutor, {
      sourceFingerprint,
      fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
      imageCount: 1,
      observedAt: startedAt,
    }),
  )) instanceof AnalysisCacheRepositoryError,
  "menu evidence repository rejects conflicting identity metadata",
);

const createRunExecutor = new ScriptedExecutor([
  {
    name: "foodseyo-insert-processing-analysis-run",
    rows: [processingRun],
  },
]);
verify(
  (await createProcessingAnalysisRun(createRunExecutor, {
    id: runId,
    menuEvidenceSetId: evidenceId,
    analysisContractId: contractId,
    attemptNumber: 1,
    startedAt,
    leaseExpiresAt,
  })).status === "processing" && createRunExecutor.complete,
  "analysis run repository inserts only a validated processing primitive",
);
const findRunExecutor = new ScriptedExecutor([
  { name: "foodseyo-select-analysis-run", rows: [processingRun] },
]);
verify(
  (await findAnalysisRunById(findRunExecutor, runId))?.id === runId,
  "analysis run repository validates rows on read",
);
const failRunExecutor = new ScriptedExecutor([
  {
    name: "foodseyo-fail-processing-analysis-run",
    rows: [failedRun],
  },
]);
verify(
  (await markProcessingAnalysisRunFailed(failRunExecutor, {
    id: runId,
    menuEvidenceSetId: evidenceId,
    analysisContractId: contractId,
    safeErrorCode: "PROVIDER_FAILED",
    failedAt: persistedAt,
  })).status === "failed",
  "analysis run repository performs a guarded processing-to-failed transition",
);

const canonicalResult = await createCurrentAnalysisFixture({
  sourceFingerprint,
  versions,
});
const resultFingerprint = await createSnapshotResultFingerprint(
  canonicalResult,
);
const snapshotRecord: AnalysisSnapshotRecord = {
  id: snapshotId,
  menuEvidenceSetId: evidenceId,
  analysisContractId: contractId,
  analysisRunId: runId,
  resultFingerprint,
  canonicalResultJson: canonicalResult,
  createdAt: persistedAt,
  lastAccessedAt: persistedAt,
  expiresAt: null,
  invalidatedAt: null,
  safeInvalidationCode: null,
};
const snapshotContext = {
  ...snapshotRecord,
  sourceFingerprint,
  fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
  ...contractIdentity,
};
const readSnapshotExecutor = new ScriptedExecutor([
  {
    name: "foodseyo-select-active-analysis-snapshot",
    rows: [snapshotContext],
  },
]);
verify(
  (await findActiveAnalysisSnapshot(readSnapshotExecutor, {
    menuEvidenceSetId: evidenceId,
    analysisContractId: contractId,
  }))?.canonicalResultJson.analysisId === canonicalResult.analysisId,
  "snapshot repository validates structure, semantics, exact identity, and fingerprint on read",
);
const corruptSnapshotExecutor = new ScriptedExecutor([
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
verify(
  (await captureError(() =>
    findActiveAnalysisSnapshot(corruptSnapshotExecutor, {
      menuEvidenceSetId: evidenceId,
      analysisContractId: contractId,
    }),
  )) instanceof AnalysisCacheRepositoryError,
  "snapshot repository never returns a fingerprint-mismatched canonical result",
);

const processingContext = {
  ...processingRun,
  sourceFingerprint,
  fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
  ...contractIdentity,
};
const persistenceDatabase = new ScriptedTransactionManager([
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
const persisted = await persistReadyAnalysisSnapshot(persistenceDatabase, {
  analysisRunId: runId,
  menuEvidenceSetId: evidenceId,
  analysisContractId: contractId,
  canonicalResult,
  persistedAt,
});
verify(
  persisted.analysisRun.status === "ready" &&
    persisted.snapshot.resultFingerprint === resultFingerprint &&
    persistenceDatabase.commits === 1 &&
    persistenceDatabase.rollbacks === 0 &&
    persistenceDatabase.complete,
  "ready snapshot insert and run transition share one successful transaction",
);

const rollbackDatabase = new ScriptedTransactionManager([
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
    persistReadyAnalysisSnapshot(rollbackDatabase, {
      analysisRunId: runId,
      menuEvidenceSetId: evidenceId,
      analysisContractId: contractId,
      canonicalResult,
      persistedAt,
    }),
  )) instanceof AnalysisCacheRepositoryError &&
    rollbackDatabase.commits === 0 &&
    rollbackDatabase.rollbacks === 1,
  "run-ready failure rolls the snapshot transaction back",
);

const repositorySources = await Promise.all(
  [
    "analysis-contracts.ts",
    "menu-evidence-sets.ts",
    "analysis-runs.ts",
    "analysis-snapshots.ts",
    "persist-ready-analysis-snapshot.ts",
  ].map((fileName) =>
    readFile(
      new URL(
        `../src/lib/database/repositories/${fileName}`,
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
const combinedRepositorySource = repositorySources.join("\n");
verify(
  combinedRepositorySource.includes("FOR UPDATE OF run_record") &&
    combinedRepositorySource.includes("withTransaction") &&
    combinedRepositorySource.includes("canonical_result_json"),
  "repository source preserves guarded locking and atomic canonical persistence",
);
verify(
  !/\bDELETE\b|CREATE\s+TABLE|ALTER\s+TABLE|DATABASE_MIGRATION_URL/iu.test(
    combinedRepositorySource,
  ),
  "repository source contains no delete, DDL, or migration credential path",
);

const liveRouteSources = await Promise.all([
  readFile(
    new URL(
      "../src/app/api/analyze/menu-images/route.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../src/services/menu-analysis/menu-images-analyzer.ts",
      import.meta.url,
    ),
    "utf8",
  ),
]);
verify(
  liveRouteSources[0]?.includes("createRuntimeMenuAnalysisExactCache") &&
    liveRouteSources[1]?.includes("createPreparedMenuImagesAnalyzer"),
  "C2.1-D composes the existing repositories above the prepared provider boundary",
);

networkGuard.restore();
report();
