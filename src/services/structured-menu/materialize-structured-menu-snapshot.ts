import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { AnalysisCacheTransactionManager } from "../../lib/database/database-port.ts";
import {
  findStoredStructuredMenuProjection,
  insertStructuredMenuProjection,
  isStructuredMenuProjectionUniqueConflict,
  loadEligibleStructuredMenuProjectionSource,
  verifyStructuredMenuProjectionCounts,
  type PreparedStructuredMenuProjectionRows,
} from "../../lib/database/repositories/structured-menu.ts";
import {
  MenuSnapshotRecordSchema,
  ProjectorVersionSchema,
  STRUCTURED_MENU_PROJECTOR_VERSION,
  StructuredMenuProjectionError,
  parseStructuredMenuValue,
  type EligibleStructuredMenuProjection,
  type StructuredMenuProjectionDto,
} from "../../lib/database/structured-menu/contracts.ts";
import { buildStructuredMenuProjection } from "./build-structured-menu-projection.ts";

export interface StructuredMenuMaterializationDependencies {
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export type StructuredMenuMaterializationResult =
  | {
      readonly state: "created";
      readonly value: EligibleStructuredMenuProjection;
    }
  | {
      readonly state: "reused";
      readonly value: EligibleStructuredMenuProjection;
    };

const MaterializationInputSchema = z.strictObject({
  analysisSnapshotId: z.string().uuid(),
  projectorVersion: ProjectorVersionSchema,
});

const projectionsMatch = (
  expected: StructuredMenuProjectionDto,
  actual: StructuredMenuProjectionDto,
): boolean => {
  return JSON.stringify(actual) === JSON.stringify(expected);
};

const assertProjectionMatches = (
  expected: StructuredMenuProjectionDto,
  actual: StructuredMenuProjectionDto,
): void => {
  if (!projectionsMatch(expected, actual)) {
    throw new StructuredMenuProjectionError(
      "PROJECTION_INTEGRITY_FAILURE",
    );
  }
};

const prepareRows = (
  projection: StructuredMenuProjectionDto,
  projectedAt: Date,
  createId: () => string,
): PreparedStructuredMenuProjectionRows => {
  const menuSnapshot = parseStructuredMenuValue(
    MenuSnapshotRecordSchema,
    {
      id: createId(),
      analysisSnapshotId: projection.analysisSnapshotId,
      projectorVersion: projection.projectorVersion,
      title: projection.title,
      currency: projection.currency,
      projectedAt,
    },
    "INVALID_PROJECTION_INPUT",
  );
  const sectionIdByCategoryId = new Map<string, string>();
  const sections = projection.sections.map((section) => {
    const id = parseStructuredMenuValue(
      z.string().uuid(),
      createId(),
      "INVALID_PROJECTION_INPUT",
    );
    sectionIdByCategoryId.set(section.analysisCategoryId, id);
    return { id, ...section };
  });
  const itemIdByDishId = new Map<string, string>();
  const items = projection.items.map((item) => {
    const id = parseStructuredMenuValue(
      z.string().uuid(),
      createId(),
      "INVALID_PROJECTION_INPUT",
    );
    itemIdByDishId.set(item.analysisDishId, id);
    const sectionId =
      item.sectionAnalysisCategoryId === null
        ? null
        : (sectionIdByCategoryId.get(
            item.sectionAnalysisCategoryId,
          ) ?? null);
    if (
      item.sectionAnalysisCategoryId !== null &&
      sectionId === null
    ) {
      throw new StructuredMenuProjectionError(
        "PROJECTION_INTEGRITY_FAILURE",
      );
    }
    return {
      id,
      sectionId,
      analysisDishId: item.analysisDishId,
      position: item.position,
      displayName: item.displayName,
      originalName: item.originalName,
      menuDescription: item.menuDescription,
    };
  });
  const prices = projection.items.flatMap((item) => {
    const itemId = itemIdByDishId.get(item.analysisDishId);
    if (!itemId) {
      throw new StructuredMenuProjectionError(
        "PROJECTION_INTEGRITY_FAILURE",
      );
    }
    return item.prices.map((price) => ({
      id: parseStructuredMenuValue(
        z.string().uuid(),
        createId(),
        "INVALID_PROJECTION_INPUT",
      ),
      itemId,
      ...price,
    }));
  });
  return { menuSnapshot, sections, items, prices };
};

const buildExpectedProjection = async (
  database: AnalysisCacheTransactionManager,
  input: z.infer<typeof MaterializationInputSchema>,
  observedAt: Date,
  lockForProjection: boolean,
): Promise<{
  readonly resultFingerprint: string;
  readonly projection: StructuredMenuProjectionDto;
}> => {
  const source = await loadEligibleStructuredMenuProjectionSource(
    database,
    {
      analysisSnapshotId: input.analysisSnapshotId,
      observedAt,
      lockForProjection,
    },
  );
  return {
    resultFingerprint: source.resultFingerprint,
    projection: buildStructuredMenuProjection({
      analysisSnapshotId: source.analysisSnapshotId,
      projectorVersion: input.projectorVersion,
      canonicalResult: source.canonicalResult,
    }),
  };
};

export async function findEligibleStructuredMenuProjection(
  database: AnalysisCacheTransactionManager,
  candidate: {
    readonly analysisSnapshotId: string;
    readonly projectorVersion?: string;
  },
  dependencies: Pick<StructuredMenuMaterializationDependencies, "now"> = {},
): Promise<EligibleStructuredMenuProjection | null> {
  const input = parseStructuredMenuValue(
    MaterializationInputSchema,
    {
      ...candidate,
      projectorVersion:
        candidate.projectorVersion ??
        STRUCTURED_MENU_PROJECTOR_VERSION,
    },
    "INVALID_PROJECTION_INPUT",
  );
  const expected = await buildExpectedProjection(
    database,
    input,
    dependencies.now?.() ?? new Date(),
    false,
  );
  const stored = await findStoredStructuredMenuProjection(
    database,
    input,
  );
  if (!stored) return null;
  assertProjectionMatches(expected.projection, stored.projection);
  return stored;
}

export async function materializeStructuredMenuSnapshot(
  database: AnalysisCacheTransactionManager,
  candidate: {
    readonly analysisSnapshotId: string;
    readonly projectorVersion?: string;
  },
  dependencies: StructuredMenuMaterializationDependencies = {},
): Promise<StructuredMenuMaterializationResult> {
  const input = parseStructuredMenuValue(
    MaterializationInputSchema,
    {
      ...candidate,
      projectorVersion:
        candidate.projectorVersion ??
        STRUCTURED_MENU_PROJECTOR_VERSION,
    },
    "INVALID_PROJECTION_INPUT",
  );
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? randomUUID;
  const initial = await buildExpectedProjection(
    database,
    input,
    now(),
    false,
  );
  const existing = await findStoredStructuredMenuProjection(
    database,
    input,
  );
  if (existing) {
    assertProjectionMatches(initial.projection, existing.projection);
    return { state: "reused", value: existing };
  }

  try {
    return await database.withTransaction(async (executor) => {
      const lockedSource =
        await loadEligibleStructuredMenuProjectionSource(executor, {
          analysisSnapshotId: input.analysisSnapshotId,
          observedAt: now(),
          lockForProjection: true,
        });
      if (lockedSource.resultFingerprint !== initial.resultFingerprint) {
        throw new StructuredMenuProjectionError(
          "SOURCE_SNAPSHOT_INELIGIBLE",
        );
      }

      const committed = await findStoredStructuredMenuProjection(
        executor,
        input,
      );
      if (committed) {
        assertProjectionMatches(initial.projection, committed.projection);
        return { state: "reused", value: committed };
      }

      const rows = prepareRows(
        initial.projection,
        now(),
        createId,
      );
      await insertStructuredMenuProjection(executor, rows);
      await verifyStructuredMenuProjectionCounts(executor, {
        menuSnapshotId: rows.menuSnapshot.id,
        expectedSectionCount: rows.sections.length,
        expectedItemCount: rows.items.length,
        expectedPriceCount: rows.prices.length,
      });
      const inserted = await findStoredStructuredMenuProjection(
        executor,
        input,
      );
      if (!inserted) {
        throw new StructuredMenuProjectionError(
          "PROJECTION_PERSISTENCE_CONFLICT",
        );
      }
      assertProjectionMatches(initial.projection, inserted.projection);
      return { state: "created", value: inserted };
    });
  } catch (error) {
    if (!isStructuredMenuProjectionUniqueConflict(error)) throw error;
    const winner = await findEligibleStructuredMenuProjection(
      database,
      input,
      { now },
    );
    if (!winner) {
      throw new StructuredMenuProjectionError(
        "PROJECTION_PERSISTENCE_CONFLICT",
      );
    }
    assertProjectionMatches(initial.projection, winner.projection);
    return { state: "reused", value: winner };
  }
}
