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
  createProcessingAnalysisRun,
  getOrCreateAnalysisContract,
  getOrCreateUploadedMenuEvidenceSet,
  persistReadyAnalysisSnapshot,
} from "../src/lib/database/repositories/index.ts";
import { createAnalysisCachePoolConfig } from "../src/lib/database/runtime-config.ts";
import { createDatabaseMenuAnalysisExactCache } from "../src/services/menu-analysis/database-menu-analysis-exact-cache.ts";
import {
  MenuAnalysisCachePublicError,
  resolveMenuAnalysisWithExactCache,
} from "../src/services/menu-analysis/menu-analysis-exact-cache.ts";
import { prepareMenuImagesAnalysis } from "../src/services/menu-analysis/menu-analysis-preparation.ts";
import {
  ANALYSIS_RUN_LEASE_DURATION_MS,
  createAnalysisCacheContractIdentity,
} from "../src/services/menu-analysis/menu-cache-contract.ts";
import { createCurrentAnalysisFixture } from "./fixtures/current-analysis-fixture.mts";

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

const verifyRuntimeConnection = async (
  client: PoolClient,
): Promise<void> => {
  const connection = await client.query<{ currentUser: string }>({
    name: "foodseyo-c2-1-e-runtime-connection",
    text: 'SELECT current_user AS "currentUser"',
  });
  const connectionStream = (
    client as unknown as {
      readonly connection?: {
        readonly stream?: { readonly encrypted?: boolean };
      };
    }
  ).connection?.stream;
  assert.equal(connection.rows[0]?.currentUser, "foodseyo_runtime");
  assert.equal(connectionStream?.encrypted, true);
};

if (process.env.FOODSEYO_EPHEMERAL_DEVELOPMENT_VALIDATION !== "1") {
  throw new Error(
    "C2.1-E real concurrency validation requires an explicitly isolated ephemeral Development branch.",
  );
}

const pool = new Pool(createAnalysisCachePoolConfig(process.env));
const database = new PoolDatabase(pool);
let verificationStage = "connect";
let providerCallCount = 0;

try {
  const client = await pool.connect();
  try {
    await verifyRuntimeConnection(client);
  } finally {
    client.release();
  }

  verificationStage = "isolated-empty-branch";
  const initialCounts = await database.query<{
    contractCount: number;
    evidenceCount: number;
    runCount: number;
    snapshotCount: number;
  }>({
    name: "foodseyo-c2-1-e-initial-empty-counts",
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
  assert.deepEqual(initialCounts.rows[0], {
    contractCount: 0,
    evidenceCount: 0,
    runCount: 0,
    snapshotCount: 0,
  });

  verificationStage = "prepare-unique-evidence";
  const uniqueBytes = new TextEncoder().encode(
    `foodseyo-c2-1-e-${randomUUID()}`,
  );
  const prepared = await prepareMenuImagesAnalysis(
    {
      type: "menu_images",
      images: [
        {
          id: "ephemeral-development-concurrency",
          fileName: null,
          mediaType: "image/jpeg",
          byteLength: uniqueBytes.byteLength,
          async read() {
            return uniqueBytes.slice();
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
  const cache = createDatabaseMenuAnalysisExactCache({
    getDatabase: () => database,
  });

  verificationStage = "concurrent-identical-requests";
  const analyze = async () => {
    providerCallCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return canonical;
  };
  const [first, second] = await Promise.all([
    resolveMenuAnalysisWithExactCache({
      prepared,
      cache,
      analyzeUncached: analyze,
    }),
    resolveMenuAnalysisWithExactCache({
      prepared,
      cache,
      analyzeUncached: analyze,
    }),
  ]);
  assert.equal(providerCallCount, 1);
  assert.equal(
    [first.cacheReadState, second.cacheReadState].filter(
      (state) => state === "miss",
    ).length,
    1,
  );
  assert.equal(
    [first.cacheReadState, second.cacheReadState].filter(
      (state) => state === "hit",
    ).length,
    1,
  );
  assert.equal(first.analysis.analysisId, canonical.analysisId);
  assert.equal(second.analysis.analysisId, canonical.analysisId);

  const persistedState = await database.query<{
    processingCount: number;
    readyCount: number;
    activeSnapshotCount: number;
  }>({
    name: "foodseyo-c2-1-e-concurrent-result-counts",
    text: `
      SELECT
        (
          SELECT count(*)::integer
          FROM public.analysis_runs
          WHERE status = 'processing'
        ) AS "processingCount",
        (
          SELECT count(*)::integer
          FROM public.analysis_runs
          WHERE status = 'ready'
        ) AS "readyCount",
        (
          SELECT count(*)::integer
          FROM public.analysis_snapshots
          WHERE invalidated_at IS NULL
        ) AS "activeSnapshotCount"
    `,
  });
  assert.deepEqual(persistedState.rows[0], {
    processingCount: 0,
    readyCount: 1,
    activeSnapshotCount: 1,
  });

  verificationStage = "strict-non-owner-persistence";
  const contract = await getOrCreateAnalysisContract(
    database,
    createAnalysisCacheContractIdentity(prepared.versions),
  );
  const evidence = await getOrCreateUploadedMenuEvidenceSet(database, {
    sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
    fingerprintVersion:
      prepared.cacheIdentity.sourceFingerprintVersion,
    imageCount: prepared.imageCount,
    observedAt: new Date(),
  });
  await assert.rejects(
    persistReadyAnalysisSnapshot(database, {
      analysisRunId: randomUUID(),
      menuEvidenceSetId: evidence.id,
      analysisContractId: contract.id,
      canonicalResult: canonical,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "PROCESSING_RUN_NOT_OWNED",
  );

  verificationStage = "active-owner-busy-policy";
  const busyBytes = new TextEncoder().encode(
    `foodseyo-c2-1-e-busy-${randomUUID()}`,
  );
  const busyPrepared = await prepareMenuImagesAnalysis(
    {
      type: "menu_images",
      images: [
        {
          id: "ephemeral-development-busy",
          fileName: null,
          mediaType: "image/jpeg",
          byteLength: busyBytes.byteLength,
          async read() {
            return busyBytes.slice();
          },
        },
      ],
      userEnteredRestaurantName: null,
      location: null,
    },
    { environment: process.env },
  );
  const busyOwner = await cache.claim(busyPrepared);
  assert.equal(busyOwner.state, "owner");
  let busyProviderCalls = 0;
  await assert.rejects(
    resolveMenuAnalysisWithExactCache({
      prepared: busyPrepared,
      cache,
      async analyzeUncached() {
        busyProviderCalls += 1;
        return canonical;
      },
    }),
    (error: unknown) =>
      error instanceof MenuAnalysisCachePublicError &&
      error.result.code === "ANALYSIS_IN_PROGRESS" &&
      error.result.httpStatus === 409,
  );
  assert.equal(busyProviderCalls, 0);

  verificationStage = "expired-lease-recovery";
  const expiredBytes = new TextEncoder().encode(
    `foodseyo-c2-1-e-expired-${randomUUID()}`,
  );
  const expiredPrepared = await prepareMenuImagesAnalysis(
    {
      type: "menu_images",
      images: [
        {
          id: "ephemeral-development-expired",
          fileName: null,
          mediaType: "image/jpeg",
          byteLength: expiredBytes.byteLength,
          async read() {
            return expiredBytes.slice();
          },
        },
      ],
      userEnteredRestaurantName: null,
      location: null,
    },
    { environment: process.env },
  );
  const [expiredContract, expiredEvidence] = await Promise.all([
    getOrCreateAnalysisContract(
      database,
      expiredPrepared.cacheIdentity.analysisContract,
    ),
    getOrCreateUploadedMenuEvidenceSet(database, {
      sourceFingerprint:
        expiredPrepared.cacheIdentity.sourceFingerprint,
      fingerprintVersion:
        expiredPrepared.cacheIdentity.sourceFingerprintVersion,
      imageCount: expiredPrepared.imageCount,
      observedAt: new Date(),
    }),
  ]);
  const expiredStartedAt = new Date(
    Date.now() - ANALYSIS_RUN_LEASE_DURATION_MS - 1_000,
  );
  const expiredRun = await createProcessingAnalysisRun(database, {
    id: randomUUID(),
    menuEvidenceSetId: expiredEvidence.id,
    analysisContractId: expiredContract.id,
    attemptNumber: 1,
    startedAt: expiredStartedAt,
    leaseExpiresAt: new Date(
      expiredStartedAt.getTime() + ANALYSIS_RUN_LEASE_DURATION_MS,
    ),
  });
  const recovered = await cache.claim(expiredPrepared);
  assert.equal(recovered.state, "owner");
  if (recovered.state !== "owner") {
    throw new Error("Expired ownership was not recovered.");
  }
  assert.equal(recovered.recoveredExpiredLease, true);
  assert.notEqual(recovered.ownership.analysisRunId, expiredRun.id);
  const expiredAudit = await database.query<{
    status: string;
    safeErrorCode: string | null;
  }>({
    name: "foodseyo-c2-1-e-expired-run-audit",
    text: `
      SELECT
        status,
        safe_error_code AS "safeErrorCode"
      FROM public.analysis_runs
      WHERE id = $1
    `,
    values: [expiredRun.id],
  });
  assert.deepEqual(expiredAudit.rows[0], {
    status: "failed",
    safeErrorCode: "LEASE_EXPIRED",
  });

  verificationStage = "complete";
  console.log(
    JSON.stringify({
      target: "ephemeral Development child branch",
      currentUser: "foodseyo_runtime",
      connection: "pooled TLS",
      concurrentOwnerCount: 1,
      providerCallCount,
      duplicateSnapshotReuse: "verified",
      activeOwner409: "verified",
      strictOwnerPersistence: "verified",
      expiredLeaseRecovery: "verified",
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
    `Development ownership verification failed (stage=${verificationStage}, code=${code}).`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
