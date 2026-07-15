import type { TransientImageInput } from "../analysis/analysis-types.ts";
import type { MenuAnalysisApiErrorCode } from "./menu-analysis-api.ts";
import {
  MAX_MENU_IMAGE_COUNT,
  SERVER_MENU_IMAGE_MAX_BYTES,
  SERVER_SINGLE_IMAGE_MAX_BYTES,
  isSupportedMenuImageType,
  type SupportedMenuImageType,
} from "./menu-image-limits.ts";

export {
  CLIENT_MENU_IMAGE_TARGET_BYTES,
  MAX_MENU_IMAGE_COUNT,
  SERVER_MENU_IMAGE_MAX_BYTES,
  SERVER_SINGLE_IMAGE_MAX_BYTES,
  SUPPORTED_MENU_IMAGE_TYPES,
  isSupportedMenuImageType,
  type SupportedMenuImageType,
} from "./menu-image-limits.ts";
export const MAX_RESTAURANT_NAME_LENGTH = 120;

export interface UploadFileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ValidatedUploadedMenuImage {
  readonly index: number;
  readonly mediaType: SupportedMenuImageType;
  readonly bytes: Uint8Array;
}

export class MenuUploadValidationError extends Error {
  readonly code: MenuAnalysisApiErrorCode;
  readonly status: number;

  constructor(code: MenuAnalysisApiErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "MenuUploadValidationError";
  }
}

export function detectMenuImageMediaType(bytes: Uint8Array): SupportedMenuImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function validateRestaurantName(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new MenuUploadValidationError(
      "INVALID_RESTAURANT_NAME",
      "Restaurant name must be text.",
      400,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_RESTAURANT_NAME_LENGTH) {
    throw new MenuUploadValidationError(
      "INVALID_RESTAURANT_NAME",
      "Restaurant name is too long.",
      400,
    );
  }
  return trimmed;
}

export async function validateUploadedMenuImages(
  files: readonly UploadFileLike[],
): Promise<ValidatedUploadedMenuImage[]> {
  if (files.length === 0) {
    throw new MenuUploadValidationError("NO_IMAGES", "Choose at least one menu image.", 400);
  }
  if (files.length > MAX_MENU_IMAGE_COUNT) {
    throw new MenuUploadValidationError(
      "TOO_MANY_IMAGES",
      `Choose no more than ${MAX_MENU_IMAGE_COUNT} menu images.`,
      400,
    );
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!isSupportedMenuImageType(file.type)) {
      throw new MenuUploadValidationError(
        "UNSUPPORTED_IMAGE_TYPE",
        "Use JPEG, PNG, or WEBP menu images.",
        415,
      );
    }
    if (file.size <= 0) {
      throw new MenuUploadValidationError("EMPTY_IMAGE", "A menu image is empty.", 400);
    }
    if (file.size > SERVER_SINGLE_IMAGE_MAX_BYTES) {
      throw new MenuUploadValidationError(
        "IMAGE_TOO_LARGE",
        "A menu image is too large to analyze.",
        413,
      );
    }
    totalBytes += file.size;
  }

  if (totalBytes > SERVER_MENU_IMAGE_MAX_BYTES) {
    throw new MenuUploadValidationError(
      "TOTAL_UPLOAD_TOO_LARGE",
      "These menu images are too large to analyze together.",
      413,
    );
  }

  const validated: ValidatedUploadedMenuImage[] = [];
  for (const [index, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new MenuUploadValidationError("EMPTY_IMAGE", "A menu image is empty.", 400);
    }
    const detectedType = detectMenuImageMediaType(bytes);
    if (detectedType === null || detectedType !== file.type) {
      throw new MenuUploadValidationError(
        "IMAGE_CONTENT_TYPE_MISMATCH",
        "A menu image does not match its declared file type.",
        415,
      );
    }
    validated.push({ index, mediaType: detectedType, bytes });
  }
  return validated;
}

export function toTransientImageInputs(
  images: readonly ValidatedUploadedMenuImage[],
): TransientImageInput[] {
  return images.map((image) => ({
    id: `menu-image-${image.index + 1}`,
    fileName: null,
    mediaType: image.mediaType,
    byteLength: image.bytes.byteLength,
    async read() {
      return image.bytes.slice();
    },
  }));
}
