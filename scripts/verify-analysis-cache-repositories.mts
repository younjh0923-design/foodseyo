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
  findActiveAnalysisSnapshot,
  findAnalysisRunById,
  getOrCreateAnalysisContract,
  getOrCreateUploadedMenuEvidenceSet,
  persistReadyAnalysisSnapshot,
} from "../src/lib/database/repositories/index.ts";
import { createAnalysisCachePoolConfig } from "../src/lib/database/runtime-config.ts";
import {
  ANALYSIS_RUN_LEASE_DURATION_MS,
  SOURCE_FINGERPRINT_VERSION,
  createAnalysisCacheContractIdentity,
} from "../src/services/menu-analysis/menu-cache-contract.ts";
import { createMenuAnalysisVersionMetadata } from "../src/services/menu-analysis/menu-analysis-versions.ts";
import { DEFAULT_MENU_ANALYSIS_MODEL } from "../src/services/menu-analysis/openai-menu-request.ts";
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
        name: `foodseyo-verify-empty-${tableName}`,
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
let observedInitialRowCount = -1;

try {
  client = await pool.connect();
  verificationStage = "connection-contract";
  const connection = await client.query<{ currentUser: string }>({
    name: "foodseyo-verify-runtime-connection",
    text: `
      SELECT current_user AS "currentUser"
    `,
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
  const beforeCounts = await readTableCounts(
    new RollbackVerificationDatabase(client),
  );
  observedInitialRowCount = Object.values(beforeCounts).reduce(
    (total, count) => total + count,
    0,
  );
  assertAllTablesEmpty(beforeCounts);

  verificationStage = "repository-transaction";
  await client.query("BEGIN");
  try {
    const database = new RollbackVerificationDatabase(client);
    const versions = createMenuAnalysisVersionMetadata(
      DEFAULT_MENU_ANALYSIS_MODEL,
    );
    const contract = await getOrCreateAnalysisContract(
      database,
      createAnalysisCacheContractIdentity(versions),
    );
    const sourceFingerprint = `source_${"a".repeat(64)}`;
    const startedAt = new Date();
    const evidence = await getOrCreateUploadedMenuEvidenceSet(database, {
      sourceFingerprint,
      fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
      imageCount: 1,
      observedAt: startedAt,
    });
    const analysisRunId = randomUUID();
    const run = await createProcessingAnalysisRun(database, {
      id: analysisRunId,
      menuEvidenceSetId: evidence.id,
      analysisContractId: contract.id,
      attemptNumber: 1,
      startedAt,
      leaseExpiresAt: new Date(
        startedAt.getTime() + ANALYSIS_RUN_LEASE_DURATION_MS,
      ),
    });
    const canonicalResult = await createCurrentAnalysisFixture({
      sourceFingerprint,
      versions,
    });
    const persistedAt = new Date(startedAt.getTime() + 1_000);
    const persisted = await persistReadyAnalysisSnapshot(database, {
      analysisRunId: run.id,
      menuEvidenceSetId: evidence.id,
      analysisContractId: contract.id,
      canonicalResult,
      persistedAt,
    });
    const activeSnapshot = await findActiveAnalysisSnapshot(database, {
      menuEvidenceSetId: evidence.id,
      analysisContractId: contract.id,
    });
    const readyRun = await findAnalysisRunById(database, run.id);

    assert.equal(persisted.analysisRun.status, "ready");
    assert.equal(readyRun?.status, "ready");
    assert.equal(
      activeSnapshot?.resultFingerprint,
      persisted.snapshot.resultFingerprint,
    );
    assert.equal(
      activeSnapshot?.canonicalResultJson.analysisId,
      canonicalResult.analysisId,
    );
    assert.deepEqual(await readTableCounts(database), {
      analysis_contracts: 1,
      menu_evidence_sets: 1,
      analysis_runs: 1,
      analysis_snapshots: 1,
    });
  } finally {
    await client.query("ROLLBACK");
    rollbackCompleted = true;
  }

  verificationStage = "post-rollback-empty-state";
  const afterCounts = await readTableCounts(
    new RollbackVerificationDatabase(client),
  );
  assertAllTablesEmpty(afterCounts);
  verificationStage = "complete";

  console.log(
    JSON.stringify({
      target: "Development",
      currentUser: "foodseyo_runtime",
      connection: "pooled TLS",
      repositoryTablesVerified: applicationTables.length,
      canonicalBoundary: "validated",
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
    `Development repository verification failed (code=${errorCode}, stage=${verificationStage}, role=${observedRole}, tls=${String(observedTls)}, initialRowCount=${String(observedInitialRowCount)}, rollback=${String(rollbackCompleted)}).`,
  );
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
