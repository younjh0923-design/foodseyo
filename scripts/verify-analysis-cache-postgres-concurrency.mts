import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  Pool,
  type PoolClient,
  type QueryConfig,
  type QueryResult,
  type QueryResultRow,
} from "pg";

import type {
  AnalysisCacheQueryExecutor,
  AnalysisCacheTransactionManager,
} from "../src/lib/database/database-port.ts";
import {
  AnalysisCacheRepositoryError,
  createProcessingAnalysisRun,
  getOrCreateAnalysisContract,
  getOrCreateUploadedMenuEvidenceSet,
  persistReadyAnalysisSnapshot,
  type SafeSnapshotInvalidationCode,
} from "../src/lib/database/repositories/index.ts";
import { createAnalysisCachePoolConfig } from "../src/lib/database/runtime-config.ts";
import { createDatabaseMenuAnalysisExactCache } from "../src/services/menu-analysis/database-menu-analysis-exact-cache.ts";
import {
  MenuAnalysisCachePublicError,
  resolveMenuAnalysisWithExactCache,
  type MenuAnalysisCacheOwnership,
} from "../src/services/menu-analysis/menu-analysis-exact-cache.ts";
import { prepareMenuImagesAnalysis } from "../src/services/menu-analysis/menu-analysis-preparation.ts";
import {
  ANALYSIS_CACHE_BUSY_WAIT_MAX_MS,
  ANALYSIS_RUN_LEASE_DURATION_MS,
  createSnapshotResultFingerprint,
} from "../src/services/menu-analysis/menu-cache-contract.ts";
import { createCurrentAnalysisFixture } from "./fixtures/current-analysis-fixture.mts";
import { installNetworkGuard } from "./test-support/validation.mts";

type PreparedAnalysis = Awaited<
  ReturnType<typeof prepareMenuImagesAnalysis>
>;
type CanonicalAnalysis = Awaited<
  ReturnType<typeof createCurrentAnalysisFixture>
>;

interface PreparedCase {
  readonly prepared: PreparedAnalysis;
  readonly canonical: CanonicalAnalysis;
}

interface CacheIdentity {
  readonly menuEvidenceSetId: string;
  readonly analysisContractId: string;
}

class PoolDatabase implements AnalysisCacheTransactionManager {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(config);
  }

  async withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work({
        query<Row extends QueryResultRow = QueryResultRow>(
          config: QueryConfig,
        ) {
          return client.query<Row>(config);
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original validation failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

type TransactionFaultMode = "rollback_before_commit" | "throw_after_commit";

class TransactionOutcomeFaultDatabase
  implements AnalysisCacheTransactionManager
{
  private readonly database: AnalysisCacheTransactionManager;
  private readonly targetQueryName: string;
  private readonly mode: TransactionFaultMode;
  private triggered = false;

  constructor(
    database: AnalysisCacheTransactionManager,
    targetQueryName: string,
    mode: TransactionFaultMode,
  ) {
    this.database = database;
    this.targetQueryName = targetQueryName;
    this.mode = mode;
  }

  get triggerCount(): number {
    return this.triggered ? 1 : 0;
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    return this.database.query<Row>(config);
  }

  async withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    let targetObserved = false;
    const targetQueryName = this.targetQueryName;
    const wrappedWork = (executor: AnalysisCacheQueryExecutor) =>
      work({
        query<Row extends QueryResultRow = QueryResultRow>(
          config: QueryConfig,
        ): Promise<QueryResult<Row>> {
          if (config.name === targetQueryName) {
            targetObserved = true;
          }
          return executor.query<Row>(config);
        },
      });

    if (this.mode === "rollback_before_commit") {
      return this.database.withTransaction(async (executor) => {
        const result = await wrappedWork(executor);
        if (targetObserved && !this.triggered) {
          this.triggered = true;
          throw new Error("synthetic transaction outcome failure");
        }
        return result;
      });
    }

    const result = await this.database.withTransaction(wrappedWork);
    if (targetObserved && !this.triggered) {
      this.triggered = true;
      throw new Error("synthetic ambiguous commit result");
    }
    return result;
  }
}

type QuarantineFaultMode = "unconfirmed" | "failed";

class QuarantineFaultDatabase implements AnalysisCacheTransactionManager {
  private readonly database: AnalysisCacheTransactionManager;
  private readonly mode: QuarantineFaultMode;

  constructor(
    database: AnalysisCacheTransactionManager,
    mode: QuarantineFaultMode,
  ) {
    this.database = database;
    this.mode = mode;
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    return this.intercept(this.database, config);
  }

  withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    return this.database.withTransaction((executor) =>
      work({
        query: <Row extends QueryResultRow = QueryResultRow>(
          config: QueryConfig,
        ) => this.intercept<Row>(executor, config),
      }),
    );
  }

  private intercept<Row extends QueryResultRow>(
    executor: AnalysisCacheQueryExecutor,
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    if (
      config.name !==
      "foodseyo-invalidate-active-analysis-snapshot"
    ) {
      return executor.query<Row>(config);
    }
    if (this.mode === "failed") {
      return Promise.reject(new Error("synthetic quarantine failure"));
    }
    return Promise.resolve({
      command: "UPDATE",
      rowCount: 0,
      oid: 0,
      fields: [],
      rows: [],
    } as QueryResult<Row>);
  }
}

const verifyRuntimeConnection = async (
  client: PoolClient,
): Promise<void> => {
  const result = await client.query<{ currentUser: string }>({
    name: "foodseyo-c2-1-f-runtime-connection",
    text: 'SELECT current_user AS "currentUser"',
  });
  const stream = (
    client as unknown as {
      readonly connection?: {
        readonly stream?: { readonly encrypted?: boolean };
      };
    }
  ).connection?.stream;
  assert.equal(result.rows[0]?.currentUser, "foodseyo_runtime");
  assert.equal(stream?.encrypted, true);
};

const prepareCase = async (label: string): Promise<PreparedCase> => {
  const bytes = new TextEncoder().encode(
    `foodseyo-c2-1-f-${label}-${randomUUID()}`,
  );
  const prepared = await prepareMenuImagesAnalysis(
    {
      type: "menu_images",
      images: [
        {
          id: "ephemeral-development-validation",
          fileName: null,
          mediaType: "image/jpeg",
          byteLength: bytes.byteLength,
          async read() {
            return bytes.slice();
          },
        },
      ],
      userEnteredRestaurantName: null,
      location: null,
    },
    { environment: process.env },
  );
  const canonical = await createCurrentAnalysisFixture({
    sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
    versions: prepared.versions,
  });
  return { prepared, canonical };
};

const resolveIdentity = async (
  database: AnalysisCacheTransactionManager,
  prepared: PreparedAnalysis,
): Promise<CacheIdentity> => {
  const [contract, evidence] = await Promise.all([
    getOrCreateAnalysisContract(
      database,
      prepared.cacheIdentity.analysisContract,
    ),
    getOrCreateUploadedMenuEvidenceSet(database, {
      sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
      fingerprintVersion:
        prepared.cacheIdentity.sourceFingerprintVersion,
      imageCount: prepared.imageCount,
      observedAt: new Date(),
    }),
  ]);
  return {
    menuEvidenceSetId: evidence.id,
    analysisContractId: contract.id,
  };
};

const readIdentityCounts = async (
  database: AnalysisCacheTransactionManager,
  identity: CacheIdentity,
): Promise<{
  readonly processingCount: number;
  readonly readyCount: number;
  readonly failedCount: number;
  readonly activeSnapshotCount: number;
  readonly snapshotCount: number;
}> => {
  const result = await database.query<{
    processingCount: number;
    readyCount: number;
    failedCount: number;
    activeSnapshotCount: number;
    snapshotCount: number;
  }>({
    name: "foodseyo-c2-1-f-identity-counts",
    text: `
      SELECT
        (
          SELECT count(*)::integer
          FROM public.analysis_runs
          WHERE menu_evidence_set_id = $1
            AND analysis_contract_id = $2
            AND status = 'processing'
        ) AS "processingCount",
        (
          SELECT count(*)::integer
          FROM public.analysis_runs
          WHERE menu_evidence_set_id = $1
            AND analysis_contract_id = $2
            AND status = 'ready'
        ) AS "readyCount",
        (
          SELECT count(*)::integer
          FROM public.analysis_runs
          WHERE menu_evidence_set_id = $1
            AND analysis_contract_id = $2
            AND status = 'failed'
        ) AS "failedCount",
        (
          SELECT count(*)::integer
          FROM public.analysis_snapshots
          WHERE menu_evidence_set_id = $1
            AND analysis_contract_id = $2
            AND invalidated_at IS NULL
        ) AS "activeSnapshotCount",
        (
          SELECT count(*)::integer
          FROM public.analysis_snapshots
          WHERE menu_evidence_set_id = $1
            AND analysis_contract_id = $2
        ) AS "snapshotCount"
    `,
    values: [
      identity.menuEvidenceSetId,
      identity.analysisContractId,
    ],
  });
  const row = result.rows[0];
  assert.ok(row);
  return row;
};

const readRunHistory = async (
  database: AnalysisCacheTransactionManager,
  identity: CacheIdentity,
): Promise<
  readonly {
    readonly attemptNumber: number;
    readonly status: string;
    readonly safeErrorCode: string | null;
  }[]
> => {
  const result = await database.query<{
    attemptNumber: number;
    status: string;
    safeErrorCode: string | null;
  }>({
    name: "foodseyo-c2-1-f-run-history",
    text: `
      SELECT
        attempt_number AS "attemptNumber",
        status,
        safe_error_code AS "safeErrorCode"
      FROM public.analysis_runs
      WHERE menu_evidence_set_id = $1
        AND analysis_contract_id = $2
      ORDER BY attempt_number
    `,
    values: [
      identity.menuEvidenceSetId,
      identity.analysisContractId,
    ],
  });
  return result.rows;
};

const readSnapshotInvalidation = async (
  database: AnalysisCacheTransactionManager,
  snapshotId: string,
): Promise<{
  readonly invalidated: boolean;
  readonly safeInvalidationCode: string | null;
}> => {
  const result = await database.query<{
    invalidated: boolean;
    safeInvalidationCode: string | null;
  }>({
    name: "foodseyo-c2-1-f-snapshot-invalidation",
    text: `
      SELECT
        invalidated_at IS NOT NULL AS invalidated,
        safe_invalidation_code AS "safeInvalidationCode"
      FROM public.analysis_snapshots
      WHERE id = $1
    `,
    values: [snapshotId],
  });
  const row = result.rows[0];
  assert.ok(row);
  return row;
};

const seedReadySnapshot = async (input: {
  readonly database: AnalysisCacheTransactionManager;
  readonly identity: CacheIdentity;
  readonly canonicalResult: unknown;
  readonly resultFingerprint: string;
  readonly createdAt?: Date;
  readonly expiresAt?: Date | null;
}): Promise<string> => {
  const createdAt = input.createdAt ?? new Date();
  const startedAt = new Date(createdAt.getTime() - 1_000);
  const runId = randomUUID();
  const snapshotId = randomUUID();
  await input.database.withTransaction(async (executor) => {
    await executor.query({
      name: "foodseyo-c2-1-f-seed-ready-run",
      text: `
        INSERT INTO public.analysis_runs (
          id,
          menu_evidence_set_id,
          analysis_contract_id,
          status,
          attempt_number,
          safe_error_code,
          started_at,
          lease_expires_at,
          finished_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, 'ready', 1, NULL, $4, NULL, $5, $4, $5
        )
      `,
      values: [
        runId,
        input.identity.menuEvidenceSetId,
        input.identity.analysisContractId,
        startedAt,
        createdAt,
      ],
    });
    await executor.query({
      name: "foodseyo-c2-1-f-seed-ready-snapshot",
      text: `
        INSERT INTO public.analysis_snapshots (
          id,
          menu_evidence_set_id,
          analysis_contract_id,
          analysis_run_id,
          result_fingerprint,
          canonical_result_json,
          created_at,
          last_accessed_at,
          expires_at,
          invalidated_at,
          safe_invalidation_code
        )
        VALUES (
          $1, $2, $3, $4, $5, $6::jsonb, $7, $7, $8, NULL, NULL
        )
      `,
      values: [
        snapshotId,
        input.identity.menuEvidenceSetId,
        input.identity.analysisContractId,
        runId,
        input.resultFingerprint,
        input.canonicalResult,
        createdAt,
        input.expiresAt ?? null,
      ],
    });
  });
  return snapshotId;
};

const captureError = async (
  operation: () => Promise<unknown>,
): Promise<unknown> => {
  try {
    await operation();
    return null;
  } catch (error) {
    return error;
  }
};

const isRepositoryError = (
  error: unknown,
  code: string,
): boolean =>
  error instanceof AnalysisCacheRepositoryError &&
  error.code === code;

const failOwner = async (
  cache: ReturnType<typeof createDatabaseMenuAnalysisExactCache>,
  ownership: MenuAnalysisCacheOwnership,
): Promise<void> => {
  assert.equal(
    await cache.failOwned(ownership, "VALIDATION_CLEANUP"),
    true,
  );
};

if (process.env.FOODSEYO_C2_1_F_EPHEMERAL_VALIDATION !== "1") {
  throw new Error(
    "C2.1-F requires an explicitly isolated ephemeral Development branch.",
  );
}

const pool = new Pool(createAnalysisCachePoolConfig(process.env));
const database = new PoolDatabase(pool);
const networkGuard = installNetworkGuard(
  "C2.1-F must not make an HTTP or OpenAI request.",
);
let verificationStage = "connect";
let assertionCount = 0;
const verify = (condition: boolean, label: string): void => {
  assert.ok(condition, label);
  assertionCount += 1;
};

try {
  const client = await pool.connect();
  try {
    await verifyRuntimeConnection(client);
    assertionCount += 2;
  } finally {
    client.release();
  }

  verificationStage = "initial-empty-state";
  const initialCounts = await database.query<{
    contractCount: number;
    evidenceCount: number;
    runCount: number;
    snapshotCount: number;
  }>({
    name: "foodseyo-c2-1-f-initial-empty-counts",
    text: `
      SELECT
        (SELECT count(*)::integer FROM public.analysis_contracts)
          AS "contractCount",
        (SELECT count(*)::integer FROM public.menu_evidence_sets)
          AS "evidenceCount",
        (SELECT count(*)::integer FROM public.analysis_runs)
          AS "runCount",
        (SELECT count(*)::integer FROM public.analysis_snapshots)
          AS "snapshotCount"
    `,
  });
  verify(
    JSON.stringify(initialCounts.rows[0]) ===
      JSON.stringify({
        contractCount: 0,
        evidenceCount: 0,
        runCount: 0,
        snapshotCount: 0,
      }),
    "the ephemeral branch must start with empty application tables",
  );

  verificationStage = "repeated-identical-request-concurrency";
  const concurrencyRounds = 4;
  const callersPerRound = 5;
  for (let round = 0; round < concurrencyRounds; round += 1) {
    const preparedCase = await prepareCase(`concurrency-${round}`);
    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => database,
    });
    let providerCalls = 0;
    const results = await Promise.all(
      Array.from({ length: callersPerRound }, () =>
        resolveMenuAnalysisWithExactCache({
          prepared: preparedCase.prepared,
          cache,
          async analyzeUncached() {
            providerCalls += 1;
            await new Promise((resolve) => setTimeout(resolve, 450));
            return preparedCase.canonical;
          },
        }),
      ),
    );
    const identity = await resolveIdentity(
      database,
      preparedCase.prepared,
    );
    const counts = await readIdentityCounts(database, identity);
    verify(
      providerCalls === 1,
      "each repeated concurrency round elects one provider owner",
    );
    verify(
      results.filter((result) => result.cacheReadState === "miss")
        .length === 1,
      "each repeated concurrency round has one owner result",
    );
    verify(
      results.filter((result) => result.cacheReadState === "hit")
        .length ===
        callersPerRound - 1,
      "all duplicate callers reuse the completed snapshot",
    );
    verify(
      results.every(
        (result) =>
          result.analysis.analysisId ===
          preparedCase.canonical.analysisId,
      ),
      "all concurrent callers receive the same canonical snapshot",
    );
    verify(
      counts.processingCount === 0 &&
        counts.readyCount === 1 &&
        counts.failedCount === 0 &&
        counts.activeSnapshotCount === 1 &&
        counts.snapshotCount === 1,
      "each concurrency round commits exactly one ready run and snapshot",
    );

    let subsequentProviderCalls = 0;
    const reused = await resolveMenuAnalysisWithExactCache({
      prepared: preparedCase.prepared,
      cache,
      async analyzeUncached() {
        subsequentProviderCalls += 1;
        return preparedCase.canonical;
      },
    });
    verify(
      reused.cacheReadState === "hit" &&
        subsequentProviderCalls === 0,
      "a completed snapshot remains reusable with no provider invocation",
    );
  }

  verificationStage = "active-owner-bounded-409";
  {
    const preparedCase = await prepareCase("active-owner");
    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => database,
    });
    const owner = await cache.claim(preparedCase.prepared);
    assert.equal(owner.state, "owner");
    if (owner.state !== "owner") {
      throw new Error("The active-owner case did not acquire ownership.");
    }
    let providerCalls = 0;
    const startedAt = performance.now();
    const error = await captureError(() =>
      resolveMenuAnalysisWithExactCache({
        prepared: preparedCase.prepared,
        cache,
        async analyzeUncached() {
          providerCalls += 1;
          return preparedCase.canonical;
        },
      }),
    );
    const elapsedMs = performance.now() - startedAt;
    verify(
      error instanceof MenuAnalysisCachePublicError &&
        error.result.code === "ANALYSIS_IN_PROGRESS" &&
        error.result.httpStatus === 409 &&
        error.result.retryAfterSeconds === 2,
      "an unresolved active owner returns the frozen 409 contract",
    );
    verify(
      providerCalls === 0,
      "an active duplicate never invokes the provider",
    );
    verify(
      elapsedMs >= ANALYSIS_CACHE_BUSY_WAIT_MAX_MS - 100 &&
        elapsedMs < ANALYSIS_CACHE_BUSY_WAIT_MAX_MS + 5_000,
      "active-owner polling is bounded by the frozen wait",
    );
    await failOwner(cache, owner.ownership);
    assertionCount += 1;
  }

  verificationStage = "indeterminate-acquisition-503";
  {
    const preparedCase = await prepareCase(
      "indeterminate-acquisition",
    );
    const faultDatabase = new TransactionOutcomeFaultDatabase(
      database,
      "foodseyo-insert-processing-analysis-run",
      "rollback_before_commit",
    );
    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => faultDatabase,
    });
    let providerCalls = 0;
    const error = await captureError(() =>
      resolveMenuAnalysisWithExactCache({
        prepared: preparedCase.prepared,
        cache,
        async analyzeUncached() {
          providerCalls += 1;
          return preparedCase.canonical;
        },
      }),
    );
    const identity = await resolveIdentity(
      database,
      preparedCase.prepared,
    );
    const counts = await readIdentityCounts(database, identity);
    verify(
      error instanceof MenuAnalysisCachePublicError &&
        error.result.code ===
          "ANALYSIS_TEMPORARILY_UNAVAILABLE" &&
        error.result.httpStatus === 503,
      "a rolled-back ambiguous acquisition returns the frozen 503 contract",
    );
    verify(
      providerCalls === 0 &&
        faultDatabase.triggerCount === 1 &&
        counts.processingCount === 0 &&
        counts.readyCount === 0 &&
        counts.snapshotCount === 0,
      "indeterminate ownership never fails open or persists",
    );
  }

  verificationStage = "ambiguous-acquisition-commit-recovery";
  {
    const preparedCase = await prepareCase(
      "ambiguous-acquisition-commit",
    );
    const faultDatabase = new TransactionOutcomeFaultDatabase(
      database,
      "foodseyo-insert-processing-analysis-run",
      "throw_after_commit",
    );
    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => faultDatabase,
    });
    let providerCalls = 0;
    const result = await resolveMenuAnalysisWithExactCache({
      prepared: preparedCase.prepared,
      cache,
      async analyzeUncached() {
        providerCalls += 1;
        return preparedCase.canonical;
      },
    });
    const identity = await resolveIdentity(
      database,
      preparedCase.prepared,
    );
    const counts = await readIdentityCounts(database, identity);
    verify(
      faultDatabase.triggerCount === 1 &&
        providerCalls === 1 &&
        result.cacheWriteState === "persisted",
      "an acquisition committed before an ambiguous result is recovered by proposed run UUID",
    );
    verify(
      counts.processingCount === 0 &&
        counts.readyCount === 1 &&
        counts.activeSnapshotCount === 1,
      "recovered acquisition ownership persists one ready snapshot",
    );
  }

  verificationStage = "lease-expiry-recovery-under-contention";
  {
    const preparedCase = await prepareCase("expired-lease");
    const identity = await resolveIdentity(
      database,
      preparedCase.prepared,
    );
    const startedAt = new Date(
      Date.now() - ANALYSIS_RUN_LEASE_DURATION_MS - 5_000,
    );
    const expiredRun = await createProcessingAnalysisRun(database, {
      id: randomUUID(),
      ...identity,
      attemptNumber: 1,
      startedAt,
      leaseExpiresAt: new Date(
        startedAt.getTime() + ANALYSIS_RUN_LEASE_DURATION_MS,
      ),
    });
    await assert.rejects(
      persistReadyAnalysisSnapshot(database, {
        analysisRunId: expiredRun.id,
        ...identity,
        canonicalResult: preparedCase.canonical,
        persistedAt: new Date(),
      }),
      (error: unknown) =>
        isRepositoryError(error, "PROCESSING_RUN_NOT_OWNED"),
    );
    assertionCount += 1;

    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => database,
    });
    let providerCalls = 0;
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        resolveMenuAnalysisWithExactCache({
          prepared: preparedCase.prepared,
          cache,
          async analyzeUncached() {
            providerCalls += 1;
            await new Promise((resolve) => setTimeout(resolve, 450));
            return preparedCase.canonical;
          },
        }),
      ),
    );
    const history = await readRunHistory(database, identity);
    verify(
      providerCalls === 1 &&
        results.filter(
          (result) => result.cacheReadState === "miss",
        ).length === 1 &&
        results.filter(
          (result) => result.cacheReadState === "hit",
        ).length === 3,
      "expired ownership recovery elects one new owner under contention",
    );
    verify(
      history.length === 2 &&
        history[0]?.attemptNumber === 1 &&
        history[0]?.status === "failed" &&
        history[0]?.safeErrorCode === "LEASE_EXPIRED" &&
        history[1]?.attemptNumber === 2 &&
        history[1]?.status === "ready",
      "expired recovery preserves append-only attempt history",
    );
  }

  verificationStage = "owner-failure-before-persistence";
  {
    const preparedCase = await prepareCase("provider-failure");
    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => database,
    });
    const providerFailure = new Error("synthetic provider failure");
    const error = await captureError(() =>
      resolveMenuAnalysisWithExactCache({
        prepared: preparedCase.prepared,
        cache,
        async analyzeUncached() {
          throw providerFailure;
        },
      }),
    );
    const identity = await resolveIdentity(
      database,
      preparedCase.prepared,
    );
    const history = await readRunHistory(database, identity);
    const counts = await readIdentityCounts(database, identity);
    verify(
      error === providerFailure,
      "an owner provider failure remains the authoritative error",
    );
    verify(
      history.length === 1 &&
        history[0]?.status === "failed" &&
        history[0]?.safeErrorCode === "ANALYSIS_PROVIDER_FAILED" &&
        counts.snapshotCount === 0,
      "provider failure records a guarded failed run without a snapshot",
    );
  }

  verificationStage = "strict-owner-only-persistence";
  {
    const preparedCase = await prepareCase("strict-owner");
    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => database,
    });
    const owner = await cache.claim(preparedCase.prepared);
    assert.equal(owner.state, "owner");
    if (owner.state !== "owner") {
      throw new Error("The strict-owner case did not acquire ownership.");
    }
    await assert.rejects(
      persistReadyAnalysisSnapshot(database, {
        analysisRunId: randomUUID(),
        menuEvidenceSetId: owner.ownership.menuEvidenceSetId,
        analysisContractId: owner.ownership.analysisContractId,
        canonicalResult: preparedCase.canonical,
      }),
      (error: unknown) =>
        isRepositoryError(error, "PROCESSING_RUN_NOT_OWNED"),
    );
    const counts = await readIdentityCounts(database, owner.ownership);
    verify(
      counts.processingCount === 1 &&
        counts.readyCount === 0 &&
        counts.snapshotCount === 0,
      "a non-owner cannot create a snapshot or transition the real owner",
    );
    await failOwner(cache, owner.ownership);
    assertionCount += 2;
  }

  verificationStage = "persistence-transaction-rollback";
  {
    const preparedCase = await prepareCase("persistence-rollback");
    const faultDatabase = new TransactionOutcomeFaultDatabase(
      database,
      "foodseyo-insert-ready-analysis-snapshot",
      "rollback_before_commit",
    );
    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => faultDatabase,
    });
    const result = await resolveMenuAnalysisWithExactCache({
      prepared: preparedCase.prepared,
      cache,
      async analyzeUncached() {
        return preparedCase.canonical;
      },
    });
    const identity = await resolveIdentity(
      database,
      preparedCase.prepared,
    );
    const history = await readRunHistory(database, identity);
    const counts = await readIdentityCounts(database, identity);
    verify(
      faultDatabase.triggerCount === 1 &&
        result.cacheWriteState === "failed",
      "a forced pre-commit persistence failure is surfaced as uncached",
    );
    verify(
      counts.readyCount === 0 &&
        counts.failedCount === 1 &&
        counts.snapshotCount === 0 &&
        history[0]?.safeErrorCode ===
          "SNAPSHOT_PERSISTENCE_FAILED",
      "snapshot insertion and ready transition roll back atomically",
    );
  }

  verificationStage = "ambiguous-persistence-commit";
  {
    const preparedCase = await prepareCase(
      "ambiguous-persistence-commit",
    );
    const faultDatabase = new TransactionOutcomeFaultDatabase(
      database,
      "foodseyo-insert-ready-analysis-snapshot",
      "throw_after_commit",
    );
    const faultCache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => faultDatabase,
    });
    const first = await resolveMenuAnalysisWithExactCache({
      prepared: preparedCase.prepared,
      cache: faultCache,
      async analyzeUncached() {
        return preparedCase.canonical;
      },
    });
    const baseCache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => database,
    });
    let duplicateProviderCalls = 0;
    const second = await resolveMenuAnalysisWithExactCache({
      prepared: preparedCase.prepared,
      cache: baseCache,
      async analyzeUncached() {
        duplicateProviderCalls += 1;
        return preparedCase.canonical;
      },
    });
    const identity = await resolveIdentity(
      database,
      preparedCase.prepared,
    );
    const counts = await readIdentityCounts(database, identity);
    verify(
      faultDatabase.triggerCount === 1 &&
        first.cacheWriteState === "failed",
      "an ambiguous commit result does not claim confirmed persistence",
    );
    verify(
      second.cacheReadState === "hit" &&
        duplicateProviderCalls === 0 &&
        counts.readyCount === 1 &&
        counts.activeSnapshotCount === 1 &&
        counts.snapshotCount === 1,
      "a committed ambiguous snapshot remains singular and safely reusable",
    );
  }

  verificationStage = "snapshot-integrity-and-quarantine";
  {
    const invalidFingerprint =
      `foodseyo-snapshot-result-v1:${"0".repeat(64)}`;
    const cases: readonly {
      readonly label: string;
      readonly build: (
        preparedCase: PreparedCase,
      ) => Promise<{
        readonly canonicalResult: unknown;
        readonly resultFingerprint: string;
        readonly createdAt?: Date;
        readonly expiresAt?: Date | null;
      }>;
      readonly expectedCode: SafeSnapshotInvalidationCode;
    }[] = [
      {
        label: "corrupt-canonical",
        async build() {
          return {
            canonicalResult: { invalid: true },
            resultFingerprint: invalidFingerprint,
          };
        },
        expectedCode: "INVALID_CANONICAL_ANALYSIS",
      },
      {
        label: "invalid-database-row",
        async build(preparedCase) {
          return {
            canonicalResult: preparedCase.canonical,
            resultFingerprint: "invalid",
          };
        },
        expectedCode: "INVALID_DATABASE_ROW",
      },
      {
        label: "fingerprint-corruption",
        async build(preparedCase) {
          return {
            canonicalResult: preparedCase.canonical,
            resultFingerprint: invalidFingerprint,
          };
        },
        expectedCode: "SNAPSHOT_INTEGRITY_FAILURE",
      },
      {
        label: "canonical-identity-mismatch",
        async build() {
          const other = await prepareCase("mismatched-source");
          return {
            canonicalResult: other.canonical,
            resultFingerprint:
              await createSnapshotResultFingerprint(other.canonical),
          };
        },
        expectedCode: "CANONICAL_IDENTITY_MISMATCH",
      },
      {
        label: "expired-snapshot",
        async build(preparedCase) {
          const createdAt = new Date(Date.now() - 600_000);
          return {
            canonicalResult: preparedCase.canonical,
            resultFingerprint:
              await createSnapshotResultFingerprint(
                preparedCase.canonical,
              ),
            createdAt,
            expiresAt: new Date(createdAt.getTime() + 300_000),
          };
        },
        expectedCode: "SNAPSHOT_EXPIRED",
      },
    ];

    for (const snapshotCase of cases) {
      const preparedCase = await prepareCase(snapshotCase.label);
      const identity = await resolveIdentity(
        database,
        preparedCase.prepared,
      );
      const seeded = await snapshotCase.build(preparedCase);
      const snapshotId = await seedReadySnapshot({
        database,
        identity,
        ...seeded,
      });
      const cache = createDatabaseMenuAnalysisExactCache({
        getDatabase: () => database,
      });
      const claim = await cache.claim(preparedCase.prepared);
      verify(
        claim.state === "owner",
        `${snapshotCase.label} is never returned as a cache hit`,
      );
      if (claim.state !== "owner") {
        throw new Error(
          `${snapshotCase.label} did not continue from confirmed quarantine.`,
        );
      }
      const invalidation = await readSnapshotInvalidation(
        database,
        snapshotId,
      );
      verify(
        invalidation.invalidated &&
          invalidation.safeInvalidationCode ===
            snapshotCase.expectedCode,
        `${snapshotCase.label} is quarantined with the exact safe code`,
      );
      await failOwner(cache, claim.ownership);
      assertionCount += 1;
    }
  }

  verificationStage = "unconfirmed-and-failed-quarantine";
  for (const mode of [
    "unconfirmed",
    "failed",
  ] as const satisfies readonly QuarantineFaultMode[]) {
    const preparedCase = await prepareCase(`${mode}-quarantine`);
    const identity = await resolveIdentity(
      database,
      preparedCase.prepared,
    );
    const snapshotId = await seedReadySnapshot({
      database,
      identity,
      canonicalResult: { invalid: true },
      resultFingerprint:
        `foodseyo-snapshot-result-v1:${"0".repeat(64)}`,
    });
    const faultDatabase = new QuarantineFaultDatabase(database, mode);
    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => faultDatabase,
    });
    let providerCalls = 0;
    const result = await resolveMenuAnalysisWithExactCache({
      prepared: preparedCase.prepared,
      cache,
      async analyzeUncached() {
        providerCalls += 1;
        return preparedCase.canonical;
      },
    });
    const invalidation = await readSnapshotInvalidation(
      database,
      snapshotId,
    );
    const counts = await readIdentityCounts(database, identity);
    verify(
      result.cacheReadState === "bypass" &&
        result.cacheWriteState === "not_attempted" &&
        result.analysis.analysisId ===
          preparedCase.canonical.analysisId &&
        providerCalls === 1,
      `${mode} quarantine uses only the uncached no-persistence path`,
    );
    verify(
      !invalidation.invalidated &&
        invalidation.safeInvalidationCode === null &&
        counts.readyCount === 1 &&
        counts.processingCount === 0 &&
        counts.snapshotCount === 1 &&
        counts.activeSnapshotCount === 1,
      `${mode} quarantine never returns or replaces the corrupt snapshot`,
    );
  }

  verificationStage = "complete";
  verify(
    networkGuard.callCount === 0,
    "the entire C2.1-F verifier makes zero HTTP or OpenAI calls",
  );
  console.log(
    JSON.stringify({
      target: "ephemeral Development child branch",
      currentUser: "foodseyo_runtime",
      connection: "pooled TLS",
      concurrencyRounds,
      callersPerRound,
      assertions: assertionCount,
      oneOwnerAndProvider: "verified",
      duplicateSnapshotReuse: "verified",
      activeOwner409: "verified",
      indeterminateOwnership503: "verified",
      expiredLeaseRecovery: "verified",
      ambiguousAcquisitionAndCommit: "verified",
      ownerOnlyPersistence: "verified",
      transactionRollback: "verified",
      snapshotIntegrityAndQuarantine: "verified",
      openAiCallCount: 0,
      cleanup: "delete exact ephemeral branch after this command",
    }),
  );
} catch (error) {
  const code =
    error instanceof Error && "code" in error
      ? String((error as Error & { code?: unknown }).code ?? "unknown")
      : "unknown";
  console.error(
    `C2.1-F PostgreSQL validation failed (stage=${verificationStage}, code=${code}).`,
  );
  process.exitCode = 1;
} finally {
  networkGuard.restore();
  await pool.end();
}
