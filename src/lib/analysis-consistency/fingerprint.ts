import type { NormalizedDishConsistency } from "./normalize.ts";
import {
  createAnalysisConsistencyVersionMetadata,
  type AnalysisConsistencyVersionMetadata,
} from "./metadata.ts";

export const ANALYSIS_FINGERPRINT_HASH_ALGORITHM = "SHA-256" as const;
export const SOURCE_FINGERPRINT_PATTERN = /^source_[a-f0-9]{64}$/u;
export const DISH_FINGERPRINT_PATTERN = /^dish_[a-f0-9]{64}$/u;

export interface SourceFingerprintInput {
  readonly sourceType: string;
  readonly sourceIdentifier: string;
  readonly restaurantIdentifier: string | null;
  readonly branchIdentifier: string | null;
  readonly sourceRevision: string | null;
  readonly versions: AnalysisConsistencyVersionMetadata;
}

export interface DishFingerprintPriceInput {
  readonly amount: number | null;
  readonly currency: string | null;
  readonly displayText: string | null;
}

export interface DishFingerprintInput {
  readonly sourceFingerprint: string;
  readonly dishName: string;
  readonly originalDescription: string | null;
  readonly categoryLabel: string | null;
  readonly price: DishFingerprintPriceInput;
  readonly consistency: NormalizedDishConsistency;
  readonly versions: AnalysisConsistencyVersionMetadata;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
};

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical serialization accepts finite numbers only.");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry === undefined) {
        throw new TypeError("Canonical serialization does not accept undefined values.");
      }
      output[key] = canonicalize(entry);
    }
    return output;
  }
  throw new TypeError("Canonical serialization received an unsupported value.");
};

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

const normalizeFingerprintText = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/\s+/gu, " ");

const normalizeNullableFingerprintText = (value: string | null): string | null => {
  if (value === null) return null;
  const normalized = normalizeFingerprintText(value);
  return normalized || null;
};

const normalizeVersions = (
  versions: AnalysisConsistencyVersionMetadata,
): AnalysisConsistencyVersionMetadata => {
  const normalized = createAnalysisConsistencyVersionMetadata(versions);
  if (normalized.consistencyProfileVersion !== versions.consistencyProfileVersion) {
    throw new TypeError("Fingerprint metadata uses an unsupported consistency profile.");
  }
  return normalized;
};

const sha256Hex = async (serialized: string): Promise<string> => {
  const bytes = new TextEncoder().encode(serialized);
  const digest = await globalThis.crypto.subtle.digest(
    ANALYSIS_FINGERPRINT_HASH_ALGORITHM,
    bytes,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export async function createSourceFingerprint(
  input: SourceFingerprintInput,
): Promise<string> {
  const sourceType = normalizeFingerprintText(input.sourceType);
  const sourceIdentifier = normalizeFingerprintText(input.sourceIdentifier);
  if (!sourceType || !sourceIdentifier) {
    throw new TypeError("Source fingerprint identity is incomplete.");
  }

  const canonicalInput = {
    branchIdentifier: normalizeNullableFingerprintText(input.branchIdentifier),
    restaurantIdentifier: normalizeNullableFingerprintText(input.restaurantIdentifier),
    sourceIdentifier,
    sourceRevision: normalizeNullableFingerprintText(input.sourceRevision),
    sourceType,
    versions: normalizeVersions(input.versions),
  };
  return `source_${await sha256Hex(canonicalSerialize(canonicalInput))}`;
}

export async function createDishFingerprint(
  input: DishFingerprintInput,
): Promise<string> {
  if (!SOURCE_FINGERPRINT_PATTERN.test(input.sourceFingerprint)) {
    throw new TypeError("Dish fingerprint source identity is malformed.");
  }
  const dishName = normalizeFingerprintText(input.dishName);
  if (!dishName) throw new TypeError("Dish fingerprint identity is incomplete.");
  if (input.price.amount !== null && !Number.isFinite(input.price.amount)) {
    throw new TypeError("Dish fingerprint price must be finite when present.");
  }

  const canonicalInput = {
    categoryLabel: normalizeNullableFingerprintText(input.categoryLabel),
    consistency: input.consistency,
    dishName,
    originalDescription: normalizeNullableFingerprintText(input.originalDescription),
    price: {
      amount: input.price.amount,
      currency: normalizeNullableFingerprintText(input.price.currency),
      displayText: normalizeNullableFingerprintText(input.price.displayText),
    },
    sourceFingerprint: input.sourceFingerprint,
    versions: normalizeVersions(input.versions),
  };
  return `dish_${await sha256Hex(canonicalSerialize(canonicalInput))}`;
}
