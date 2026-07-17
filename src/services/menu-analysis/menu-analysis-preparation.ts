import type { AnalysisConsistencyVersionMetadata } from "../../domain/foodseyo-analysis.ts";
import {
  createImageContentHash,
  createSourceFingerprint,
  normalizeSourceFingerprintIdentifier,
} from "../../lib/analysis-consistency/index.ts";
import { AnalysisAbortedError } from "../analysis/analysis-errors.ts";
import type { MenuImagesAnalyzeRequest } from "../analysis/analysis-types.ts";
import {
  APPLICATION_MENU_IMAGE_INPUT_KIND,
  SOURCE_FINGERPRINT_VERSION,
  createAnalysisCacheContractIdentity,
  toDatabaseEvidenceInputKind,
  type ExactAnalysisCacheIdentity,
} from "./menu-cache-contract.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import {
  MAX_MENU_IMAGE_COUNT,
  SERVER_MENU_IMAGE_MAX_BYTES,
  isSupportedMenuImageType,
} from "./menu-image-limits.ts";
import { resolveMenuAnalysisModel } from "./menu-analysis-config.ts";
import { createMenuAnalysisVersionMetadata } from "./menu-analysis-versions.ts";
import type { MenuVisionImageInput } from "./menu-vision-provider.ts";
import type { MenuAnalysisModel } from "./openai-menu-request.ts";

export interface MenuAnalysisPreparationDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly createImageHash?: (bytes: Uint8Array) => Promise<string>;
  readonly createSourceIdentity?: typeof createSourceFingerprint;
}

export interface PreparedMenuImagesAnalysis {
  readonly images: readonly MenuVisionImageInput[];
  readonly imageCount: number;
  readonly modelVersion: MenuAnalysisModel;
  readonly versions: AnalysisConsistencyVersionMetadata;
  readonly normalizedRestaurantIdentifier: string | null;
  readonly databaseInputKind: ReturnType<typeof toDatabaseEvidenceInputKind>;
  readonly cacheIdentity: ExactAnalysisCacheIdentity;
}

export async function prepareMenuImagesAnalysis(
  request: MenuImagesAnalyzeRequest,
  dependencies: MenuAnalysisPreparationDependencies,
  signal: AbortSignal | null = null,
): Promise<PreparedMenuImagesAnalysis> {
  if (signal?.aborted) throw new AnalysisAbortedError();
  if (request.images.length === 0) {
    throw new MenuAnalysisError(
      "INVALID_MENU_IMAGE_INPUT",
      "Menu analysis requires at least one image.",
    );
  }
  if (request.images.length > MAX_MENU_IMAGE_COUNT) {
    throw new MenuAnalysisError(
      "TOO_MANY_MENU_IMAGES",
      `Menu analysis accepts no more than ${MAX_MENU_IMAGE_COUNT} images.`,
    );
  }

  const modelVersion = resolveMenuAnalysisModel(
    dependencies.environment.OPENAI_MODEL,
  );
  const versions = createMenuAnalysisVersionMetadata(modelVersion);
  const images: MenuVisionImageInput[] = [];
  let actualTotalBytes = 0;

  for (const [index, image] of request.images.entries()) {
    if (signal?.aborted) throw new AnalysisAbortedError();
    if (!image.mediaType || !isSupportedMenuImageType(image.mediaType)) {
      throw new MenuAnalysisError(
        "INVALID_MENU_IMAGE_INPUT",
        "Menu analyzer received an unsupported transient image type.",
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = await image.read();
    } catch {
      if (signal?.aborted) throw new AnalysisAbortedError();
      throw new MenuAnalysisError(
        "INVALID_MENU_IMAGE_INPUT",
        "A transient menu image could not be read.",
      );
    }
    if (signal?.aborted) throw new AnalysisAbortedError();
    if (bytes.byteLength === 0) {
      throw new MenuAnalysisError(
        "INVALID_MENU_IMAGE_INPUT",
        "Menu analyzer received an empty transient image.",
      );
    }
    if (image.byteLength !== null && image.byteLength !== bytes.byteLength) {
      throw new MenuAnalysisError(
        "INVALID_MENU_IMAGE_INPUT",
        "Transient image metadata does not match the actual bytes.",
      );
    }

    actualTotalBytes += bytes.byteLength;
    if (actualTotalBytes > SERVER_MENU_IMAGE_MAX_BYTES) {
      throw new MenuAnalysisError(
        "MENU_IMAGE_BYTES_EXCEEDED",
        "Transient menu image bytes exceed the server analysis limit.",
      );
    }
    images.push({ index, mediaType: image.mediaType, bytes });
  }

  let sourceFingerprint: string;
  try {
    const imageHashes = await Promise.all(
      images.map((image) =>
        (dependencies.createImageHash ?? createImageContentHash)(image.bytes),
      ),
    );
    sourceFingerprint = await (
      dependencies.createSourceIdentity ?? createSourceFingerprint
    )({
      sourceType: APPLICATION_MENU_IMAGE_INPUT_KIND,
      sourceIdentifier: null,
      imageCount: images.length,
      orderedImageContentHashes: imageHashes,
      restaurantIdentifier: request.userEnteredRestaurantName,
      branchIdentifier: null,
      sourceRevision: null,
    });
  } catch {
    throw new MenuAnalysisError(
      "CANONICAL_ADAPTER_FAILED",
      "The menu source identity could not be created safely.",
      true,
    );
  }

  if (signal?.aborted) throw new AnalysisAbortedError();
  const analysisContract = createAnalysisCacheContractIdentity(versions);

  return {
    images,
    imageCount: images.length,
    modelVersion,
    versions,
    normalizedRestaurantIdentifier: normalizeSourceFingerprintIdentifier(
      request.userEnteredRestaurantName,
    ),
    databaseInputKind: toDatabaseEvidenceInputKind(
      APPLICATION_MENU_IMAGE_INPUT_KIND,
    ),
    cacheIdentity: {
      sourceFingerprint,
      sourceFingerprintVersion: SOURCE_FINGERPRINT_VERSION,
      analysisContract,
    },
  };
}
