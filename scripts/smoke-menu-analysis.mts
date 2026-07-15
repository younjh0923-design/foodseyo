import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const apiKeyAvailable = Boolean(process.env.OPENAI_API_KEY?.trim());
const smokeImagePath = process.env.MENU_ANALYSIS_SMOKE_IMAGE?.trim();

if (!apiKeyAvailable) {
  console.log("Menu analysis smoke: not run — API key unavailable");
  process.exit(0);
}
if (!smokeImagePath) {
  console.log("Menu analysis smoke: not run — rights-cleared image path unavailable");
  process.exit(0);
}

const absolutePath = resolve(smokeImagePath);
const metadata = await stat(absolutePath);
if (!metadata.isFile() || metadata.size <= 0 || metadata.size > 4_000_000) {
  throw new Error("Smoke image must be a non-empty JPEG, PNG, or WEBP file under 4,000,000 bytes.");
}

const bytes = new Uint8Array(await readFile(absolutePath));
const { detectMenuImageMediaType } = await import(
  "../src/services/menu-analysis/menu-upload-validation.ts"
);
const mediaType = detectMenuImageMediaType(bytes);
if (!mediaType) throw new Error("Smoke image must contain valid JPEG, PNG, or WEBP bytes.");

const [{ analyzeFoodseyoInput, createAnalyzerRegistry }, { createMenuImagesAnalyzer }, { createOpenAIMenuVisionProvider }] =
  await Promise.all([
    import("../src/services/analysis/index.ts"),
    import("../src/services/menu-analysis/menu-images-analyzer.ts"),
    import("../src/services/menu-analysis/openai-menu-vision-provider.ts"),
  ]);

const analysis = await analyzeFoodseyoInput(
  {
    type: "menu_images",
    images: [
      {
        id: "smoke-menu-image-1",
        fileName: null,
        mediaType,
        byteLength: bytes.byteLength,
        async read() {
          return bytes.slice();
        },
      },
    ],
    userEnteredRestaurantName: null,
    location: null,
  },
  {
    analyzerRegistry: createAnalyzerRegistry({
      menu_images: createMenuImagesAnalyzer({
        provider: createOpenAIMenuVisionProvider(),
      }),
    }),
  },
);

console.log(
  `Menu analysis smoke: ${analysis.status}; ${analysis.payload.menu?.dishes.length ?? 0} dishes`,
);
