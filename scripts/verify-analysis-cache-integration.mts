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
} from "../src/lib/database/repositories/index.ts";
import { createAnalysisCachePoolConfig } from "../src/lib/database/runtime-config.ts";
import { createDatabaseMenuAnalysisExactCache } from "../src/services/menu-analysis/database-menu-analysis-exact-cache.ts";
import {
  ANALYSIS_RUN_LEASE_DURATION_MS,
  createAnalysisCacheContractIdentity,
} from "../src/services/menu-analysis/menu-cache-contract.ts";
import { prepareMenuImagesAnalysis } from "../src/services/menu-analysis/menu-analysis-preparation.ts";
import { createCurrentAnalysisFixture } from "./fixtures/current-analysis-fixture.mts";

const applicationTables = [
  "analysis_contracts",
  "menu_evidence_sets",
  "analysis_runs",
  "analysis_snapshots",
] as const;

class RollbackVerificationDatabase
  implements AnalysisCacheTransactionManager
{
  private readonly client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    return this.client.query<Row>(config);
  }

  withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    return work(this);
  }
}

async function readTableCounts(
  executor: AnalysisCacheQueryExecutor,
): Promise<Readonly<Record<(typeof applicationTables)[number], number>>> {
  const entries = await Promise.all(
    applicationTables.map(async (tableName) => {
      const result = await executor.query<{ rowCount: number }>({
        name: `foodseyo-c2-1-d-count-${tableName}`,
        text: `SELECT count(*)::integer AS "rowCount" FROM public.${tableName}`,
      });
      return [tableName, result.rows[0]?.rowCount ?? -1] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<
    (typeof applicationTables)[number],
    number
  >;
}

function assertAllTablesEmpty(
  counts: Readonly<Record<(typeof applicationTables)[number], number>>,
): void {
  assert(
    Object.values(counts).every((count) => count === 0),
    "Development analysis-cache tables must be empty.",
  );
}

const pool = new Pool(createAnalysisCachePoolConfig(process.env));
let client: PoolClient | null = null;
let rollbackCompleted = false;
let verificationStage = "connect";
let observedRole = "unverified";
let observedTls = false;

try {
  client = await pool.connect();
  const database = new RollbackVerificationDatabase(client);
  verificationStage = "connection-contract";
  const connection = await client.query<{ currentUser: string }>({
    name: "foodseyo-c2-1-d-runtime-connection",
    text: 'SELECT current_user AS "currentUser"',
  });
  const connectionStream = (
    client as unknown as {
      readonly connection?: {
        readonly stream?: { readonly encrypted?: boolean };
      };
    }
  ).connection?.stream;
  observedRole = connection.rows[0]?.currentUser ?? "missing";
  observedTls = connectionStream?.encrypted === true;
  assert.equal(observedRole, "foodseyo_runtime");
  assert.equal(observedTls, true);

  verificationStage = "initial-empty-state";
  assertAllTablesEmpty(await readTableCounts(database));

  verificationStage = "rollback-only-exact-cache-flow";
  await client.query("BEGIN");
  try {
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1]);
    const prepared = await prepareMenuImagesAnalysis(
      {
        type: "menu_images",
        images: [
          {
            id: "development-verification",
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
      { environment: process.env },
    );
    const startedAt = new Date();
    const contract = await getOrCreateAnalysisContract(
      database,
      createAnalysisCacheContractIdentity(prepared.versions),
    );
    const evidence = await getOrCreateUploadedMenuEvidenceSet(database, {
      sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
      fingerprintVersion:
        prepared.cacheIdentity.sourceFingerprintVersion,
      imageCount: prepared.imageCount,
      observedAt: startedAt,
    });

    const corruptRunId = randomUUID();
    await createProcessingAnalysisRun(database, {
      id: corruptRunId,
      menuEvidenceSetId: evidence.id,
      analysisContractId: contract.id,
      attemptNumber: 1,
      startedAt,
      leaseExpiresAt: new Date(
        startedAt.getTime() + ANALYSIS_RUN_LEASE_DURATION_MS,
      ),
    });
    await database.query({
      name: "foodseyo-c2-1-d-create-corrupt-ready-run",
      text: `
        UPDATE public.analysis_runs
        SET status = 'ready',
            lease_expires_at = NULL,
            finished_at = $4,
            updated_at = $4
        WHERE id = $1
          AND menu_evidence_set_id = $2
          AND analysis_contract_id = $3
          AND status = 'processing'
      `,
      values: [
        corruptRunId,
        evidence.id,
        contract.id,
        startedAt,
      ],
    });
    const corruptSnapshotId = randomUUID();
    await database.query({
      name: "foodseyo-c2-1-d-insert-corrupt-snapshot",
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
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7,
          $7,
          NULL,
          NULL,
          NULL
        )
      `,
      values: [
        corruptSnapshotId,
        evidence.id,
        contract.id,
        corruptRunId,
        `foodseyo-snapshot-result-v1:${"0".repeat(64)}`,
        { invalid: true },
        startedAt,
      ],
    });

    const persistedAt = new Date(startedAt.getTime() + 1_000);
    const cache = createDatabaseMenuAnalysisExactCache({
      getDatabase: () => database,
      createRunId: () => randomUUID(),
      now: () => persistedAt,
    });
    const quarantinedMiss = await cache.lookup(prepared);
    assert.equal(quarantinedMiss.state, "miss");

    const canonical = await createCurrentAnalysisFixture({
      sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
      versions: prepared.versions,
    });
    if (quarantinedMiss.state !== "miss") {
      throw new Error("Quarantined snapshot did not become a safe miss.");
    }
    assert.equal(
      await cache.persist(quarantinedMiss.writeContext, canonical),
      "persisted",
    );
    const hit = await cache.lookup(prepared);
    assert.equal(hit.state, "hit");
    if (hit.state !== "hit") {
      throw new Error("Persisted snapshot was not returned as a hit.");
    }
    assert.equal(hit.analysis.analysisId, canonical.analysisId);

    const quarantineCount = await database.query<{
      invalidatedCount: number;
      activeCount: number;
    }>({
      name: "foodseyo-c2-1-d-safe-snapshot-counts",
      text: `
        SELECT
          count(*) FILTER (
            WHERE invalidated_at IS NOT NULL
              AND safe_invalidation_code IS NOT NULL
          )::integer AS "invalidatedCount",
          count(*) FILTER (
            WHERE invalidated_at IS NULL
          )::integer AS "activeCount"
        FROM public.analysis_snapshots
      `,
    });
    assert.deepEqual(quarantineCount.rows[0], {
      invalidatedCount: 1,
      activeCount: 1,
    });
    assert.deepEqual(await readTableCounts(database), {
      analysis_contracts: 1,
      menu_evidence_sets: 1,
      analysis_runs: 2,
      analysis_snapshots: 2,
    });
  } finally {
    await client.query("ROLLBACK");
    rollbackCompleted = true;
  }

  verificationStage = "post-rollback-empty-state";
  assertAllTablesEmpty(await readTableCounts(database));
  verificationStage = "complete";

  console.log(
    JSON.stringify({
      target: "Development",
      currentUser: "foodseyo_runtime",
      connection: "pooled TLS",
      exactCacheRead: "verified",
      corruptSnapshotQuarantine: "verified",
      readyPersistence: "verified",
      providerCallCount: 0,
      transaction: "rolled back",
      applicationRowCountAfterVerification: 0,
    }),
  );
} catch (error) {
  const errorCode =
    error instanceof Error && "code" in error
      ? String((error as Error & { code?: unknown }).code ?? "unknown")
      : "unknown";
  console.error(
    `Development exact-cache verification failed (code=${errorCode}, stage=${verificationStage}, role=${observedRole}, tls=${String(observedTls)}, rollback=${String(rollbackCompleted)}).`,
  );
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
