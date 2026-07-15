export const MAX_MENU_IMAGE_COUNT = 10;
export const CLIENT_MENU_IMAGE_TARGET_BYTES = 3_800_000;
export const SERVER_MENU_IMAGE_MAX_BYTES = 4_000_000;
export const SERVER_SINGLE_IMAGE_MAX_BYTES = 4_000_000;

export const SUPPORTED_MENU_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedMenuImageType = (typeof SUPPORTED_MENU_IMAGE_TYPES)[number];

export function isSupportedMenuImageType(value: string): value is SupportedMenuImageType {
  return (SUPPORTED_MENU_IMAGE_TYPES as readonly string[]).includes(value);
}
