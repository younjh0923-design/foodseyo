import { z } from "zod";

import {
  ConsistentFoodseyoAnalysisSchema,
  type ConsistentFoodseyoAnalysis,
} from "../../../domain/foodseyo-analysis.ts";
import { SOURCE_FINGERPRINT_PATTERN } from "../../analysis-consistency/fingerprint.ts";
import { validateAnalysisSemantics } from "../../../services/analysis/validate-analysis-semantics.ts";
import {
  SNAPSHOT_RESULT_FINGERPRINT_PATTERN,
  SOURCE_FINGERPRINT_VERSION,
  type AnalysisCacheContractIdentity,
} from "../../../services/menu-analysis/menu-cache-contract.ts";

export type AnalysisCacheRepositoryErrorCode =
  | "INVALID_REPOSITORY_INPUT"
  | "INVALID_DATABASE_ROW"
  | "INVALID_CANONICAL_ANALYSIS"
  | "CANONICAL_IDENTITY_MISMATCH"
  | "ANALYSIS_CONTRACT_NOT_RESOLVED"
  | "MENU_EVIDENCE_NOT_RESOLVED"
  | "MENU_EVIDENCE_IDENTITY_CONFLICT"
  | "ANALYSIS_RUN_NOT_FOUND"
  | "PROCESSING_RUN_NOT_OWNED"
  | "ANALYSIS_RUN_TRANSITION_CONFLICT"
  | "SNAPSHOT_PERSISTENCE_CONFLICT"
  | "SNAPSHOT_INTEGRITY_FAILURE";

export class AnalysisCacheRepositoryError extends Error {
  readonly code: AnalysisCacheRepositoryErrorCode;

  constructor(code: AnalysisCacheRepositoryErrorCode) {
    super("The analysis-cache repository operation could not be completed safely.");
    this.name = "AnalysisCacheRepositoryError";
    this.code = code;
  }
}

const ExactNonBlankTextSchema = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());
const UuidSchema = z.string().uuid();

const AnalysisContractShape = {
  modelVersion: ExactNonBlankTextSchema,
  promptVersion: ExactNonBlankTextSchema,
  providerSchemaVersion: ExactNonBlankTextSchema,
  canonicalSchemaVersion: ExactNonBlankTextSchema,
  consistencyProfileVersion: ExactNonBlankTextSchema,
} as const;

export const AnalysisContractIdentitySchema = z.strictObject(
  AnalysisContractShape,
);
export type AnalysisContractIdentity = z.infer<
  typeof AnalysisContractIdentitySchema
>;

export const AnalysisContractRecordSchema = z.strictObject({
  id: UuidSchema,
  ...AnalysisContractShape,
  createdAt: z.date(),
});
export type AnalysisContractRecord = z.infer<
  typeof AnalysisContractRecordSchema
>;

export const UploadedMenuEvidenceInputSchema = z.strictObject({
  sourceFingerprint: z.string().regex(SOURCE_FINGERPRINT_PATTERN),
  fingerprintVersion: z.literal(SOURCE_FINGERPRINT_VERSION),
  imageCount: z.number().int().positive(),
  observedAt: z.date(),
});
export type UploadedMenuEvidenceInput = z.infer<
  typeof UploadedMenuEvidenceInputSchema
>;

const AnalysisCacheInputKindSchema = z.enum([
  "uploaded_menu_images",
  "official_menu_html",
  "official_menu_pdf",
  "online_ordering_menu",
  "listing_menu",
  "listing_menu_photo",
]);

export const MenuEvidenceSetRecordSchema = z.strictObject({
  id: UuidSchema,
  inputKind: AnalysisCacheInputKindSchema,
  sourceFingerprint: z.string().regex(SOURCE_FINGERPRINT_PATTERN),
  fingerprintVersion: ExactNonBlankTextSchema,
  imageCount: z.number().int().positive().nullable(),
  normalizedUrl: ExactNonBlankTextSchema.nullable(),
  sourceProvider: ExactNonBlankTextSchema.nullable(),
  observedAt: z.date(),
  createdAt: z.date(),
});
export type MenuEvidenceSetRecord = z.infer<
  typeof MenuEvidenceSetRecordSchema
>;

export const AnalysisRunStatusSchema = z.enum([
  "processing",
  "ready",
  "failed",
]);

export const AnalysisRunRecordSchema = z
  .strictObject({
    id: UuidSchema,
    menuEvidenceSetId: UuidSchema,
    analysisContractId: UuidSchema,
    status: AnalysisRunStatusSchema,
    attemptNumber: z.number().int().positive(),
    safeErrorCode: ExactNonBlankTextSchema.nullable(),
    startedAt: z.date(),
    leaseExpiresAt: z.date().nullable(),
    finishedAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .superRefine((value, context) => {
    const processingStateIsValid =
      value.status === "processing" &&
      value.leaseExpiresAt !== null &&
      value.finishedAt === null &&
      value.safeErrorCode === null &&
      value.leaseExpiresAt > value.startedAt;
    const readyStateIsValid =
      value.status === "ready" &&
      value.leaseExpiresAt === null &&
      value.finishedAt !== null &&
      value.safeErrorCode === null;
    const failedStateIsValid =
      value.status === "failed" &&
      value.leaseExpiresAt === null &&
      value.finishedAt !== null &&
      value.safeErrorCode !== null;
    if (
      !processingStateIsValid &&
      !readyStateIsValid &&
      !failedStateIsValid
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid analysis run state.",
      });
    }
    if (
      (value.finishedAt !== null && value.finishedAt < value.startedAt) ||
      value.updatedAt < value.createdAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid analysis run timestamps.",
      });
    }
  });
export type AnalysisRunRecord = z.infer<typeof AnalysisRunRecordSchema>;

export const CreateProcessingAnalysisRunInputSchema = z
  .strictObject({
    id: UuidSchema,
    menuEvidenceSetId: UuidSchema,
    analysisContractId: UuidSchema,
    attemptNumber: z.number().int().positive(),
    startedAt: z.date(),
    leaseExpiresAt: z.date(),
  })
  .refine((value) => value.leaseExpiresAt > value.startedAt);
export type CreateProcessingAnalysisRunInput = z.infer<
  typeof CreateProcessingAnalysisRunInputSchema
>;

export const MarkProcessingAnalysisRunFailedInputSchema = z.strictObject({
  id: UuidSchema,
  menuEvidenceSetId: UuidSchema,
  analysisContractId: UuidSchema,
  safeErrorCode: ExactNonBlankTextSchema,
  failedAt: z.date(),
});
export type MarkProcessingAnalysisRunFailedInput = z.infer<
  typeof MarkProcessingAnalysisRunFailedInputSchema
>;

export const AnalysisSnapshotRecordSchema = z
  .strictObject({
    id: UuidSchema,
    menuEvidenceSetId: UuidSchema,
    analysisContractId: UuidSchema,
    analysisRunId: UuidSchema,
    resultFingerprint: z
      .string()
      .regex(SNAPSHOT_RESULT_FINGERPRINT_PATTERN),
    canonicalResultJson: z.unknown(),
    createdAt: z.date(),
    lastAccessedAt: z.date(),
    expiresAt: z.date().nullable(),
    invalidatedAt: z.date().nullable(),
    safeInvalidationCode: ExactNonBlankTextSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.lastAccessedAt < value.createdAt ||
      (value.expiresAt !== null && value.expiresAt <= value.createdAt) ||
      (value.invalidatedAt !== null &&
        value.invalidatedAt < value.createdAt) ||
      ((value.invalidatedAt === null) !==
        (value.safeInvalidationCode === null))
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid analysis snapshot state.",
      });
    }
  });
export type AnalysisSnapshotRecord = z.infer<
  typeof AnalysisSnapshotRecordSchema
>;

export type ValidatedAnalysisSnapshotRecord = Omit<
  AnalysisSnapshotRecord,
  "canonicalResultJson"
> & {
  readonly canonicalResultJson: ConsistentFoodseyoAnalysis;
};

export const CanonicalIdentityContextSchema = z.strictObject({
  sourceFingerprint: z.string().regex(SOURCE_FINGERPRINT_PATTERN),
  fingerprintVersion: z.literal(SOURCE_FINGERPRINT_VERSION),
  ...AnalysisContractShape,
});
export type CanonicalIdentityContext = z.infer<
  typeof CanonicalIdentityContextSchema
>;

export const ActiveSnapshotContextRowSchema =
  AnalysisSnapshotRecordSchema.extend({
    sourceFingerprint: z.string().regex(SOURCE_FINGERPRINT_PATTERN),
    fingerprintVersion: z.literal(SOURCE_FINGERPRINT_VERSION),
    ...AnalysisContractShape,
  });
export type ActiveSnapshotContextRow = z.infer<
  typeof ActiveSnapshotContextRowSchema
>;

export const ProcessingRunContextRowSchema = AnalysisRunRecordSchema.extend({
  sourceFingerprint: z.string().regex(SOURCE_FINGERPRINT_PATTERN),
  fingerprintVersion: z.literal(SOURCE_FINGERPRINT_VERSION),
  ...AnalysisContractShape,
});
export type ProcessingRunContextRow = z.infer<
  typeof ProcessingRunContextRowSchema
>;

export function parseRepositoryValue<Value>(
  schema: z.ZodType<Value>,
  value: unknown,
  code:
    | "INVALID_REPOSITORY_INPUT"
    | "INVALID_DATABASE_ROW" = "INVALID_DATABASE_ROW",
): Value {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AnalysisCacheRepositoryError(code);
  return parsed.data;
}

export function parseCanonicalAnalysis(
  value: unknown,
): ConsistentFoodseyoAnalysis {
  const parsed = ConsistentFoodseyoAnalysisSchema.safeParse(value);
  if (
    !parsed.success ||
    validateAnalysisSemantics(parsed.data.payload).errors.length > 0
  ) {
    throw new AnalysisCacheRepositoryError("INVALID_CANONICAL_ANALYSIS");
  }
  return parsed.data;
}

export function assertCanonicalIdentity(
  analysis: ConsistentFoodseyoAnalysis,
  context: CanonicalIdentityContext,
): void {
  const versions = analysis.analysisMetadata.versions;
  const expectedContract: AnalysisCacheContractIdentity = {
    modelVersion: context.modelVersion,
    promptVersion: context.promptVersion,
    providerSchemaVersion: context.providerSchemaVersion,
    canonicalSchemaVersion: context.canonicalSchemaVersion,
    consistencyProfileVersion: context.consistencyProfileVersion,
  };
  if (
    analysis.analysisMetadata.sourceFingerprint !== context.sourceFingerprint ||
    analysis.schemaVersion !== expectedContract.canonicalSchemaVersion ||
    Object.entries(expectedContract).some(
      ([key, value]) =>
        versions[key as keyof AnalysisCacheContractIdentity] !== value,
    )
  ) {
    throw new AnalysisCacheRepositoryError("CANONICAL_IDENTITY_MISMATCH");
  }
}
