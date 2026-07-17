import { readFile } from "node:fs/promises";

import {
  FOODSEYO_ANALYSIS_SCHEMA_VERSION,
  FOODSEYO_ANALYSIS_SUPPORTED_SCHEMA_VERSIONS,
  FoodseyoAnalysisSchema,
  type FoodseyoAnalysis,
} from "../src/domain/foodseyo-analysis.ts";
import { demoFoodseyoAnalysis } from "../src/data/demoFoodseyoAnalysis.ts";
import {
  ANALYSIS_CONSISTENCY_PROFILE_VERSION,
  createDishFingerprint,
  createImageContentHash,
  createSourceFingerprint,
} from "../src/lib/analysis-consistency/index.ts";
import { CURRENT_ANALYSIS_STORAGE_KEY } from "../src/lib/storage.ts";
import {
  ANALYSIS_CACHE_BUSY_PUBLIC_RESULT,
  ANALYSIS_CACHE_BUSY_WAIT_MAX_MS,
  ANALYSIS_CACHE_INDETERMINATE_PUBLIC_RESULT,
  ANALYSIS_CACHE_POLL_INTERVAL_MAX_MS,
  ANALYSIS_CACHE_POLL_INTERVAL_MIN_MS,
  ANALYSIS_RUN_LEASE_DURATION_MS,
  DATABASE_UPLOADED_MENU_IMAGE_INPUT_KIND,
  SNAPSHOT_RESULT_FINGERPRINT_PATTERN,
  SNAPSHOT_RESULT_FINGERPRINT_PREFIX,
  SNAPSHOT_RESULT_FINGERPRINT_VERSION,
  SOURCE_FINGERPRINT_VERSION,
  createSnapshotResultFingerprint,
  toDatabaseEvidenceInputKind,
} from "../src/services/menu-analysis/menu-cache-contract.ts";
import { prepareMenuImagesAnalysis } from "../src/services/menu-analysis/menu-analysis-preparation.ts";
import {
  MENU_IMAGE_PROMPT_VERSION,
  MENU_IMAGE_PROVIDER_SCHEMA_VERSION,
} from "../src/services/menu-analysis/menu-analysis-versions.ts";
import {
  DEFAULT_MENU_ANALYSIS_MODEL,
} from "../src/services/menu-analysis/openai-menu-request.ts";
import {
  captureError,
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo menu cache contract validation",
  "Menu cache contract validation failed",
);
const networkGuard = installNetworkGuard(
  "Menu cache contract validation must not use the network.",
);

const transientImage = (id: string, bytes: Uint8Array) => ({
  id,
  fileName: null,
  mediaType: "image/jpeg",
  byteLength: bytes.byteLength,
  async read() {
    return bytes.slice();
  },
});

const prepared = await prepareMenuImagesAnalysis(
  {
    type: "menu_images",
    images: [
      transientImage("page-1", new Uint8Array([1, 2, 3])),
      transientImage("page-2", new Uint8Array([4, 5, 6])),
    ],
    userEnteredRestaurantName: "  SYNTHETIC   CAFE  ",
    location: null,
  },
  {
    environment: { OPENAI_MODEL: " gpt-5.6-terra " },
  },
);

verify(
  prepared.modelVersion === "gpt-5.6-terra" &&
    prepared.versions.modelVersion === "gpt-5.6-terra",
  "preparation resolves the allow-listed model without OPENAI_API_KEY",
);
verify(
  prepared.cacheIdentity.analysisContract.promptVersion ===
    MENU_IMAGE_PROMPT_VERSION &&
    prepared.cacheIdentity.analysisContract.providerSchemaVersion ===
      MENU_IMAGE_PROVIDER_SCHEMA_VERSION &&
    prepared.cacheIdentity.analysisContract.canonicalSchemaVersion ===
      FOODSEYO_ANALYSIS_SCHEMA_VERSION &&
    prepared.cacheIdentity.analysisContract.consistencyProfileVersion ===
      ANALYSIS_CONSISTENCY_PROFILE_VERSION,
  "preparation resolves the complete five-value analysis contract",
);
verify(
  prepared.cacheIdentity.sourceFingerprintVersion ===
    SOURCE_FINGERPRINT_VERSION &&
    prepared.cacheIdentity.sourceFingerprint.startsWith("source_") &&
    prepared.imageCount === 2,
  "preparation returns source identity metadata and the exact image count",
);
verify(
  prepared.normalizedRestaurantIdentifier === "synthetic cafe",
  "preparation exposes the normalized optional restaurant identifier",
);
verify(
  prepared.databaseInputKind === DATABASE_UPLOADED_MENU_IMAGE_INPUT_KIND,
  "preparation maps menu_images to uploaded_menu_images",
);

const preparationSource = await readFile(
  new URL(
    "../src/services/menu-analysis/menu-analysis-preparation.ts",
    import.meta.url,
  ),
  "utf8",
);
const analyzerSource = await readFile(
  new URL("../src/services/menu-analysis/menu-images-analyzer.ts", import.meta.url),
  "utf8",
);
verify(
  !/OPENAI_API_KEY|createOpenAIMenuVisionProvider|new OpenAI/u.test(
    preparationSource,
  ),
  "preparation has no provider credential or provider construction dependency",
);
verify(
  analyzerSource.indexOf("await prepareMenuImagesAnalysis") <
    analyzerSource.indexOf("dependencies.createProvider"),
  "the provider factory boundary follows complete preparation",
);

const orderedImageContentHashes = await Promise.all([
  createImageContentHash(new TextEncoder().encode("synthetic-image-content-a")),
  createImageContentHash(new TextEncoder().encode("synthetic-image-content-b")),
]);
const unchangedSourceFingerprint = await createSourceFingerprint({
  sourceType: "menu_images",
  sourceIdentifier: null,
  imageCount: orderedImageContentHashes.length,
  orderedImageContentHashes,
  restaurantIdentifier: "synthetic-restaurant-a",
  branchIdentifier: "downtown",
  sourceRevision: "revision-1",
});
verify(
  unchangedSourceFingerprint ===
    "source_c57f575333619ea97ba2394935751810598407102597eabb883ce49e64cf50ec",
  "the pre-version source fingerprint regression fixture is byte-for-byte unchanged",
);
verify(
  SOURCE_FINGERPRINT_VERSION === "foodseyo-source-fingerprint-v1",
  "the source fingerprint metadata version is frozen",
);

const unchangedDishFingerprint = await createDishFingerprint({
  sourceFingerprint: unchangedSourceFingerprint,
  sourceDishIdentifier: "synthetic-dish-1",
  sourceStatedName: "Synthetic Dish",
  sourceStatedDescription: "Source-stated description",
  sourceStatedCategoryLabel: "Mains",
  sourceStatedPrice: {
    amount: 12.5,
    currency: "CAD",
    displayText: "CAD 12.50",
  },
});
verify(
  unchangedDishFingerprint ===
    "dish_784ef5b6896cd8964ebd61a137b350dd3ccfaa8ed6af7f5794da8e4ebc271055",
  "the existing dish fingerprint regression fixture is unchanged",
);

const snapshotFixture = FoodseyoAnalysisSchema.parse(demoFoodseyoAnalysis);
const snapshotFingerprint = await createSnapshotResultFingerprint(snapshotFixture);
verify(
  snapshotFingerprint ===
    (await createSnapshotResultFingerprint(snapshotFixture)),
  "the same canonical snapshot object has a deterministic fingerprint",
);

const reverseObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== "object" || value === null) return value;
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(source).reverse()) {
    output[key] = reverseObjectKeys(source[key]);
  }
  return output;
};
const reorderedSnapshot = reverseObjectKeys(snapshotFixture) as FoodseyoAnalysis;
verify(
  snapshotFingerprint ===
    (await createSnapshotResultFingerprint(reorderedSnapshot)),
  "recursive property insertion order does not change the snapshot fingerprint",
);

const mutatedSnapshot = structuredClone(snapshotFixture);
mutatedSnapshot.analysisId = `${mutatedSnapshot.analysisId}-changed`;
verify(
  snapshotFingerprint !==
    (await createSnapshotResultFingerprint(mutatedSnapshot)),
  "a meaningful canonical snapshot field change changes the fingerprint",
);
verify(
  SNAPSHOT_RESULT_FINGERPRINT_VERSION ===
    "foodseyo-snapshot-result-v1" &&
    snapshotFingerprint.startsWith(SNAPSHOT_RESULT_FINGERPRINT_PREFIX) &&
    SNAPSHOT_RESULT_FINGERPRINT_PATTERN.test(snapshotFingerprint),
  "the snapshot fingerprint uses the frozen prefix and lowercase SHA-256 format",
);

const structurallyInvalidSnapshot = structuredClone(
  snapshotFixture,
) as unknown as Record<string, unknown>;
delete structurallyInvalidSnapshot.analysisId;
verify(
  (await captureError(() =>
    createSnapshotResultFingerprint(
      structurallyInvalidSnapshot as unknown as FoodseyoAnalysis,
    ),
  )) !== null,
  "structurally invalid canonical data is rejected before fingerprinting",
);
const semanticallyInvalidSnapshot = structuredClone(snapshotFixture);
semanticallyInvalidSnapshot.payload.restaurant = null;
verify(
  (await captureError(() =>
    createSnapshotResultFingerprint(semanticallyInvalidSnapshot),
  )) instanceof TypeError,
  "semantically invalid canonical data is rejected before fingerprinting",
);

verify(
  toDatabaseEvidenceInputKind("menu_images") ===
    "uploaded_menu_images",
  "the application-to-database input-kind mapping is frozen",
);
verify(
  ANALYSIS_RUN_LEASE_DURATION_MS === 120_000 &&
    ANALYSIS_CACHE_BUSY_WAIT_MAX_MS === 2_000,
  "lease and bounded busy-wait durations are frozen",
);
verify(
  ANALYSIS_CACHE_POLL_INTERVAL_MIN_MS === 100 &&
    ANALYSIS_CACHE_POLL_INTERVAL_MAX_MS === 250,
  "busy polling bounds are frozen",
);
verify(
  ANALYSIS_CACHE_BUSY_PUBLIC_RESULT.code === "ANALYSIS_IN_PROGRESS" &&
    ANALYSIS_CACHE_BUSY_PUBLIC_RESULT.httpStatus === 409 &&
    ANALYSIS_CACHE_BUSY_PUBLIC_RESULT.retryable &&
    ANALYSIS_CACHE_BUSY_PUBLIC_RESULT.retryAfterSeconds === 2,
  "future busy public status metadata is frozen",
);
verify(
  ANALYSIS_CACHE_INDETERMINATE_PUBLIC_RESULT.code ===
    "ANALYSIS_TEMPORARILY_UNAVAILABLE" &&
    ANALYSIS_CACHE_INDETERMINATE_PUBLIC_RESULT.httpStatus === 503 &&
    ANALYSIS_CACHE_INDETERMINATE_PUBLIC_RESULT.retryable,
  "future indeterminate public status metadata is frozen",
);
verify(
  FOODSEYO_ANALYSIS_SUPPORTED_SCHEMA_VERSIONS.join(",") ===
    "1.0.0,1.1.0,1.1.1",
  "all existing canonical schema versions remain readable",
);
verify(
  CURRENT_ANALYSIS_STORAGE_KEY === "foodseyo.currentAnalysis",
  "the current analysis sessionStorage key is unchanged",
);
verify(
  DEFAULT_MENU_ANALYSIS_MODEL === "gpt-5.6" &&
    MENU_IMAGE_PROMPT_VERSION === "menu-image-prompt-v2" &&
    MENU_IMAGE_PROVIDER_SCHEMA_VERSION === "menu-image-provider-schema-v2",
  "provider model, prompt, and schema defaults are unchanged",
);
verify(
  networkGuard.callCount === 0,
  "cache contract validation makes zero external network calls",
);
networkGuard.restore();

report();
