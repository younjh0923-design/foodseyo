import {
  MenuImagePreprocessingError,
  validateMenuImageSelection,
} from "./menu-image-preprocessing.ts";

export interface PendingImageIntake {
  readonly files: readonly File[];
  readonly staged: true;
}

export type ImageSelectionResult =
  | { readonly kind: "cancelled" }
  | { readonly kind: "invalid"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly files: readonly File[];
    };

export type MenuScanAppendResult =
  | { readonly kind: "cancelled" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "ready"; readonly files: readonly File[] };

export const SAFE_IMAGE_SELECTION_ERROR_MESSAGE =
  "The selected images could not be added.";

export function prepareImageIntakeSelection(
  files: readonly File[],
): ImageSelectionResult {
  if (files.length === 0) return { kind: "cancelled" };

  try {
    validateMenuImageSelection(files);
    return { kind: "ready", files: [...files] };
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
): PendingImageIntake {
  if (files.length === 0) {
    throw new Error(SAFE_IMAGE_SELECTION_ERROR_MESSAGE);
  }
  return { files: [...files], staged: true };
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
