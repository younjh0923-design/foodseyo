import type { NormalizedDishConsistency } from "./normalize.ts";
import { renderDishConsistencyWording } from "./wording.ts";
import {
  createAnalysisConsistencyVersionMetadata,
  type AnalysisConsistencyVersionMetadata,
} from "./metadata.ts";

export const ANALYSIS_FINGERPRINT_HASH_ALGORITHM = "SHA-256" as const;
export const SOURCE_FINGERPRINT_PATTERN = /^source_[a-f0-9]{64}$/u;
export const DISH_FINGERPRINT_PATTERN = /^dish_[a-f0-9]{64}$/u;
export const ANALYSIS_RESULT_FINGERPRINT_PATTERN = /^result_[a-f0-9]{64}$/u;
export const IMAGE_CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/u;

export interface SourceFingerprintInput {
  readonly sourceType: string;
  readonly sourceIdentifier: string | null;
  readonly imageCount: number;
  readonly orderedImageContentHashes: readonly string[];
  readonly restaurantIdentifier: string | null;
  readonly branchIdentifier: string | null;
  readonly sourceRevision: string | null;
}

export interface SourceStatedDishPriceInput {
  readonly amount: number | null;
  readonly currency: string | null;
  readonly displayText: string | null;
}

export interface DishFingerprintInput {
  readonly sourceFingerprint: string;
  readonly sourceDishIdentifier: string;
  readonly sourceStatedName: string;
  readonly sourceStatedDescription: string | null;
  readonly sourceStatedCategoryLabel: string | null;
  readonly sourceStatedPrice: SourceStatedDishPriceInput;
}

export interface AnalysisResultFingerprintInput {
  readonly dishFingerprint: string;
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

const sha256Bytes = async (bytes: Uint8Array): Promise<string> => {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    ANALYSIS_FINGERPRINT_HASH_ALGORITHM,
    digestInput.buffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const sha256Hex = async (serialized: string): Promise<string> => {
  return sha256Bytes(new TextEncoder().encode(serialized));
};

export async function createImageContentHash(bytes: Uint8Array): Promise<string> {
  return sha256Bytes(bytes);
}

export async function createSourceFingerprint(
  input: SourceFingerprintInput,
): Promise<string> {
  const sourceType = normalizeFingerprintText(input.sourceType);
  if (!sourceType) throw new TypeError("Source fingerprint identity is incomplete.");

  const orderedImageContentHashes = input.orderedImageContentHashes.map((hash) =>
    hash.normalize("NFKC").trim().toLocaleLowerCase("en"),
  );
  const isMenuImages = sourceType === "menu_images";
  if (isMenuImages) {
    if (
      input.sourceIdentifier !== null ||
      !Number.isInteger(input.imageCount) ||
      input.imageCount < 1 ||
      input.imageCount !== orderedImageContentHashes.length ||
      orderedImageContentHashes.some((hash) => !IMAGE_CONTENT_HASH_PATTERN.test(hash))
    ) {
      throw new TypeError("Menu-image source fingerprint identity is malformed.");
    }
  } else {
    const sourceIdentifier = input.sourceIdentifier
      ? normalizeFingerprintText(input.sourceIdentifier)
      : "";
    if (
      !sourceIdentifier ||
      input.imageCount !== 0 ||
      orderedImageContentHashes.length !== 0
    ) {
      throw new TypeError("Named source fingerprint identity is malformed.");
    }
  }

  const canonicalInput = {
    branchIdentifier: normalizeNullableFingerprintText(input.branchIdentifier),
    imageCount: input.imageCount,
    orderedImageContentHashes,
    restaurantIdentifier: normalizeNullableFingerprintText(input.restaurantIdentifier),
    sourceIdentifier: normalizeNullableFingerprintText(input.sourceIdentifier),
    sourceRevision: normalizeNullableFingerprintText(input.sourceRevision),
    sourceType,
  };
  return `source_${await sha256Hex(canonicalSerialize(canonicalInput))}`;
}

export async function createDishFingerprint(
  input: DishFingerprintInput,
): Promise<string> {
  if (!SOURCE_FINGERPRINT_PATTERN.test(input.sourceFingerprint)) {
    throw new TypeError("Dish fingerprint source identity is malformed.");
  }
  const sourceDishIdentifier = normalizeFingerprintText(input.sourceDishIdentifier);
  const sourceStatedName = normalizeFingerprintText(input.sourceStatedName);
  if (!sourceDishIdentifier || !sourceStatedName) {
    throw new TypeError("Dish fingerprint source evidence is incomplete.");
  }
  if (
    input.sourceStatedPrice.amount !== null &&
    !Number.isFinite(input.sourceStatedPrice.amount)
  ) {
    throw new TypeError("Dish fingerprint price must be finite when present.");
  }

  const canonicalInput = {
    sourceDishIdentifier,
    sourceFingerprint: input.sourceFingerprint,
    sourceStatedCategoryLabel: normalizeNullableFingerprintText(
      input.sourceStatedCategoryLabel,
    ),
    sourceStatedDescription: normalizeNullableFingerprintText(
      input.sourceStatedDescription,
    ),
    sourceStatedName,
    sourceStatedPrice: {
      amount: input.sourceStatedPrice.amount,
      currency: normalizeNullableFingerprintText(input.sourceStatedPrice.currency),
      displayText: normalizeNullableFingerprintText(input.sourceStatedPrice.displayText),
    },
  };
  return `dish_${await sha256Hex(canonicalSerialize(canonicalInput))}`;
}

export async function createAnalysisResultFingerprint(
  input: AnalysisResultFingerprintInput,
): Promise<string> {
  if (!DISH_FINGERPRINT_PATTERN.test(input.dishFingerprint)) {
    throw new TypeError("Analysis result dish identity is malformed.");
  }
  const canonicalInput = {
    consistency: input.consistency,
    dishFingerprint: input.dishFingerprint,
    versions: normalizeVersions(input.versions),
    wording: renderDishConsistencyWording(input.consistency),
  };
  return `result_${await sha256Hex(canonicalSerialize(canonicalInput))}`;
}
