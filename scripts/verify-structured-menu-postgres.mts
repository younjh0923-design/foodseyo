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
  invalidateActiveAnalysisSnapshot,
  persistReadyAnalysisSnapshot,
} from "../src/lib/database/repositories/index.ts";
import { createAnalysisCachePoolConfig } from "../src/lib/database/runtime-config.ts";
import {
  STRUCTURED_MENU_PROJECTOR_VERSION,
  StructuredMenuProjectionError,
} from "../src/lib/database/structured-menu/contracts.ts";
import {
  findEligibleStructuredMenuProjection,
  materializeStructuredMenuSnapshot,
} from "../src/services/structured-menu/index.ts";
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
        // Preserve the authoritative validation failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

class InsertBarrierDatabase implements AnalysisCacheTransactionManager {
  private readonly database: AnalysisCacheTransactionManager;
  private arrivals = 0;
  private releaseBarrier: () => void = () => undefined;
  private readonly barrier = new Promise<void>((resolve) => {
    this.releaseBarrier = resolve;
  });

  constructor(database: AnalysisCacheTransactionManager) {
    this.database = database;
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    return this.database.query<Row>(config);
  }

  withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    return this.database.withTransaction((executor) =>
      work({
        query: async <Row extends QueryResultRow = QueryResultRow>(
          config: QueryConfig,
        ): Promise<QueryResult<Row>> => {
          if (
            config.name ===
            "foodseyo-insert-structured-menu-snapshot"
          ) {
            this.arrivals += 1;
            if (this.arrivals === 2) this.releaseBarrier();
            await this.barrier;
          }
          return executor.query<Row>(config);
        },
      }),
    );
  }
}

class RollbackAfterCompletenessDatabase
  implements AnalysisCacheTransactionManager
{
  private readonly database: AnalysisCacheTransactionManager;
  triggered = false;

  constructor(database: AnalysisCacheTransactionManager) {
    this.database = database;
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    return this.database.query<Row>(config);
  }

  withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    return this.database.withTransaction(async (executor) => {
      const result = await work({
        query: async <Row extends QueryResultRow = QueryResultRow>(
          config: QueryConfig,
        ): Promise<QueryResult<Row>> => {
          const queryResult = await executor.query<Row>(config);
          if (
            config.name ===
            "foodseyo-verify-structured-menu-projection-counts"
          ) {
            this.triggered = true;
          }
          return queryResult;
        },
      });
      if (this.triggered) {
        throw new Error("synthetic pre-commit projection failure");
      }
      return result;
    });
  }
}

type PreparedAnalysis = Awaited<
  ReturnType<typeof prepareMenuImagesAnalysis>
>;
type CanonicalAnalysis = Awaited<
  ReturnType<typeof createCurrentAnalysisFixture>
>;

interface PersistedSource {
  readonly prepared: PreparedAnalysis;
  readonly canonical: CanonicalAnalysis;
  readonly analysisSnapshotId: string;
  readonly menuEvidenceSetId: string;
  readonly analysisContractId: string;
  readonly expiresAt: Date | null;
}

const verifyRuntimeConnection = async (
  client: PoolClient,
): Promise<void> => {
  const connection = await client.query<{ currentUser: string }>({
    name: "foodseyo-c2-3-runtime-connection",
    text: 'SELECT current_user AS "currentUser"',
  });
  const stream = (
    client as unknown as {
      readonly connection?: {
        readonly stream?: { readonly encrypted?: boolean };
      };
    }
  ).connection?.stream;
  assert.equal(connection.rows[0]?.currentUser, "foodseyo_runtime");
  assert.equal(stream?.encrypted, true);
};

const prepareSource = async (
  database: AnalysisCacheTransactionManager,
  label: string,
  options: {
    readonly expiresAfterMs?: number;
    readonly includePriceOptions?: boolean;
  } = {},
): Promise<PersistedSource> => {
  const bytes = new TextEncoder().encode(
    `foodseyo-c2-3-${label}-${randomUUID()}`,
  );
  const prepared = await prepareMenuImagesAnalysis(
    {
      type: "menu_images",
      images: [
        {
          id: "ephemeral-development-structured-menu",
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
  const menu = canonical.payload.menu;
  if (!menu || !menu.dishes[0]) {
    throw new Error("The C2.3 fixture requires a menu and dish.");
  }
  if (options.includePriceOptions) {
    const firstDish = menu.dishes[0];
    const directEvidence = {
      ...firstDish.priceEvidence,
      availability: "available" as const,
      basis: "direct_observation" as const,
    };
    firstDish.priceOptions = [
      {
        id: "source-backed-small",
        label: "Small",
        price: {
          amount: 12.5,
          currency: "CAD",
          displayText: "CAD 12.50",
        },
        priceEvidence: directEvidence,
      },
      {
        id: "unknown-market-price",
        label: "Market",
        price: null,
        priceEvidence: {
          ...directEvidence,
          availability: "unknown",
        },
      },
      {
        id: "source-backed-large",
        label: "Large",
        price: {
          amount: 18,
          currency: null,
          displayText: "18",
        },
        priceEvidence: {
          ...directEvidence,
          basis: "external_source",
        },
      },
    ];
    firstDish.options = [
      {
        id: "excluded-add-on",
        label: "Extra",
        additionalPrice: {
          amount: 4,
          currency: "CAD",
          displayText: "+CAD 4",
        },
        priceEvidence: directEvidence,
      },
    ];
  }

  const [contract, evidence] = await Promise.all([
    getOrCreateAnalysisContract(
      database,
      createAnalysisCacheContractIdentity(prepared.versions),
    ),
    getOrCreateUploadedMenuEvidenceSet(database, {
      sourceFingerprint:
        prepared.cacheIdentity.sourceFingerprint,
      fingerprintVersion:
        prepared.cacheIdentity.sourceFingerprintVersion,
      imageCount: prepared.imageCount,
      observedAt: new Date(),
    }),
  ]);
  const startedAt = new Date();
  const run = await createProcessingAnalysisRun(database, {
    id: randomUUID(),
    menuEvidenceSetId: evidence.id,
    analysisContractId: contract.id,
    attemptNumber: 1,
    startedAt,
    leaseExpiresAt: new Date(
      startedAt.getTime() + ANALYSIS_RUN_LEASE_DURATION_MS,
    ),
  });
  const persistedAt = new Date();
  const expiresAt =
    options.expiresAfterMs === undefined
      ? null
      : new Date(persistedAt.getTime() + options.expiresAfterMs);
  const persisted = await persistReadyAnalysisSnapshot(database, {
    analysisRunId: run.id,
    menuEvidenceSetId: evidence.id,
    analysisContractId: contract.id,
    canonicalResult: canonical,
    persistedAt,
    expiresAt,
  });
  return {
    prepared,
    canonical,
    analysisSnapshotId: persisted.snapshot.id,
    menuEvidenceSetId: evidence.id,
    analysisContractId: contract.id,
    expiresAt,
  };
};

const readProjectionCounts = async (
  database: AnalysisCacheQueryExecutor,
  analysisSnapshotId: string,
): Promise<{
  readonly menuSnapshotCount: number;
  readonly sectionCount: number;
  readonly itemCount: number;
  readonly priceCount: number;
}> => {
  const result = await database.query<{
    readonly menuSnapshotCount: number;
    readonly sectionCount: number;
    readonly itemCount: number;
    readonly priceCount: number;
  }>({
    name: "foodseyo-c2-3-source-projection-counts",
    text: `
      SELECT
        (
          SELECT count(*)::integer
          FROM public.menu_snapshots
          WHERE analysis_snapshot_id = $1
        ) AS "menuSnapshotCount",
        (
          SELECT count(*)::integer
          FROM public.menu_sections AS section
          JOIN public.menu_snapshots AS snapshot
            ON snapshot.id = section.menu_snapshot_id
          WHERE snapshot.analysis_snapshot_id = $1
        ) AS "sectionCount",
        (
          SELECT count(*)::integer
          FROM public.menu_items AS item
          JOIN public.menu_snapshots AS snapshot
            ON snapshot.id = item.menu_snapshot_id
          WHERE snapshot.analysis_snapshot_id = $1
        ) AS "itemCount",
        (
          SELECT count(*)::integer
          FROM public.menu_item_prices AS price
          JOIN public.menu_items AS item
            ON item.id = price.menu_item_id
          JOIN public.menu_snapshots AS snapshot
            ON snapshot.id = item.menu_snapshot_id
          WHERE snapshot.analysis_snapshot_id = $1
        ) AS "priceCount"
    `,
    values: [analysisSnapshotId],
  });
  const counts = result.rows[0];
  if (!counts) throw new Error("Projection counts were not returned.");
  return counts;
};

if (process.env.FOODSEYO_C2_3_EPHEMERAL_VALIDATION !== "1") {
  throw new Error(
    "C2.3 PostgreSQL validation requires an isolated Development child branch.",
  );
}

const pool = new Pool(createAnalysisCachePoolConfig(process.env));
const database = new PoolDatabase(pool);
let verificationStage = "connect";
let assertionCount = 0;

const verify = (condition: boolean): void => {
  assert.equal(condition, true);
  assertionCount += 1;
};

try {
  const client = await pool.connect();
  try {
    await verifyRuntimeConnection(client);
  } finally {
    client.release();
  }

  verificationStage = "empty-migrated-branch";
  const initial = await database.query<{
    readonly applicationRowCount: number;
    readonly structuredTableCount: number;
    readonly runtimeCanUpdate: boolean;
    readonly runtimeCanDelete: boolean;
  }>({
    name: "foodseyo-c2-3-initial-state",
    text: `
      SELECT
        (
          (SELECT count(*) FROM public.analysis_contracts) +
          (SELECT count(*) FROM public.menu_evidence_sets) +
          (SELECT count(*) FROM public.analysis_runs) +
          (SELECT count(*) FROM public.analysis_snapshots) +
          (SELECT count(*) FROM public.menu_snapshots) +
          (SELECT count(*) FROM public.menu_sections) +
          (SELECT count(*) FROM public.menu_items) +
          (SELECT count(*) FROM public.menu_item_prices)
        )::integer AS "applicationRowCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_tables
          WHERE schemaname = 'public'
            AND tablename IN (
              'menu_snapshots',
              'menu_sections',
              'menu_items',
              'menu_item_prices'
            )
        ) AS "structuredTableCount",
        has_table_privilege(
          current_user,
          'public.menu_snapshots',
          'UPDATE'
        ) AS "runtimeCanUpdate",
        has_table_privilege(
          current_user,
          'public.menu_snapshots',
          'DELETE'
        ) AS "runtimeCanDelete"
    `,
  });
  verify(
    initial.rows[0]?.applicationRowCount === 0 &&
      initial.rows[0]?.structuredTableCount === 4 &&
      initial.rows[0]?.runtimeCanUpdate === false &&
      initial.rows[0]?.runtimeCanDelete === false,
  );

  verificationStage = "normal-projection-and-read";
  const normalSource = await prepareSource(
    database,
    "normal",
    { includePriceOptions: true },
  );
  const normal = await materializeStructuredMenuSnapshot(database, {
    analysisSnapshotId: normalSource.analysisSnapshotId,
  });
  verify(normal.state === "created");
  const normalRead = await findEligibleStructuredMenuProjection(
    database,
    { analysisSnapshotId: normalSource.analysisSnapshotId },
  );
  assert(normalRead);
  const normalMenu = normalSource.canonical.payload.menu;
  assert(normalMenu);
  const expectedPriceCount = normalMenu.dishes.length + 2;
  verify(
    normalRead.projection.sections.length ===
      normalMenu.categories.length &&
      normalRead.projection.items.length ===
        normalMenu.dishes.length &&
      normalRead.projection.items.reduce(
        (count, item) => count + item.prices.length,
        0,
      ) === expectedPriceCount &&
      normalRead.projection.sections.every(
        (section, position) => section.position === position,
      ) &&
      normalRead.projection.items.every(
        (item, position) => item.position === position,
      ),
  );

  verificationStage = "duplicate-idempotency";
  const duplicate = await materializeStructuredMenuSnapshot(database, {
    analysisSnapshotId: normalSource.analysisSnapshotId,
  });
  const duplicateCounts = await readProjectionCounts(
    database,
    normalSource.analysisSnapshotId,
  );
  verify(
    duplicate.state === "reused" &&
      duplicateCounts.menuSnapshotCount === 1 &&
      duplicateCounts.sectionCount === normalMenu.categories.length &&
      duplicateCounts.itemCount === normalMenu.dishes.length &&
      duplicateCounts.priceCount === expectedPriceCount,
  );

  verificationStage = "concurrent-idempotency";
  const concurrentSource = await prepareSource(
    database,
    "concurrent",
  );
  const barrierDatabase = new InsertBarrierDatabase(database);
  verificationStage = "concurrent-materialize";
  const concurrentResults = await Promise.all([
    materializeStructuredMenuSnapshot(barrierDatabase, {
      analysisSnapshotId: concurrentSource.analysisSnapshotId,
    }),
    materializeStructuredMenuSnapshot(barrierDatabase, {
      analysisSnapshotId: concurrentSource.analysisSnapshotId,
    }),
  ]);
  verificationStage = "concurrent-counts";
  const concurrentCounts = await readProjectionCounts(
    database,
    concurrentSource.analysisSnapshotId,
  );
  verificationStage = "concurrent-assert";
  verify(
    concurrentResults.filter((result) => result.state === "created")
      .length === 1 &&
      concurrentResults.filter((result) => result.state === "reused")
        .length === 1 &&
      concurrentCounts.menuSnapshotCount === 1 &&
      concurrentCounts.itemCount ===
        concurrentSource.canonical.payload.menu?.dishes.length,
  );

  verificationStage = "forced-rollback";
  const rollbackSource = await prepareSource(database, "rollback");
  const rollbackDatabase =
    new RollbackAfterCompletenessDatabase(database);
  await assert.rejects(
    materializeStructuredMenuSnapshot(rollbackDatabase, {
      analysisSnapshotId: rollbackSource.analysisSnapshotId,
    }),
  );
  verificationStage = "forced-rollback-counts";
  const rollbackCounts = await readProjectionCounts(
    database,
    rollbackSource.analysisSnapshotId,
  );
  verificationStage = "forced-rollback-assert";
  if (
    !rollbackDatabase.triggered ||
    !Object.values(rollbackCounts).every((count) => count === 0)
  ) {
    console.error(
      JSON.stringify({
        safeDiagnostic: "forced-rollback-state",
        triggerObserved: rollbackDatabase.triggered,
        ...rollbackCounts,
      }),
    );
  }
  verify(
    rollbackDatabase.triggered &&
      Object.values(rollbackCounts).every((count) => count === 0),
  );

  verificationStage = "cross-snapshot-section-rejection";
  const normalMenuSnapshotId = normal.value.menuSnapshot.id;
  const concurrentMenuSnapshotId =
    concurrentResults[0]!.value.menuSnapshot.id;
  const section = await database.query<{ readonly id: string }>({
    name: "foodseyo-c2-3-read-cross-snapshot-section",
    text: `
      SELECT id
      FROM public.menu_sections
      WHERE menu_snapshot_id = $1
      ORDER BY position
      LIMIT 1
    `,
    values: [normalMenuSnapshotId],
  });
  assert(section.rows[0]?.id);
  await assert.rejects(
    database.withTransaction((executor) =>
      executor.query({
        name: "foodseyo-c2-3-reject-cross-snapshot-section",
        text: `
          INSERT INTO public.menu_items (
            id,
            menu_snapshot_id,
            menu_section_id,
            analysis_dish_id,
            position,
            display_name
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        values: [
          randomUUID(),
          concurrentMenuSnapshotId,
          section.rows[0]!.id,
          `constraint-probe-${randomUUID()}`,
          999,
          "Constraint probe",
        ],
      }),
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as Error & { readonly code?: unknown }).code === "23503" &&
      "constraint" in error &&
      (error as Error & { readonly constraint?: unknown }).constraint ===
        "menu_items_section_snapshot_fk",
  );
  assertionCount += 1;

  verificationStage = "price-constraints";
  const firstItem = await database.query<{ readonly id: string }>({
    name: "foodseyo-c2-3-read-price-constraint-item",
    text: `
      SELECT id
      FROM public.menu_items
      WHERE menu_snapshot_id = $1
      ORDER BY position
      LIMIT 1
    `,
    values: [normalMenuSnapshotId],
  });
  const itemId = firstItem.rows[0]?.id;
  assert(itemId);
  const priceCases = [
    {
      label: "negative",
      analysisPriceId: "negative",
      position: 100,
      priceKind: "option",
      contextLabel: "Negative",
      amount: "-1",
    },
    {
      label: "nan",
      analysisPriceId: "nan",
      position: 101,
      priceKind: "option",
      contextLabel: "NaN",
      amount: "NaN",
    },
    {
      label: "infinity",
      analysisPriceId: "infinity",
      position: 102,
      priceKind: "option",
      contextLabel: "Infinity",
      amount: "Infinity",
    },
    {
      label: "duplicate-base",
      analysisPriceId: null,
      position: 103,
      priceKind: "base",
      contextLabel: null,
      amount: "1",
    },
    {
      label: "option-missing-id",
      analysisPriceId: null,
      position: 104,
      priceKind: "option",
      contextLabel: "Missing ID",
      amount: "1",
    },
    {
      label: "option-missing-label",
      analysisPriceId: "missing-label",
      position: 105,
      priceKind: "option",
      contextLabel: null,
      amount: "1",
    },
  ] as const;
  for (const priceCase of priceCases) {
    await assert.rejects(
      database.withTransaction((executor) =>
        executor.query({
          name: `foodseyo-c2-3-reject-price-${priceCase.label}`,
          text: `
            INSERT INTO public.menu_item_prices (
              id,
              menu_item_id,
              analysis_price_id,
              position,
              price_kind,
              context_label,
              amount,
              currency,
              display_text
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)
          `,
          values: [
            randomUUID(),
            itemId,
            priceCase.analysisPriceId,
            priceCase.position,
            priceCase.priceKind,
            priceCase.contextLabel,
            priceCase.amount,
            "Constraint probe",
          ],
        }),
      ),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        ["23505", "23514"].includes(
          String(
            (error as Error & { readonly code?: unknown }).code,
          ),
        ),
    );
    assertionCount += 1;
  }

  verificationStage = "invalid-source-zero-rows";
  const invalidSource = await prepareSource(database, "invalid");
  const invalidated = await invalidateActiveAnalysisSnapshot(database, {
    snapshotId: invalidSource.analysisSnapshotId,
    menuEvidenceSetId: invalidSource.menuEvidenceSetId,
    analysisContractId: invalidSource.analysisContractId,
    safeInvalidationCode: "SNAPSHOT_INTEGRITY_FAILURE",
  });
  assert.equal(invalidated, true);
  await assert.rejects(
    materializeStructuredMenuSnapshot(database, {
      analysisSnapshotId: invalidSource.analysisSnapshotId,
    }),
    (error: unknown) =>
      error instanceof StructuredMenuProjectionError &&
      error.code === "SOURCE_SNAPSHOT_INELIGIBLE",
  );
  const invalidCounts = await readProjectionCounts(
    database,
    invalidSource.analysisSnapshotId,
  );
  verify(Object.values(invalidCounts).every((count) => count === 0));

  verificationStage = "expired-source-read-ineligibility";
  const expiringSource = await prepareSource(
    database,
    "expiring",
    { expiresAfterMs: 10_000 },
  );
  const expiringProjection =
    await materializeStructuredMenuSnapshot(database, {
      analysisSnapshotId: expiringSource.analysisSnapshotId,
    });
  assert.equal(expiringProjection.state, "created");
  assert(expiringSource.expiresAt);
  const waitMs = Math.max(
    0,
    expiringSource.expiresAt.getTime() - Date.now() + 100,
  );
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  await assert.rejects(
    findEligibleStructuredMenuProjection(database, {
      analysisSnapshotId: expiringSource.analysisSnapshotId,
    }),
    (error: unknown) =>
      error instanceof StructuredMenuProjectionError &&
      error.code === "SOURCE_SNAPSHOT_INELIGIBLE",
  );
  const expiringCounts = await readProjectionCounts(
    database,
    expiringSource.analysisSnapshotId,
  );
  verify(
    expiringCounts.menuSnapshotCount === 1 &&
      expiringCounts.itemCount > 0,
  );

  verificationStage = "complete";
  console.log(
    JSON.stringify({
      target: "ephemeral Development child branch",
      currentUser: "foodseyo_runtime",
      connection: "pooled TLS",
      projectorVersion: STRUCTURED_MENU_PROJECTOR_VERSION,
      assertions: assertionCount,
      normalProjectionAndRead: "verified",
      duplicateIdempotency: "verified",
      concurrentWinnerReuse: "verified",
      forcedRollback: "verified",
      compositeForeignKey: "verified",
      priceConstraints: "verified",
      invalidAndExpiredSources: "verified",
      openAiCallCount: 0,
      cleanup: "delete exact ephemeral branch after this command",
    }),
  );
} catch (error) {
  let rootCause: unknown = error;
  while (
    rootCause instanceof Error &&
    "cause" in rootCause &&
    rootCause.cause instanceof Error
  ) {
    rootCause = rootCause.cause;
  }
  const code =
    rootCause instanceof Error && "code" in rootCause
      ? String(
          (rootCause as Error & { readonly code?: unknown }).code,
        )
      : "unknown";
  const errorName =
    rootCause instanceof Error ? rootCause.name : "NonError";
  const message =
    rootCause instanceof Error ? rootCause.message : "";
  const safeCategory =
    /connection|socket|timeout|terminated|closed/iu.test(message)
      ? "connection"
      : /duplicate key|unique/iu.test(message)
        ? "uniqueness"
        : /transaction/iu.test(message)
          ? "transaction"
          : /projection/iu.test(message)
            ? "projection"
            : /assert/iu.test(message)
              ? "assertion"
              : "unclassified";
  console.error(
    `C2.3 PostgreSQL validation failed (stage=${verificationStage}, code=${code}, name=${errorName}, category=${safeCategory}).`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
