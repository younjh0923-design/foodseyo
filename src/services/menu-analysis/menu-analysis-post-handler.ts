import { analyzeFoodseyoInput, createAnalyzerRegistry } from "../analysis/index.ts";
import { mapMenuAnalysisError } from "./menu-analysis-api-errors.ts";
import { createMenuImagesAnalyzer } from "./menu-images-analyzer.ts";
import type { MenuVisionProvider } from "./menu-vision-provider.ts";
import {
  MenuUploadValidationError,
  toTransientImageInputs,
  validateRestaurantName,
  validateUploadedMenuImages,
} from "./menu-upload-validation.ts";

export const MENU_ANALYSIS_NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export interface MenuAnalysisPostHandlerDependencies {
  createProvider(): MenuVisionProvider;
}

export function createMenuAnalysisPostHandler(
  dependencies: MenuAnalysisPostHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("multipart/form-data")) {
        throw new MenuUploadValidationError(
          "INVALID_MULTIPART_REQUEST",
          "Submit menu images as multipart form data.",
          400,
        );
      }

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        throw new MenuUploadValidationError(
          "INVALID_MULTIPART_REQUEST",
          "The uploaded form data could not be read.",
          400,
        );
      }

      const imageEntries = formData.getAll("images");
      if (imageEntries.some((entry) => typeof entry === "string")) {
        throw new MenuUploadValidationError(
          "INVALID_MULTIPART_REQUEST",
          "Every images field must contain an image file.",
          400,
        );
      }

      const validatedImages = await validateUploadedMenuImages(imageEntries as File[]);
      const restaurantName = validateRestaurantName(formData.get("restaurantName"));
      const provider = dependencies.createProvider();
      const registry = createAnalyzerRegistry({
        menu_images: createMenuImagesAnalyzer({ provider }),
      });
      const analysis = await analyzeFoodseyoInput(
        {
          type: "menu_images",
          images: toTransientImageInputs(validatedImages),
          userEnteredRestaurantName: restaurantName,
          location: null,
        },
        {
          signal: request.signal,
          analyzerRegistry: registry,
        },
      );

      return Response.json(
        { ok: true, analysis },
        { status: 200, headers: MENU_ANALYSIS_NO_STORE_HEADERS },
      );
    } catch (error) {
      const safe = mapMenuAnalysisError(error);
      return Response.json(safe.body, {
        status: safe.status,
        headers: MENU_ANALYSIS_NO_STORE_HEADERS,
      });
    }
  };
}
