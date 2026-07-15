import {
  MenuImagePreprocessingError,
  validateMenuImageSelection,
} from "./menu-image-preprocessing.ts";

export type ImageIntakeSource = "camera" | "gallery";

export interface PendingImageIntake {
  readonly files: readonly File[];
  readonly source: ImageIntakeSource;
  readonly staged: true;
}

export type ImageSelectionResult =
  | { readonly kind: "cancelled" }
  | { readonly kind: "invalid"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly files: readonly File[];
      readonly source: ImageIntakeSource;
    };

export type MenuScanAppendResult =
  | { readonly kind: "cancelled" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "ready"; readonly files: readonly File[] };

export const SAFE_IMAGE_SELECTION_ERROR_MESSAGE =
  "The selected images could not be added.";

export function prepareImageIntakeSelection(
  files: readonly File[],
  source: ImageIntakeSource,
): ImageSelectionResult {
  if (files.length === 0) return { kind: "cancelled" };
  if (source === "camera" && files.length !== 1) {
    return {
      kind: "invalid",
      message: "Take one photo at a time.",
    };
  }

  try {
    validateMenuImageSelection(files);
    return { kind: "ready", files: [...files], source };
  } catch (error) {
    return {
      kind: "invalid",
      message:
        error instanceof MenuImagePreprocessingError
          ? error.message
          : SAFE_IMAGE_SELECTION_ERROR_MESSAGE,
    };
  }
}

export function stagePendingImageIntake(
  files: readonly File[],
  source: ImageIntakeSource,
): PendingImageIntake {
  if (files.length === 0 || (source === "camera" && files.length !== 1)) {
    throw new Error(SAFE_IMAGE_SELECTION_ERROR_MESSAGE);
  }
  return { files: [...files], source, staged: true };
}

export function consumePendingImageIntake(
  pending: PendingImageIntake | null,
): { readonly consumed: PendingImageIntake | null; readonly pending: null } {
  return { consumed: pending, pending: null };
}

export function prepareMenuScanAppend(
  existingFiles: readonly File[],
  incomingFiles: readonly File[],
): MenuScanAppendResult {
  if (incomingFiles.length === 0) return { kind: "cancelled" };

  try {
    validateMenuImageSelection([...existingFiles, ...incomingFiles]);
    return { kind: "ready", files: [...incomingFiles] };
  } catch (error) {
    return {
      kind: "invalid",
      message:
        error instanceof MenuImagePreprocessingError
          ? error.message
          : SAFE_IMAGE_SELECTION_ERROR_MESSAGE,
    };
  }
}
