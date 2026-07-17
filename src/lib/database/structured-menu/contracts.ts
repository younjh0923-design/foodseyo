import { z } from "zod";

export const STRUCTURED_MENU_PROJECTOR_VERSION =
  "foodseyo-structured-menu-v1" as const;

export type StructuredMenuProjectionErrorCode =
  | "INVALID_PROJECTION_INPUT"
  | "SOURCE_SNAPSHOT_NOT_FOUND"
  | "SOURCE_SNAPSHOT_INELIGIBLE"
  | "PROJECTION_NOT_FOUND"
  | "PROJECTION_INTEGRITY_FAILURE"
  | "PROJECTION_PERSISTENCE_CONFLICT";

export class StructuredMenuProjectionError extends Error {
  readonly code: StructuredMenuProjectionErrorCode;

  constructor(code: StructuredMenuProjectionErrorCode) {
    super("The structured-menu projection could not be completed safely.");
    this.name = "StructuredMenuProjectionError";
    this.code = code;
  }
}

export const ProjectorVersionSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u);

const UuidSchema = z.string().uuid();
const NonBlankTextSchema = z.string().min(1).refine((value) => {
  return value.trim().length > 0;
});
const NullableNonBlankTextSchema = NonBlankTextSchema.nullable();
const ExactNumericTextSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/u);

export const StructuredMenuProjectionPriceSchema = z.strictObject({
  analysisPriceId: NullableNonBlankTextSchema,
  position: z.number().int().nonnegative(),
  priceKind: z.enum(["base", "option"]),
  contextLabel: NullableNonBlankTextSchema,
  amount: ExactNumericTextSchema,
  currency: NullableNonBlankTextSchema,
  displayText: NonBlankTextSchema,
});

export const StructuredMenuProjectionItemSchema = z.strictObject({
  analysisDishId: NonBlankTextSchema,
  sectionAnalysisCategoryId: NullableNonBlankTextSchema,
  position: z.number().int().nonnegative(),
  displayName: NonBlankTextSchema,
  originalName: NullableNonBlankTextSchema,
  menuDescription: NullableNonBlankTextSchema,
  prices: z.array(StructuredMenuProjectionPriceSchema),
});

export const StructuredMenuProjectionSectionSchema = z.strictObject({
  analysisCategoryId: NonBlankTextSchema,
  position: z.number().int().nonnegative(),
  label: NonBlankTextSchema,
});

export const StructuredMenuProjectionDtoSchema = z.strictObject({
  analysisSnapshotId: UuidSchema,
  projectorVersion: ProjectorVersionSchema,
  title: NullableNonBlankTextSchema,
  currency: NullableNonBlankTextSchema,
  sections: z.array(StructuredMenuProjectionSectionSchema),
  items: z.array(StructuredMenuProjectionItemSchema).min(1),
});

export const MenuSnapshotRecordSchema = z.strictObject({
  id: UuidSchema,
  analysisSnapshotId: UuidSchema,
  projectorVersion: ProjectorVersionSchema,
  title: NullableNonBlankTextSchema,
  currency: NullableNonBlankTextSchema,
  projectedAt: z.date(),
});

export type StructuredMenuProjectionDto = z.infer<
  typeof StructuredMenuProjectionDtoSchema
>;
export type StructuredMenuProjectionSection = z.infer<
  typeof StructuredMenuProjectionSectionSchema
>;
export type StructuredMenuProjectionItem = z.infer<
  typeof StructuredMenuProjectionItemSchema
>;
export type StructuredMenuProjectionPrice = z.infer<
  typeof StructuredMenuProjectionPriceSchema
>;
export type MenuSnapshotRecord = z.infer<
  typeof MenuSnapshotRecordSchema
>;

export interface EligibleStructuredMenuProjection {
  readonly menuSnapshot: MenuSnapshotRecord;
  readonly projection: StructuredMenuProjectionDto;
}

export function parseStructuredMenuValue<Value>(
  schema: z.ZodType<Value>,
  value: unknown,
  code:
    | "INVALID_PROJECTION_INPUT"
    | "PROJECTION_INTEGRITY_FAILURE" = "PROJECTION_INTEGRITY_FAILURE",
): Value {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StructuredMenuProjectionError(code);
  return parsed.data;
}
