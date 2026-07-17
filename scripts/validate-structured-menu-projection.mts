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
  STRUCTURED_MENU_PROJECTOR_VERSION,
  StructuredMenuProjectionError,
} from "../src/lib/database/structured-menu/contracts.ts";
import {
  buildStructuredMenuProjection,
  findEligibleStructuredMenuProjection,
  materializeStructuredMenuSnapshot,
} from "../src/services/structured-menu/index.ts";
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
  "Foodseyo structured menu projection validation",
  "Structured menu projection validation failed",
);
const networkGuard = installNetworkGuard(
  "Structured menu projection validation must not use the network.",
);

const queryResult = <Row extends QueryResultRow>(
  rows: readonly Row[],
  rowCount = rows.length,
): QueryResult<Row> => ({
  command: "SELECT",
  rowCount,
  oid: 0,
  fields: [],
  rows: [...rows],
});

interface ScriptedQuery {
  readonly name: string;
  readonly rows?: readonly QueryResultRow[];
  readonly rowCount?: number;
  readonly error?: Error;
  readonly inspect?: (config: QueryConfig) => void;
}

class ScriptedDatabase implements AnalysisCacheTransactionManager {
  private readonly script: ScriptedQuery[];
  readonly observedNames: string[] = [];
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
        `Unexpected structured-menu query: ${config.name ?? "unnamed"}.`,
      );
    }
    step.inspect?.(config);
    this.observedNames.push(step.name);
    if (step.error) throw step.error;
    const rows = (step.rows ?? []) as readonly Row[];
    return queryResult(rows, step.rowCount ?? rows.length);
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

const snapshotId = "40000000-0000-4000-8000-000000000004";
const menuSnapshotId = "50000000-0000-4000-8000-000000000005";
const evidenceId = "20000000-0000-4000-8000-000000000002";
const contractId = "10000000-0000-4000-8000-000000000001";
const runId = "30000000-0000-4000-8000-000000000003";
const sourceFingerprint = `source_${"1".repeat(64)}`;
const observedAt = new Date("2026-07-17T17:00:00.000Z");
const versions = createMenuAnalysisVersionMetadata("gpt-5.6");
const canonical = await createCurrentAnalysisFixture({
  sourceFingerprint,
  versions,
});
const menu = canonical.payload.menu;
if (!menu || !menu.dishes[0]) {
  throw new Error("The structured-menu fixture requires at least one dish.");
}
const firstDish = menu.dishes[0];
const directEvidence = {
  ...firstDish.priceEvidence,
  availability: "available" as const,
  basis: "direct_observation" as const,
};
firstDish.priceOptions = [
  {
    id: "eligible-small",
    label: "Small",
    price: {
      amount: 12.5,
      currency: "CAD",
      displayText: "CAD 12.50",
    },
    priceEvidence: directEvidence,
  },
  {
    id: "excluded-inferred",
    label: "Estimated",
    price: null,
    priceEvidence: {
      ...directEvidence,
      availability: "unknown",
      basis: "ai_inference",
      sourceIds: [],
    },
  },
  {
    id: "excluded-null",
    label: "Market",
    price: null,
    priceEvidence: {
      ...directEvidence,
      availability: "unknown",
    },
  },
  {
    id: "eligible-large",
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
    id: "excluded-additional-price",
    label: "Extra",
    additionalPrice: {
      amount: 4,
      currency: "CAD",
      displayText: "+CAD 4",
    },
    priceEvidence: directEvidence,
  },
];

const resultFingerprint =
  await createSnapshotResultFingerprint(canonical);
const sourceRow = {
  id: snapshotId,
  menuEvidenceSetId: evidenceId,
  analysisContractId: contractId,
  analysisRunId: runId,
  resultFingerprint,
  canonicalResultJson: canonical,
  createdAt: observedAt,
  lastAccessedAt: observedAt,
  expiresAt: null,
  invalidatedAt: null,
  safeInvalidationCode: null,
  sourceFingerprint,
  fingerprintVersion: SOURCE_FINGERPRINT_VERSION,
  modelVersion: versions.modelVersion,
  promptVersion: versions.promptVersion,
  providerSchemaVersion: versions.providerSchemaVersion,
  canonicalSchemaVersion: versions.canonicalSchemaVersion,
  consistencyProfileVersion: versions.consistencyProfileVersion,
  analysisRunStatus: "ready",
};
const expected = buildStructuredMenuProjection({
  analysisSnapshotId: snapshotId,
  projectorVersion: STRUCTURED_MENU_PROJECTOR_VERSION,
  canonicalResult: canonical,
});

const expectedFirstPrices = expected.items[0]?.prices ?? [];
verify(
  expectedFirstPrices.map((price) => price.priceKind).join(",") ===
    "base,option,option" &&
    expectedFirstPrices
      .map((price) => price.position)
      .join(",") === "0,1,2" &&
    expectedFirstPrices
      .map((price) => price.analysisPriceId ?? "base")
      .join(",") === "base,eligible-small,eligible-large",
  "builder keeps only evidence-backed base and canonical option prices in contiguous order",
);
verify(
  JSON.stringify(expected).includes("excluded-inferred") === false &&
    JSON.stringify(expected).includes("excluded-null") === false &&
    JSON.stringify(expected).includes("excluded-additional-price") ===
      false &&
    JSON.stringify(expected).includes("+CAD 4") === false,
  "builder excludes inferred, null, market-like, and additional-price data",
);
verify(
  expected.sections.every((section, position) => {
    return section.position === position;
  }) &&
    expected.items.every((item, position) => {
      return item.position === position;
    }),
  "builder preserves exact canonical section and item order",
);

const menuSnapshotRecord = {
  id: menuSnapshotId,
  analysisSnapshotId: snapshotId,
  projectorVersion: STRUCTURED_MENU_PROJECTOR_VERSION,
  title: expected.title,
  currency: expected.currency,
  projectedAt: observedAt,
};
const sectionIds = expected.sections.map(
  (_section, index) =>
    `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const itemIds = expected.items.map(
  (_item, index) =>
    `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const sectionRows = expected.sections.map((section, index) => ({
  id: sectionIds[index],
  analysisCategoryId: section.analysisCategoryId,
  position: section.position,
  label: section.label,
}));
const itemRows = expected.items.map((item, index) => ({
  id: itemIds[index],
  analysisDishId: item.analysisDishId,
  sectionAnalysisCategoryId: item.sectionAnalysisCategoryId,
  position: item.position,
  displayName: item.displayName,
  originalName: item.originalName,
  menuDescription: item.menuDescription,
}));
let priceIndex = 0;
const priceRows = expected.items.flatMap((item, itemIndex) => {
  return item.prices.map((price) => {
    priceIndex += 1;
    return {
      id: `90000000-0000-4000-8000-${String(priceIndex).padStart(12, "0")}`,
      analysisDishId: itemRows[itemIndex]!.analysisDishId,
      ...price,
    };
  });
});
const countsRow = {
  menuSnapshotCount: 1,
  sectionCount: sectionRows.length,
  itemCount: itemRows.length,
  priceCount: priceRows.length,
};

const storedReadSteps = (): ScriptedQuery[] => [
  {
    name: "foodseyo-select-structured-menu-snapshot",
    rows: [menuSnapshotRecord],
  },
  {
    name: "foodseyo-select-structured-menu-sections",
    rows: sectionRows,
  },
  {
    name: "foodseyo-select-structured-menu-items",
    rows: itemRows,
  },
  {
    name: "foodseyo-select-structured-menu-prices",
    rows: priceRows,
  },
];

const generatedIds = [
  menuSnapshotId,
  ...sectionIds,
  ...itemIds,
  ...priceRows.map((price) => price.id),
];
let generatedIdIndex = 0;
const deterministicId = (): string => {
  const id = generatedIds[generatedIdIndex];
  generatedIdIndex += 1;
  if (!id) throw new Error("The deterministic ID fixture was exhausted.");
  return id;
};

const createDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-select-structured-menu-projection-source",
    rows: [sourceRow],
  },
  { name: "foodseyo-select-structured-menu-snapshot", rows: [] },
  {
    name: "foodseyo-lock-structured-menu-projection-source",
    rows: [sourceRow],
    inspect(config) {
      verify(
        config.text?.includes("FOR SHARE OF snapshot, run_record") ===
          true,
        "transaction revalidation locks the source and producing run",
      );
    },
  },
  { name: "foodseyo-select-structured-menu-snapshot", rows: [] },
  {
    name: "foodseyo-insert-structured-menu-snapshot",
    rowCount: 1,
  },
  {
    name: "foodseyo-insert-structured-menu-sections",
    rowCount: sectionRows.length,
  },
  {
    name: "foodseyo-insert-structured-menu-items",
    rowCount: itemRows.length,
  },
  {
    name: "foodseyo-insert-structured-menu-prices",
    rowCount: priceRows.length,
    inspect(config) {
      const values = JSON.stringify(config.values);
      verify(
        values.includes("eligible-small") &&
          values.includes("eligible-large") &&
          !values.includes("excluded-inferred") &&
          !values.includes("excluded-null") &&
          !values.includes("+CAD 4"),
        "repository receives only the builder's accepted price rows",
      );
    },
  },
  {
    name: "foodseyo-verify-structured-menu-projection-counts",
    rows: [countsRow],
  },
  ...storedReadSteps(),
]);
const created = await materializeStructuredMenuSnapshot(
  createDatabase,
  { analysisSnapshotId: snapshotId },
  {
    now: () => observedAt,
    createId: deterministicId,
  },
);
verify(
  created.state === "created" &&
    created.value.projection.items.length === expected.items.length &&
    createDatabase.commits === 1 &&
    createDatabase.rollbacks === 0 &&
    createDatabase.complete,
  "one guarded transaction inserts and re-reads one complete projection",
);

const duplicateDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-select-structured-menu-projection-source",
    rows: [sourceRow],
  },
  ...storedReadSteps(),
]);
const duplicate = await materializeStructuredMenuSnapshot(
  duplicateDatabase,
  { analysisSnapshotId: snapshotId },
  { now: () => observedAt },
);
verify(
  duplicate.state === "reused" &&
    duplicateDatabase.commits === 0 &&
    duplicateDatabase.rollbacks === 0 &&
    duplicateDatabase.complete,
  "an existing complete projection is reused without a write transaction",
);

const uniqueConflict = Object.assign(
  new Error("synthetic unique conflict"),
  {
    code: "23505",
    constraint: "menu_snapshots_source_projector_uk",
  },
);
const raceDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-select-structured-menu-projection-source",
    rows: [sourceRow],
  },
  { name: "foodseyo-select-structured-menu-snapshot", rows: [] },
  {
    name: "foodseyo-lock-structured-menu-projection-source",
    rows: [sourceRow],
  },
  { name: "foodseyo-select-structured-menu-snapshot", rows: [] },
  {
    name: "foodseyo-insert-structured-menu-snapshot",
    error: uniqueConflict,
  },
  {
    name: "foodseyo-select-structured-menu-projection-source",
    rows: [sourceRow],
  },
  ...storedReadSteps(),
]);
const raced = await materializeStructuredMenuSnapshot(
  raceDatabase,
  { analysisSnapshotId: snapshotId },
  { now: () => observedAt },
);
verify(
  raced.state === "reused" &&
    raceDatabase.commits === 0 &&
    raceDatabase.rollbacks === 1 &&
    raceDatabase.complete,
  "a uniqueness-race loser rolls back and revalidates the committed winner",
);

generatedIdIndex = 0;
const rollbackDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-select-structured-menu-projection-source",
    rows: [sourceRow],
  },
  { name: "foodseyo-select-structured-menu-snapshot", rows: [] },
  {
    name: "foodseyo-lock-structured-menu-projection-source",
    rows: [sourceRow],
  },
  { name: "foodseyo-select-structured-menu-snapshot", rows: [] },
  {
    name: "foodseyo-insert-structured-menu-snapshot",
    rowCount: 1,
  },
  {
    name: "foodseyo-insert-structured-menu-sections",
    rowCount: sectionRows.length,
  },
  {
    name: "foodseyo-insert-structured-menu-items",
    rowCount: itemRows.length,
  },
  {
    name: "foodseyo-insert-structured-menu-prices",
    rowCount: priceRows.length,
  },
  {
    name: "foodseyo-verify-structured-menu-projection-counts",
    rows: [{ ...countsRow, priceCount: countsRow.priceCount - 1 }],
  },
]);
const rollbackError = await captureError(() =>
  materializeStructuredMenuSnapshot(
    rollbackDatabase,
    { analysisSnapshotId: snapshotId },
    {
      now: () => observedAt,
      createId: deterministicId,
    },
  ),
);
verify(
  rollbackError instanceof StructuredMenuProjectionError &&
    rollbackError.code === "PROJECTION_INTEGRITY_FAILURE" &&
    rollbackDatabase.commits === 0 &&
    rollbackDatabase.rollbacks === 1 &&
    rollbackDatabase.complete,
  "an aggregate count mismatch rolls back the whole materialization",
);

const invalidSourceDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-select-structured-menu-projection-source",
    rows: [
      {
        ...sourceRow,
        invalidatedAt: new Date(observedAt.getTime() + 1),
        safeInvalidationCode: "SNAPSHOT_INTEGRITY_FAILURE",
      },
    ],
  },
]);
const invalidSourceError = await captureError(() =>
  materializeStructuredMenuSnapshot(
    invalidSourceDatabase,
    { analysisSnapshotId: snapshotId },
    { now: () => new Date(observedAt.getTime() + 2) },
  ),
);
verify(
  invalidSourceError instanceof StructuredMenuProjectionError &&
    invalidSourceError.code === "SOURCE_SNAPSHOT_INELIGIBLE" &&
    invalidSourceDatabase.commits === 0 &&
    invalidSourceDatabase.observedNames.length === 1,
  "an invalid source creates zero projection writes",
);

const expiredReadDatabase = new ScriptedDatabase([
  {
    name: "foodseyo-select-structured-menu-projection-source",
    rows: [
      {
        ...sourceRow,
        expiresAt: new Date(observedAt.getTime() + 1),
      },
    ],
  },
]);
const expiredReadError = await captureError(() =>
  findEligibleStructuredMenuProjection(
    expiredReadDatabase,
    { analysisSnapshotId: snapshotId },
    { now: () => new Date(observedAt.getTime() + 2) },
  ),
);
verify(
  expiredReadError instanceof StructuredMenuProjectionError &&
    expiredReadError.code === "SOURCE_SNAPSHOT_INELIGIBLE" &&
    expiredReadDatabase.observedNames.length === 1,
  "a projection is never returned after its source expires",
);

const implementationSources = await Promise.all(
  [
    "../src/lib/database/repositories/structured-menu.ts",
    "../src/services/structured-menu/build-structured-menu-projection.ts",
    "../src/services/structured-menu/materialize-structured-menu-snapshot.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);
const combinedSource = implementationSources.join("\n");
verify(
  combinedSource.includes("withTransaction") &&
    combinedSource.includes(
      "foodseyo-verify-structured-menu-projection-counts",
    ) &&
    combinedSource.includes(
      "menu_snapshots_source_projector_uk",
    ),
  "implementation owns transaction atomicity, completeness, and idempotency",
);
verify(
  !/\b(?:DELETE|UPDATE|CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE)\b/iu.test(
    combinedSource,
  ) &&
    !/openai|api\/analyze\/menu-images/iu.test(combinedSource),
  "structured-menu implementation has no mutation path, DDL, live route, or OpenAI integration",
);
verify(
  networkGuard.callCount === 0,
  "structured-menu projection validation makes zero network and OpenAI calls",
);
networkGuard.restore();

report();
