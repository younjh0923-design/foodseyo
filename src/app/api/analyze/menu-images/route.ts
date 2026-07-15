import { NextResponse } from "next/server";
import { analyzeFoodseyoInput, createAnalyzerRegistry } from "@/services/analysis";
import { mapMenuAnalysisError } from "@/services/menu-analysis/menu-analysis-api-errors";
import { createMenuImagesAnalyzer } from "@/services/menu-analysis/menu-images-analyzer";
import { createOpenAIMenuVisionProvider } from "@/services/menu-analysis/openai-menu-vision-provider";
import {
  MenuUploadValidationError,
  toTransientImageInputs,
  validateRestaurantName,
  validateUploadedMenuImages,
} from "@/services/menu-analysis/menu-upload-validation";

export const runtime = "nodejs";
export const maxDuration = 90;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
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
    const provider = createOpenAIMenuVisionProvider();
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

    return NextResponse.json(
      { ok: true, analysis },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const safe = mapMenuAnalysisError(error);
    return NextResponse.json(safe.body, {
      status: safe.status,
      headers: NO_STORE_HEADERS,
    });
  }
}
