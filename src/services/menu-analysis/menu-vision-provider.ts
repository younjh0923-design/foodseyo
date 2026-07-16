import type { MenuImageModelOutput } from "./menu-image-model-schema.ts";

export interface MenuVisionImageInput {
  readonly index: number;
  readonly mediaType: "image/jpeg" | "image/png" | "image/webp";
  readonly bytes: Uint8Array;
}

export interface MenuVisionProviderInput {
  readonly images: readonly MenuVisionImageInput[];
  readonly userEnteredRestaurantName: string | null;
  readonly signal: AbortSignal | null;
}

export interface MenuVisionProvider {
  readonly modelVersion: string;
  analyzeMenuImages(input: MenuVisionProviderInput): Promise<MenuImageModelOutput>;
}
