import { z } from "zod";

import type { ConsistentFoodseyoAnalysis } from "../../../domain/foodseyo-analysis.ts";
import { createSnapshotResultFingerprint } from "../../../services/menu-analysis/menu-cache-contract.ts";
import type { AnalysisCacheQueryExecutor } from "../database-port.ts";
import {
  MenuSnapshotRecordSchema,
  StructuredMenuProjectionDtoSchema,
  StructuredMenuProjectionError,
  parseStructuredMenuValue,
  type EligibleStructuredMenuProjection,
  type MenuSnapshotRecord,
  type StructuredMenuProjectionDto,
} from "../structured-menu/contracts.ts";
import {
  ActiveSnapshotContextRowSchema,
  AnalysisCacheRepositoryError,
  assertCanonicalIdentity,
  parseCanonicalAnalysis,
  parseRepositoryValue,
} from "./contracts.ts";

const UuidSchema = z.string().uuid();
const NonBlankTextSchema = z.string().min(1).refine((value) => {
  return value.trim().length > 0;
});
const NullableNonBlankTextSchema = NonBlankTextSchema.nullable();

const ProjectionSourceRowSchema = ActiveSnapshotContextRowSchema.extend({
  analysisRunStatus: z.enum(["processing", "ready", "failed"]),
});
type ProjectionSourceRow = z.infer<typeof ProjectionSourceRowSchema>;

const MenuSectionRowSchema = z.strictObject({
  id: UuidSchema,
  analysisCategoryId: NonBlankTextSchema,
  position: z.number().int().nonnegative(),
  label: NonBlankTextSchema,
});
type MenuSectionRow = z.infer<typeof MenuSectionRowSchema>;

const MenuItemRowSchema = z.strictObject({
  id: UuidSchema,
  analysisDishId: NonBlankTextSchema,
  sectionAnalysisCategoryId: NullableNonBlankTextSchema,
  position: z.number().int().nonnegative(),
  displayName: NonBlankTextSchema,
  originalName: NullableNonBlankTextSchema,
  menuDescription: NullableNonBlankTextSchema,
});
type MenuItemRow = z.infer<typeof MenuItemRowSchema>;

const MenuItemPriceRowSchema = z.strictObject({
  id: UuidSchema,
  analysisDishId: NonBlankTextSchema,
  analysisPriceId: NullableNonBlankTextSchema,
  position: z.number().int().nonnegative(),
  priceKind: z.enum(["base", "option"]),
  contextLabel: NullableNonBlankTextSchema,
  amount: z.string().regex(/^\d+(?:\.\d+)?$/u),
  currency: NullableNonBlankTextSchema,
  displayText: NonBlankTextSchema,
});
type MenuItemPriceRow = z.infer<typeof MenuItemPriceRowSchema>;

const ProjectionCountsSchema = z.strictObject({
  menuSnapshotCount: z.number().int().nonnegative(),
  sectionCount: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  priceCount: z.number().int().nonnegative(),
});

export interface EligibleStructuredMenuProjectionSource {
  readonly analysisSnapshotId: string;
  readonly resultFingerprint: string;
  readonly canonicalResult: ConsistentFoodseyoAnalysis;
}

export interface PreparedStructuredMenuProjectionRows {
  readonly menuSnapshot: MenuSnapshotRecord;
  readonly sections: readonly {
    readonly id: string;
    readonly analysisCategoryId: string;
    readonly position: number;
    readonly label: string;
  }[];
  readonly items: readonly {
    readonly id: string;
    readonly sectionId: string | null;
    readonly analysisDishId: string;
    readonly position: number;
    readonly displayName: string;
    readonly originalName: string | null;
    readonly menuDescription: string | null;
  }[];
  readonly prices: readonly {
    readonly id: string;
    readonly itemId: string;
    readonly analysisPriceId: string | null;
    readonly position: number;
    readonly priceKind: "base" | "option";
    readonly contextLabel: string | null;
    readonly amount: string;
    readonly currency: string | null;
    readonly displayText: string;
  }[];
}

const sourceSelectColumns = `
  snapshot.id,
  snapshot.menu_evidence_set_id AS "menuEvidenceSetId",
  snapshot.analysis_contract_id AS "analysisContractId",
  snapshot.analysis_run_id AS "analysisRunId",
  snapshot.result_fingerprint AS "resultFingerprint",
  snapshot.canonical_result_json AS "canonicalResultJson",
  snapshot.created_at AS "createdAt",
  snapshot.last_accessed_at AS "lastAccessedAt",
  snapshot.expires_at AS "expiresAt",
  snapshot.invalidated_at AS "invalidatedAt",
  snapshot.safe_invalidation_code AS "safeInvalidationCode",
  evidence.source_fingerprint AS "sourceFingerprint",
  evidence.fingerprint_version AS "fingerprintVersion",
  contract.model_version AS "modelVersion",
  contract.prompt_version AS "promptVersion",
  contract.provider_schema_version AS "providerSchemaVersion",
  contract.canonical_schema_version AS "canonicalSchemaVersion",
  contract.consistency_profile_version AS "consistencyProfileVersion",
  run_record.status AS "analysisRunStatus"
`;

const menuSnapshotSelectColumns = `
  id,
  analysis_snapshot_id AS "analysisSnapshotId",
  projector_version AS "projectorVersion",
  title,
  currency,
  projected_at AS "projectedAt"
`;

const remapSourceValidationError = (error: unknown): never => {
  if (error instanceof StructuredMenuProjectionError) throw error;
  if (error instanceof AnalysisCacheRepositoryError) {
    throw new StructuredMenuProjectionError(
      "SOURCE_SNAPSHOT_INELIGIBLE",
    );
  }
  throw error;
};

export async function loadEligibleStructuredMenuProjectionSource(
  executor: AnalysisCacheQueryExecutor,
  candidate: {
    readonly analysisSnapshotId: string;
    readonly observedAt?: Date;
    readonly lockForProjection?: boolean;
  },
): Promise<EligibleStructuredMenuProjectionSource> {
  const input = parseStructuredMenuValue(
    z.strictObject({
      analysisSnapshotId: UuidSchema,
      observedAt: z.date(),
      lockForProjection: z.boolean(),
    }),
    {
      ...candidate,
      observedAt: candidate.observedAt ?? new Date(),
      lockForProjection: candidate.lockForProjection ?? false,
    },
    "INVALID_PROJECTION_INPUT",
  );
  const lockClause = input.lockForProjection
    ? "FOR SHARE OF snapshot, run_record"
    : "";
  const result = await executor.query<ProjectionSourceRow>({
    name: input.lockForProjection
      ? "foodseyo-lock-structured-menu-projection-source"
      : "foodseyo-select-structured-menu-projection-source",
    text: `
      SELECT ${sourceSelectColumns}
      FROM public.analysis_snapshots AS snapshot
      JOIN public.menu_evidence_sets AS evidence
        ON evidence.id = snapshot.menu_evidence_set_id
      JOIN public.analysis_contracts AS contract
        ON contract.id = snapshot.analysis_contract_id
      JOIN public.analysis_runs AS run_record
        ON run_record.id = snapshot.analysis_run_id
        AND run_record.menu_evidence_set_id =
          snapshot.menu_evidence_set_id
        AND run_record.analysis_contract_id =
          snapshot.analysis_contract_id
      WHERE snapshot.id = $1
      ${lockClause}
    `,
    values: [input.analysisSnapshotId],
  });
  const raw = result.rows[0];
  if (!raw) {
    throw new StructuredMenuProjectionError(
      "SOURCE_SNAPSHOT_NOT_FOUND",
    );
  }

  try {
    const row = parseRepositoryValue(ProjectionSourceRowSchema, raw);
    if (
      row.id !== input.analysisSnapshotId ||
      row.analysisRunStatus !== "ready" ||
      row.invalidatedAt !== null ||
      (row.expiresAt !== null && row.expiresAt <= input.observedAt)
    ) {
      throw new StructuredMenuProjectionError(
        "SOURCE_SNAPSHOT_INELIGIBLE",
      );
    }
    const canonicalResult = parseCanonicalAnalysis(
      row.canonicalResultJson,
    );
    assertCanonicalIdentity(canonicalResult, row);
    if (
      canonicalResult.status === "failed" ||
      canonicalResult.payload.menu === null ||
      canonicalResult.payload.menu.dishes.length === 0 ||
      (await createSnapshotResultFingerprint(canonicalResult)) !==
        row.resultFingerprint
    ) {
      throw new StructuredMenuProjectionError(
        "SOURCE_SNAPSHOT_INELIGIBLE",
      );
    }
    return {
      analysisSnapshotId: row.id,
      resultFingerprint: row.resultFingerprint,
      canonicalResult,
    };
  } catch (error) {
    return remapSourceValidationError(error);
  }
}

const buildProjectionFromRows = (
  menuSnapshot: MenuSnapshotRecord,
  sections: readonly MenuSectionRow[],
  items: readonly MenuItemRow[],
  prices: readonly MenuItemPriceRow[],
): StructuredMenuProjectionDto => {
  const pricesByDishId = new Map<string, MenuItemPriceRow[]>();
  for (const price of prices) {
    const dishPrices = pricesByDishId.get(price.analysisDishId) ?? [];
    dishPrices.push(price);
    pricesByDishId.set(price.analysisDishId, dishPrices);
  }

  return parseStructuredMenuValue(
    StructuredMenuProjectionDtoSchema,
    {
      analysisSnapshotId: menuSnapshot.analysisSnapshotId,
      projectorVersion: menuSnapshot.projectorVersion,
      title: menuSnapshot.title,
      currency: menuSnapshot.currency,
      sections: sections.map((section) => ({
        analysisCategoryId: section.analysisCategoryId,
        position: section.position,
        label: section.label,
      })),
      items: items.map((item) => ({
        analysisDishId: item.analysisDishId,
        sectionAnalysisCategoryId: item.sectionAnalysisCategoryId,
        position: item.position,
        displayName: item.displayName,
        originalName: item.originalName,
        menuDescription: item.menuDescription,
        prices: (pricesByDishId.get(item.analysisDishId) ?? []).map(
          (price) => ({
            analysisPriceId: price.analysisPriceId,
            position: price.position,
            priceKind: price.priceKind,
            contextLabel: price.contextLabel,
            amount: price.amount,
            currency: price.currency,
            displayText: price.displayText,
          }),
        ),
      })),
    },
  );
};

export async function findStoredStructuredMenuProjection(
  executor: AnalysisCacheQueryExecutor,
  identity: {
    readonly analysisSnapshotId: string;
    readonly projectorVersion: string;
  },
): Promise<EligibleStructuredMenuProjection | null> {
  const input = parseStructuredMenuValue(
    z.strictObject({
      analysisSnapshotId: UuidSchema,
      projectorVersion:
        StructuredMenuProjectionDtoSchema.shape.projectorVersion,
    }),
    identity,
    "INVALID_PROJECTION_INPUT",
  );
  const snapshotResult = await executor.query<MenuSnapshotRecord>({
    name: "foodseyo-select-structured-menu-snapshot",
    text: `
      SELECT ${menuSnapshotSelectColumns}
      FROM public.menu_snapshots
      WHERE analysis_snapshot_id = $1
        AND projector_version = $2
      LIMIT 1
    `,
    values: [input.analysisSnapshotId, input.projectorVersion],
  });
  const rawSnapshot = snapshotResult.rows[0];
  if (!rawSnapshot) return null;
  const menuSnapshot = parseStructuredMenuValue(
    MenuSnapshotRecordSchema,
    rawSnapshot,
  );
  if (
    menuSnapshot.analysisSnapshotId !== input.analysisSnapshotId ||
    menuSnapshot.projectorVersion !== input.projectorVersion
  ) {
    throw new StructuredMenuProjectionError(
      "PROJECTION_INTEGRITY_FAILURE",
    );
  }

  const sectionResult = await executor.query<MenuSectionRow>({
    name: "foodseyo-select-structured-menu-sections",
    text: `
      SELECT
        id,
        analysis_category_id AS "analysisCategoryId",
        position,
        label
      FROM public.menu_sections
      WHERE menu_snapshot_id = $1
      ORDER BY position ASC
    `,
    values: [menuSnapshot.id],
  });
  const itemResult = await executor.query<MenuItemRow>({
    name: "foodseyo-select-structured-menu-items",
    text: `
      SELECT
        item.id,
        item.analysis_dish_id AS "analysisDishId",
        section.analysis_category_id AS "sectionAnalysisCategoryId",
        item.position,
        item.display_name AS "displayName",
        item.original_name AS "originalName",
        item.menu_description AS "menuDescription"
      FROM public.menu_items AS item
      LEFT JOIN public.menu_sections AS section
        ON section.id = item.menu_section_id
        AND section.menu_snapshot_id = item.menu_snapshot_id
      WHERE item.menu_snapshot_id = $1
      ORDER BY item.position ASC
    `,
    values: [menuSnapshot.id],
  });
  const priceResult = await executor.query<MenuItemPriceRow>({
    name: "foodseyo-select-structured-menu-prices",
    text: `
      SELECT
        price.id,
        item.analysis_dish_id AS "analysisDishId",
        price.analysis_price_id AS "analysisPriceId",
        price.position,
        price.price_kind AS "priceKind",
        price.context_label AS "contextLabel",
        price.amount::text AS amount,
        price.currency,
        price.display_text AS "displayText"
      FROM public.menu_item_prices AS price
      JOIN public.menu_items AS item
        ON item.id = price.menu_item_id
      WHERE item.menu_snapshot_id = $1
      ORDER BY item.position ASC, price.position ASC
    `,
    values: [menuSnapshot.id],
  });

  const sections = sectionResult.rows.map((row) =>
    parseStructuredMenuValue(MenuSectionRowSchema, row),
  );
  const items = itemResult.rows.map((row) =>
    parseStructuredMenuValue(MenuItemRowSchema, row),
  );
  const prices = priceResult.rows.map((row) =>
    parseStructuredMenuValue(MenuItemPriceRowSchema, row),
  );
  return {
    menuSnapshot,
    projection: buildProjectionFromRows(
      menuSnapshot,
      sections,
      items,
      prices,
    ),
  };
}

const placeholders = (
  rowCount: number,
  columnCount: number,
): string => {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const offset = rowIndex * columnCount;
    return `(${Array.from(
      { length: columnCount },
      (_unused, columnIndex) => `$${offset + columnIndex + 1}`,
    ).join(", ")})`;
  }).join(", ");
};

const assertInsertedCount = (
  actual: number | null,
  expected: number,
): void => {
  if (actual !== expected) {
    throw new StructuredMenuProjectionError(
      "PROJECTION_PERSISTENCE_CONFLICT",
    );
  }
};

export async function insertStructuredMenuProjection(
  executor: AnalysisCacheQueryExecutor,
  rows: PreparedStructuredMenuProjectionRows,
): Promise<void> {
  const snapshotResult = await executor.query({
    name: "foodseyo-insert-structured-menu-snapshot",
    text: `
      INSERT INTO public.menu_snapshots (
        id,
        analysis_snapshot_id,
        projector_version,
        title,
        currency,
        projected_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    values: [
      rows.menuSnapshot.id,
      rows.menuSnapshot.analysisSnapshotId,
      rows.menuSnapshot.projectorVersion,
      rows.menuSnapshot.title,
      rows.menuSnapshot.currency,
      rows.menuSnapshot.projectedAt,
    ],
  });
  assertInsertedCount(snapshotResult.rowCount, 1);

  if (rows.sections.length > 0) {
    const sectionResult = await executor.query({
      name: "foodseyo-insert-structured-menu-sections",
      text: `
        INSERT INTO public.menu_sections (
          id,
          menu_snapshot_id,
          analysis_category_id,
          position,
          label
        )
        VALUES ${placeholders(rows.sections.length, 5)}
      `,
      values: rows.sections.flatMap((section) => [
        section.id,
        rows.menuSnapshot.id,
        section.analysisCategoryId,
        section.position,
        section.label,
      ]),
    });
    assertInsertedCount(sectionResult.rowCount, rows.sections.length);
  }

  const itemResult = await executor.query({
    name: "foodseyo-insert-structured-menu-items",
    text: `
      INSERT INTO public.menu_items (
        id,
        menu_snapshot_id,
        menu_section_id,
        analysis_dish_id,
        position,
        display_name,
        original_name,
        menu_description
      )
      VALUES ${placeholders(rows.items.length, 8)}
    `,
    values: rows.items.flatMap((item) => [
      item.id,
      rows.menuSnapshot.id,
      item.sectionId,
      item.analysisDishId,
      item.position,
      item.displayName,
      item.originalName,
      item.menuDescription,
    ]),
  });
  assertInsertedCount(itemResult.rowCount, rows.items.length);

  if (rows.prices.length > 0) {
    const priceResult = await executor.query({
      name: "foodseyo-insert-structured-menu-prices",
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
        VALUES ${placeholders(rows.prices.length, 9)}
      `,
      values: rows.prices.flatMap((price) => [
        price.id,
        price.itemId,
        price.analysisPriceId,
        price.position,
        price.priceKind,
        price.contextLabel,
        price.amount,
        price.currency,
        price.displayText,
      ]),
    });
    assertInsertedCount(priceResult.rowCount, rows.prices.length);
  }
}

export async function verifyStructuredMenuProjectionCounts(
  executor: AnalysisCacheQueryExecutor,
  input: {
    readonly menuSnapshotId: string;
    readonly expectedSectionCount: number;
    readonly expectedItemCount: number;
    readonly expectedPriceCount: number;
  },
): Promise<void> {
  const result = await executor.query<z.infer<typeof ProjectionCountsSchema>>({
    name: "foodseyo-verify-structured-menu-projection-counts",
    text: `
      SELECT
        (
          SELECT count(*)::integer
          FROM public.menu_snapshots
          WHERE id = $1
        ) AS "menuSnapshotCount",
        (
          SELECT count(*)::integer
          FROM public.menu_sections
          WHERE menu_snapshot_id = $1
        ) AS "sectionCount",
        (
          SELECT count(*)::integer
          FROM public.menu_items
          WHERE menu_snapshot_id = $1
        ) AS "itemCount",
        (
          SELECT count(*)::integer
          FROM public.menu_item_prices AS price
          JOIN public.menu_items AS item
            ON item.id = price.menu_item_id
          WHERE item.menu_snapshot_id = $1
        ) AS "priceCount"
    `,
    values: [input.menuSnapshotId],
  });
  const counts = parseStructuredMenuValue(
    ProjectionCountsSchema,
    result.rows[0],
  );
  if (
    counts.menuSnapshotCount !== 1 ||
    counts.sectionCount !== input.expectedSectionCount ||
    counts.itemCount !== input.expectedItemCount ||
    counts.priceCount !== input.expectedPriceCount
  ) {
    throw new StructuredMenuProjectionError(
      "PROJECTION_INTEGRITY_FAILURE",
    );
  }
}

export function isStructuredMenuProjectionUniqueConflict(
  error: unknown,
): boolean {
  if (!(error instanceof Error)) return false;
  const code =
    "code" in error
      ? String((error as Error & { readonly code?: unknown }).code)
      : "";
  const constraint =
    "constraint" in error
      ? String(
          (error as Error & { readonly constraint?: unknown })
            .constraint,
        )
      : "";
  const exactConstraint =
    "menu_snapshots_source_projector_uk";
  return (
    (code === "23505" || error.message.includes("duplicate key")) &&
    (constraint === exactConstraint ||
      error.message.includes(exactConstraint))
  );
}
