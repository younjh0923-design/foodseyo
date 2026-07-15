import {
  CLIENT_MENU_IMAGE_TARGET_BYTES,
  MAX_MENU_IMAGE_COUNT,
  SUPPORTED_MENU_IMAGE_TYPES,
} from "../services/menu-analysis/menu-upload-validation.ts";

const MIN_READABLE_LONG_EDGE = 1_400;
const MIN_READABLE_JPEG_QUALITY = 0.68;
const JPEG_OUTPUT_TYPE = "image/jpeg";

export interface AdaptiveMenuImageProfile {
  maxLongEdge: number;
  initialQuality: number;
  minLongEdge: number;
  minQuality: number;
}

export type MenuImagePreprocessingErrorCode =
  | "NO_IMAGES"
  | "TOO_MANY_IMAGES"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "EMPTY_IMAGE"
  | "IMAGE_DECODE_FAILED"
  | "SIZE_READABILITY_LIMIT";

export class MenuImagePreprocessingError extends Error {
  readonly code: MenuImagePreprocessingErrorCode;

  constructor(code: MenuImagePreprocessingErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "MenuImagePreprocessingError";
  }
}

export function getAdaptiveMenuImageProfile(imageCount: number): AdaptiveMenuImageProfile {
  if (!Number.isInteger(imageCount) || imageCount < 1 || imageCount > MAX_MENU_IMAGE_COUNT) {
    throw new MenuImagePreprocessingError(
      imageCount > MAX_MENU_IMAGE_COUNT ? "TOO_MANY_IMAGES" : "NO_IMAGES",
      `Choose between 1 and ${MAX_MENU_IMAGE_COUNT} menu images.`,
    );
  }

  const countAdjusted =
    imageCount <= 2
      ? { maxLongEdge: 2_600, initialQuality: 0.9 }
      : imageCount <= 4
        ? { maxLongEdge: 2_300, initialQuality: 0.86 }
        : imageCount <= 6
          ? { maxLongEdge: 2_100, initialQuality: 0.82 }
          : imageCount <= 8
            ? { maxLongEdge: 1_900, initialQuality: 0.78 }
            : { maxLongEdge: 1_750, initialQuality: 0.74 };

  return {
    ...countAdjusted,
    minLongEdge: MIN_READABLE_LONG_EDGE,
    minQuality: MIN_READABLE_JPEG_QUALITY,
  };
}

export function validateMenuImageSelection(files: readonly File[]): void {
  if (files.length === 0) {
    throw new MenuImagePreprocessingError("NO_IMAGES", "Choose at least one menu image.");
  }
  if (files.length > MAX_MENU_IMAGE_COUNT) {
    throw new MenuImagePreprocessingError(
      "TOO_MANY_IMAGES",
      `Choose no more than ${MAX_MENU_IMAGE_COUNT} menu images.`,
    );
  }

  for (const file of files) {
    if (!(SUPPORTED_MENU_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      throw new MenuImagePreprocessingError(
        "UNSUPPORTED_IMAGE_TYPE",
        "Use JPEG, PNG, or WEBP menu images.",
      );
    }
    if (file.size <= 0) {
      throw new MenuImagePreprocessingError("EMPTY_IMAGE", "A selected menu image is empty.");
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else {
          reject(
            new MenuImagePreprocessingError(
              "IMAGE_DECODE_FAILED",
              "A menu image could not be prepared.",
            ),
          );
        }
      },
      JPEG_OUTPUT_TYPE,
      quality,
    );
  });
}

function scaledDimensions(
  width: number,
  height: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function preprocessOneMenuImage(
  file: File,
  profile: AdaptiveMenuImageProfile,
  byteBudget: number,
  outputIndex: number,
  forceReadabilityFloor = false,
): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new MenuImagePreprocessingError(
      "IMAGE_DECODE_FAILED",
      `Menu page ${outputIndex + 1} could not be read. Choose a different JPEG, PNG, or WEBP image.`,
    );
  }

  try {
    const originalLongEdge = Math.max(bitmap.width, bitmap.height);
    const readableFloor = Math.min(profile.minLongEdge, originalLongEdge);
    let longEdge = forceReadabilityFloor
      ? readableFloor
      : Math.min(profile.maxLongEdge, originalLongEdge);
    let quality = forceReadabilityFloor ? profile.minQuality : profile.initialQuality;

    while (true) {
      const dimensions = scaledDimensions(bitmap.width, bitmap.height, longEdge);
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new MenuImagePreprocessingError(
          "IMAGE_DECODE_FAILED",
          "This browser could not prepare the selected menu images.",
        );
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, dimensions.width, dimensions.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= byteBudget) {
        return new File([blob], `menu-page-${outputIndex + 1}.jpg`, {
          type: JPEG_OUTPUT_TYPE,
          lastModified: Date.now(),
        });
      }

      if (quality > profile.minQuality) {
        quality = Math.max(profile.minQuality, Number((quality - 0.04).toFixed(2)));
        continue;
      }

      if (longEdge > readableFloor) {
        longEdge = Math.max(readableFloor, Math.floor(longEdge * 0.9));
        quality = Math.max(profile.minQuality, profile.initialQuality - 0.08);
        continue;
      }

      throw new MenuImagePreprocessingError(
        "SIZE_READABILITY_LIMIT",
        `Menu page ${outputIndex + 1} cannot fit within the upload limit without making menu text difficult to read. Remove a page, crop unused areas, or take clearer close-up photos.`,
      );
    }
  } finally {
    bitmap.close();
  }
}

export async function preprocessMenuImages(files: readonly File[]): Promise<File[]> {
  validateMenuImageSelection(files);
  const profile = getAdaptiveMenuImageProfile(files.length);
  const readabilityFloorFiles: File[] = [];
  for (const [index, file] of files.entries()) {
    readabilityFloorFiles.push(
      await preprocessOneMenuImage(
        file,
        profile,
        Number.MAX_SAFE_INTEGER,
        index,
        true,
      ),
    );
  }

  const readabilityFloorBytes = readabilityFloorFiles.reduce(
    (total, file) => total + file.size,
    0,
  );
  if (readabilityFloorBytes > CLIENT_MENU_IMAGE_TARGET_BYTES) {
    throw new MenuImagePreprocessingError(
      "SIZE_READABILITY_LIMIT",
      "These menu pages cannot fit within the upload limit while keeping the text readable. Remove a page, crop unused areas, or take clearer close-up photos.",
    );
  }

  const extraCapacity = CLIENT_MENU_IMAGE_TARGET_BYTES - readabilityFloorBytes;
  const totalSourceWeight = files.reduce((total, file) => total + Math.max(file.size, 1), 0);
  const processed: File[] = [];
  let allocatedExtra = 0;

  for (const [index, file] of files.entries()) {
    const isLast = index === files.length - 1;
    const extraForImage = isLast
      ? extraCapacity - allocatedExtra
      : Math.floor((extraCapacity * Math.max(file.size, 1)) / totalSourceWeight);
    allocatedExtra += extraForImage;
    const byteBudget = readabilityFloorFiles[index].size + extraForImage;
    const prepared = await preprocessOneMenuImage(file, profile, byteBudget, index);
    processed.push(prepared);
  }

  return processed;
}
