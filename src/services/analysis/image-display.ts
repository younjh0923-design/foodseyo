import type { DishImage } from "../../domain/foodseyo-analysis.ts";

export function isDishImageReusableForDisplay(image: DishImage): boolean {
  if (image.sourceType === "unavailable") return false;
  if (image.rightsStatus !== "cleared") return false;

  return image.localAssetPath !== null || image.url !== null;
}

export function getReusableDishImageSource(image: DishImage): string | null {
  if (!isDishImageReusableForDisplay(image)) return null;
  return image.localAssetPath ?? image.url;
}
