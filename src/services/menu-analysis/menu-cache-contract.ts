import {
  FoodseyoAnalysisSchema,
  type AnalysisConsistencyVersionMetadata,
  type FoodseyoAnalysis,
} from "../../domain/foodseyo-analysis.ts";
import { canonicalSerialize } from "../../lib/analysis-consistency/fingerprint.ts";
import { validateAnalysisSemantics } from "../analysis/validate-analysis-semantics.ts";

export const SOURCE_FINGERPRINT_VERSION =
  "foodseyo-source-fingerprint-v1" as const;

export const SNAPSHOT_RESULT_FINGERPRINT_VERSION =
  "foodseyo-snapshot-result-v1" as const;
export const SNAPSHOT_RESULT_FINGERPRINT_PREFIX =
  `${SNAPSHOT_RESULT_FINGERPRINT_VERSION}:` as const;
export const SNAPSHOT_RESULT_FINGERPRINT_PATTERN =
  /^foodseyo-snapshot-result-v1:[a-f0-9]{64}$/u;

export const APPLICATION_MENU_IMAGE_INPUT_KIND = "menu_images" as const;
export const DATABASE_UPLOADED_MENU_IMAGE_INPUT_KIND =
  "uploaded_menu_images" as const;

export const ANALYSIS_RUN_LEASE_DURATION_MS = 120_000 as const;
export const ANALYSIS_CACHE_BUSY_WAIT_MAX_MS = 2_000 as const;
export const ANALYSIS_CACHE_POLL_INTERVAL_MIN_MS = 100 as const;
export const ANALYSIS_CACHE_POLL_INTERVAL_MAX_MS = 250 as const;

export interface AnalysisCacheContractIdentity {
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly providerSchemaVersion: string;
  readonly canonicalSchemaVersion: string;
  readonly consistencyProfileVersion: string;
}

export interface ExactAnalysisCacheIdentity {
  readonly sourceFingerprint: string;
  readonly sourceFingerprintVersion: typeof SOURCE_FINGERPRINT_VERSION;
  readonly analysisContract: AnalysisCacheContractIdentity;
}

export interface FutureAnalysisCachePublicResult<
  TCode extends string,
  TStatus extends number,
> {
  readonly code: TCode;
  readonly httpStatus: TStatus;
  readonly retryable: true;
}

export const ANALYSIS_CACHE_BUSY_PUBLIC_RESULT = Object.freeze({
  code: "ANALYSIS_IN_PROGRESS",
  httpStatus: 409,
  retryable: true,
  retryAfterSeconds: 2,
} as const);

export const ANALYSIS_CACHE_INDETERMINATE_PUBLIC_RESULT = Object.freeze({
  code: "ANALYSIS_TEMPORARILY_UNAVAILABLE",
  httpStatus: 503,
  retryable: true,
} as const);

export function toDatabaseEvidenceInputKind(
  inputKind: typeof APPLICATION_MENU_IMAGE_INPUT_KIND,
): typeof DATABASE_UPLOADED_MENU_IMAGE_INPUT_KIND {
  if (inputKind !== APPLICATION_MENU_IMAGE_INPUT_KIND) {
    throw new TypeError("Unsupported analysis input kind for database evidence.");
  }
  return DATABASE_UPLOADED_MENU_IMAGE_INPUT_KIND;
}

export const createAnalysisCacheContractIdentity = (
  versions: AnalysisConsistencyVersionMetadata,
): AnalysisCacheContractIdentity => ({
  modelVersion: versions.modelVersion,
  promptVersion: versions.promptVersion,
  providerSchemaVersion: versions.providerSchemaVersion,
  canonicalSchemaVersion: versions.canonicalSchemaVersion,
  consistencyProfileVersion: versions.consistencyProfileVersion,
});

const sha256Hex = async (serialized: string): Promise<string> => {
  const bytes = new TextEncoder().encode(serialized);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export async function createSnapshotResultFingerprint(
  validatedAnalysis: FoodseyoAnalysis,
): Promise<`${typeof SNAPSHOT_RESULT_FINGERPRINT_PREFIX}${string}`> {
  const canonicalAnalysis = FoodseyoAnalysisSchema.parse(validatedAnalysis);
  if (validateAnalysisSemantics(canonicalAnalysis.payload).errors.length > 0) {
    throw new TypeError(
      "Snapshot result fingerprinting requires a semantically valid canonical analysis.",
    );
  }

  const hash = await sha256Hex(canonicalSerialize(canonicalAnalysis));
  return `${SNAPSHOT_RESULT_FINGERPRINT_PREFIX}${hash}`;
}
