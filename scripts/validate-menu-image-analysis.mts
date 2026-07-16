import {
  ALLERGY_SAFETY_NOTICE,
  FoodseyoAnalysisSchema,
  type FoodseyoAnalysis,
} from "../src/domain/foodseyo-analysis.ts";
import {
  AnalysisAbortedError,
  AnalysisCapabilityUnavailableError,
  analyzeFoodseyoInput,
  createAnalyzerRegistry,
  type AnalyzeFoodseyoRequest,
  type TransientImageInput,
} from "../src/services/analysis/index.ts";
import {
  CLIENT_MENU_IMAGE_TARGET_BYTES,
  MAX_MENU_IMAGE_COUNT,
  SERVER_MENU_IMAGE_MAX_BYTES,
  MenuUploadValidationError,
  detectMenuImageMediaType,
  validateRestaurantName,
  validateUploadedMenuImages,
  type UploadFileLike,
} from "../src/services/menu-analysis/menu-upload-validation.ts";
import { mapMenuAnalysisError } from "../src/services/menu-analysis/menu-analysis-api-errors.ts";
import { adaptMenuImageModelOutput } from "../src/services/menu-analysis/menu-image-adapter.ts";
import { createMenuAnalysisVersionMetadata } from "../src/services/menu-analysis/menu-analysis-versions.ts";
import { MenuAnalysisError } from "../src/services/menu-analysis/menu-analysis-errors.ts";
import { MenuImageModelOutputSchema } from "../src/services/menu-analysis/menu-image-model-schema.ts";
import type { MenuImageModelOutput } from "../src/services/menu-analysis/menu-image-model-schema.ts";
import { createMenuImagesAnalyzer } from "../src/services/menu-analysis/menu-images-analyzer.ts";
import {
  ALLOWED_MENU_ANALYSIS_MODELS,
  buildOpenAIMenuResponseRequest,
} from "../src/services/menu-analysis/openai-menu-request.ts";
import { resolveMenuAnalysisModel } from "../src/services/menu-analysis/menu-analysis-config.ts";
import type {
  MenuVisionProvider,
  MenuVisionProviderInput,
} from "../src/services/menu-analysis/menu-vision-provider.ts";
import {
  getAdaptiveMenuImageProfile,
  validateMenuImageSelection,
} from "../src/lib/menu-image-preprocessing.ts";
import {
  parseStoredCurrentAnalysis,
  serializeCurrentAnalysis,
} from "../src/lib/storage.ts";
import {
  captureError,
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo menu image analysis validation",
  "Menu image analysis validation failed",
);
const syntheticSourceFingerprint = `source_${"a".repeat(64)}`;
const syntheticVersions = createMenuAnalysisVersionMetadata(
  "synthetic-menu-model-v1",
);
const adaptFixture = (
  input: Omit<
    Parameters<typeof adaptMenuImageModelOutput>[0],
    "sourceFingerprint" | "versions"
  >,
) =>
  adaptMenuImageModelOutput({
    ...input,
    sourceFingerprint: syntheticSourceFingerprint,
    versions: syntheticVersions,
  });
const networkGuard = installNetworkGuard(
  "Network calls are forbidden in automatic menu-analysis tests.",
);

const clone = <T>(value: T): T => structuredClone(value);

const validModelFixture: MenuImageModelOutput = {
  analysisQuality: "good",
  menuTitle: "Dinner Menu",
  currency: null,
  restaurantSignals: [
    { kind: "name", value: "North Star Kitchen", sourceImageIndex: 0 },
    { kind: "address", value: "1 Test Street", sourceImageIndex: 1 },
    { kind: "phone", value: "+1 555 0100", sourceImageIndex: 1 },
    { kind: "website", value: "https://example.com/menu", sourceImageIndex: 1 },
  ],
  categories: [
    {
      label: "Curries",
      sourceImageIndexes: [0],
      dishes: [
        {
          name: "Khao Soi",
          originalName: null,
          pronunciation: null,
          menuDescription: "Coconut curry noodles",
          rawPriceText: "$18",
          price: { amount: 18, currency: null, displayText: "$18" },
          priceOptions: [
            {
              label: "Small",
              price: { amount: 12, currency: "USD", displayText: "$12" },
              sourceImageIndexes: [0],
            },
          ],
          options: [
            {
              label: "Add chicken",
              additionalPrice: { amount: 2, currency: "USD", displayText: "+$2" },
              sourceImageIndexes: [0],
            },
          ],
          visibleSpiceLabel: "Medium",
          visibleDietaryLabels: ["GF"],
          explicitDietaryClaims: [
            {
              key: "peanuts",
              claimType: "contains",
              exactVisibleText: "Contains peanuts",
              sourceImageIndexes: [0],
            },
            {
              key: "gluten",
              claimType: "free_from",
              exactVisibleText: "Gluten free",
              sourceImageIndexes: [0],
            },
            {
              key: "vegetarian",
              claimType: "label_present",
              exactVisibleText: "Vegetarian option",
              sourceImageIndexes: [0],
            },
          ],
          generalKnowledge: {
            definition: "A northern Thai curry noodle dish.",
            regionalBackground: "Northern Thailand",
            typicalTaste: ["savory", "rich"],
            typicalTexture: ["crisp", "soft"],
            typicalSpice: "moderate",
            typicalPreparation: "Noodles served in curry broth.",
            commonIngredients: ["noodles", "coconut milk"],
            similarDishes: ["curry laksa"],
            orderingConsiderations: ["Ask about spice level"],
          },
          consistency: {
            basicTastes: [
              { value: "savory", intensity: 3 },
              { value: "sweet", intensity: 1 },
            ],
            flavorNotes: [],
            heatLevel: "medium",
            richnessLevel: "rich",
            textures: ["crispy", "soft"],
            ingredients: [
              { name: "noodles", basis: "stated" },
              { name: "coconut milk", basis: "typical" },
            ],
          },
          sourceImageIndexes: [0],
          uncertaintyNotes: [],
        },
        {
          name: "Khao Soi",
          originalName: null,
          pronunciation: null,
          menuDescription: null,
          rawPriceText: null,
          price: null,
          priceOptions: [],
          options: [],
          visibleSpiceLabel: null,
          visibleDietaryLabels: [],
          explicitDietaryClaims: [],
          generalKnowledge: {
            definition: null,
            regionalBackground: null,
            typicalTaste: [],
            typicalTexture: [],
            typicalSpice: null,
            typicalPreparation: null,
            commonIngredients: [],
            similarDishes: [],
            orderingConsiderations: [],
          },
          consistency: {
            basicTastes: [],
            flavorNotes: [],
            heatLevel: "unknown",
            richnessLevel: "unknown",
            textures: [],
            ingredients: [],
          },
          sourceImageIndexes: [1],
          uncertaintyNotes: ["Price was not readable"],
        },
      ],
    },
  ],
  warnings: ["Bottom edge of page 2 is cropped"],
};

class FakeMenuVisionProvider implements MenuVisionProvider {
  readonly modelVersion = "synthetic-menu-model-v1";
  readonly calls: MenuVisionProviderInput[] = [];
  output: MenuImageModelOutput;

  constructor(output: MenuImageModelOutput = validModelFixture) {
    this.output = clone(output);
  }

  async analyzeMenuImages(input: MenuVisionProviderInput): Promise<MenuImageModelOutput> {
    this.calls.push(input);
    return clone(this.output);
  }
}

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1]);
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

const transientImage = (
  id: string,
  bytes: Uint8Array,
  mediaType = "image/jpeg",
): TransientImageInput => ({
  id,
  fileName: `private-${id}.jpg`,
  mediaType,
  byteLength: bytes.byteLength,
  async read() {
    return bytes.slice();
  },
});

const requestFor = (imageCount = 2): Extract<AnalyzeFoodseyoRequest, { type: "menu_images" }> => ({
  type: "menu_images",
  images: Array.from({ length: imageCount }, (_, index) =>
    transientImage(`page-${index + 1}`, jpegBytes),
  ),
  userEnteredRestaurantName: null,
  location: null,
});

const analyzeWithProvider = async (
  provider: MenuVisionProvider,
  request = requestFor(),
): Promise<FoodseyoAnalysis> =>
  analyzeFoodseyoInput(request, {
    analyzerRegistry: createAnalyzerRegistry({
      menu_images: createMenuImagesAnalyzer({ provider }),
    }),
    now: () => new Date("2026-07-15T12:00:00.000Z"),
    createAnalysisId: () => "menu-analysis-test-id",
  });

const makeUpload = (
  type: string,
  bytes: Uint8Array,
  size = bytes.byteLength,
): UploadFileLike => ({
  name: "test-menu.jpg",
  type,
  size,
  async arrayBuffer() {
    return bytes.slice().buffer;
  },
});

const provider = new FakeMenuVisionProvider();
const result = await analyzeWithProvider(provider);
const menu = result.payload.menu;
if (!menu) throw new Error("The valid menu fixture must produce a menu.");
const firstDish = menu.dishes[0];
const secondDish = menu.dishes[1];

// A. Request and analyzer architecture (1-5)
verify(provider.calls.length === 1 && menu.dishes.length === 2, "1 fake provider handles menu_images");
const defaultError = await captureError(() => analyzeFoodseyoInput(requestFor()));
verify(defaultError instanceof AnalysisCapabilityUnavailableError, "2 default registry has no demo fallback");
const injectedRegistry = createAnalyzerRegistry({
  menu_images: createMenuImagesAnalyzer({ provider: new FakeMenuVisionProvider() }),
});
verify(injectedRegistry.menu_images.inputType === "menu_images", "3 live analyzer injection is menu-only");
const unavailableTypes: AnalyzeFoodseyoRequest[] = [
  { type: "restaurant_photo", image: transientImage("photo", jpegBytes), userEnteredRestaurantName: null, location: null },
  { type: "restaurant_screen", image: transientImage("screen", jpegBytes), sourcePlatformLabel: null, userEnteredRestaurantName: null, location: null },
  { type: "restaurant_link", submittedUrl: "https://example.com", userEnteredRestaurantName: null },
  { type: "nearby_search", location: { latitude: 1, longitude: 2, label: null }, selectedCandidateId: null, selectedByUser: false },
];
const unavailableErrors = await Promise.all(
  unavailableTypes.map((request) => captureError(() => analyzeFoodseyoInput(request))),
);
verify(unavailableErrors.every((error) => error instanceof AnalysisCapabilityUnavailableError), "4 other analyzers remain unavailable");
const abortedController = new AbortController();
abortedController.abort();
const abortedError = await captureError(() =>
  analyzeFoodseyoInput(requestFor(), {
    signal: abortedController.signal,
    analyzerRegistry: injectedRegistry,
  }),
);
verify(abortedError instanceof AnalysisAbortedError, "5 AbortSignal is honored");

// B. Model output schema (6-12)
verify(MenuImageModelOutputSchema.safeParse(validModelFixture).success, "6 valid model fixture parses");
verify(!MenuImageModelOutputSchema.safeParse({ ...validModelFixture, analysisQuality: "excellent" }).success, "7 invalid enum is rejected");
const missingNullable = clone(validModelFixture) as Record<string, unknown>;
delete missingNullable.menuTitle;
verify(!MenuImageModelOutputSchema.safeParse(missingNullable).success, "8 missing required nullable field is rejected");
verify(!MenuImageModelOutputSchema.safeParse({ ...validModelFixture, appStatus: "complete" }).success, "9 unexpected property is rejected");
const invalidIndex = clone(validModelFixture);
invalidIndex.categories[0].dishes[0].sourceImageIndexes = [2];
const invalidIndexError = await captureError(async () => adaptFixture({ modelOutput: invalidIndex, imageCount: 2, userEnteredRestaurantName: null }));
verify(invalidIndexError instanceof MenuAnalysisError && invalidIndexError.code === "INVALID_SOURCE_IMAGE_INDEX", "10 invalid source index is rejected");
const unreadable = clone(validModelFixture);
unreadable.analysisQuality = "unreadable";
const unreadableError = await captureError(async () => adaptFixture({ modelOutput: unreadable, imageCount: 2, userEnteredRestaurantName: null }));
verify(unreadableError instanceof MenuAnalysisError && unreadableError.code === "MENU_NOT_READABLE", "11 unreadable output is typed");
const noDishes = clone(validModelFixture);
noDishes.categories = [];
const noDishesError = await captureError(async () => adaptFixture({ modelOutput: noDishes, imageCount: 2, userEnteredRestaurantName: null }));
verify(noDishesError instanceof MenuAnalysisError && noDishesError.code === "MENU_DISHES_MISSING", "12 zero dishes is typed");

// C. Canonical conversion (13-23)
verify(FoodseyoAnalysisSchema.safeParse(result).success, "13 final canonical envelope parses");
verify(result.inputContext.type === "menu_images" && result.inputContext.imageCount === 2, "14 imageCount is exact");
verify(result.inputContext.storageScope === "session_only", "15 storage scope is session-only");
verify(result.payload.evidence.every((item) => item.sourceType === "uploaded_menu"), "16 uploaded-menu evidence is created");
verify(firstDish.evidenceIds.includes("uploaded-menu-image-1") && secondDish.evidenceIds.includes("uploaded-menu-image-2"), "17 source indexes map to evidence IDs");
verify(menu.categories.every((category) => menu.dishes.some((dish) => dish.categoryId === category.id)), "18 category references are valid");
const allIds = [...menu.categories.map((item) => item.id), ...menu.dishes.map((item) => item.id), ...firstDish.options.map((item) => item.id), ...firstDish.priceOptions.map((item) => item.id)];
verify(new Set(allIds).size === allIds.length, "19 generated IDs are unique");
verify(secondDish.id === `${firstDish.id}-2`, "20 duplicate names receive deterministic suffixes");
verify(menu.featuredDishIds.every((id) => menu.dishes.some((dish) => dish.id === id)), "21 featured IDs only reference dishes");
verify(!("bytes" in result) && !JSON.stringify(result).includes("Uint8Array"), "22 raw file bytes are absent");
verify(typeof JSON.stringify(result) === "string", "23 final result is JSON serializable");

// D. Restaurant resolution (24-29)
const userNamed = await adaptFixture({ modelOutput: validModelFixture, imageCount: 2, userEnteredRestaurantName: "User Pick" });
verify(userNamed.restaurantResolution.status === "confirmed" && userNamed.restaurantResolution.confirmedBy === "explicit_input", "24 user name confirms explicit input");
verify(result.payload.restaurantResolution.status === "confirmed" && result.payload.restaurantResolution.confirmedBy === "direct_evidence", "25 name plus direct signal confirms restaurant");
const nameOnlyModel = clone(validModelFixture);
nameOnlyModel.restaurantSignals = [{ kind: "name", value: "Name Only", sourceImageIndex: 0 }];
const nameOnly = await adaptFixture({ modelOutput: nameOnlyModel, imageCount: 2, userEnteredRestaurantName: null });
verify(nameOnly.restaurantResolution.status === "likely", "26 visible name alone is likely");
const noSignalModel = clone(validModelFixture);
noSignalModel.restaurantSignals = [];
const noSignal = await adaptFixture({ modelOutput: noSignalModel, imageCount: 2, userEnteredRestaurantName: null });
verify(noSignal.restaurantResolution.status === "unconfirmed", "27 no identity signal is unconfirmed");
verify(!JSON.stringify(result.payload.restaurantResolution).includes("confidence"), "28 no numeric confidence is emitted");
verify(result.payload.restaurant?.publicLocation === null && result.inputContext.type === "menu_images" && !result.inputContext.locationUsed, "29 location does not confirm identity");

// E. Prices and options (30-36)
verify(firstDish.price?.amount === 18 && firstDish.price.displayText === "$18", "30 base price maps");
verify(firstDish.price?.currency === null, "31 unknown currency stays unknown");
verify(firstDish.priceOptions[0].price?.amount === 12, "32 price option maps");
verify(firstDish.options[0].additionalPrice?.amount === 2, "33 add-on maps");
verify(secondDish.price === null, "34 unknown price stays null");
verify(firstDish.priceEvidence.basis === "direct_observation" && firstDish.priceEvidence.sourceIds[0] === "uploaded-menu-image-1", "35 price evidence is direct and sourced");
verify(!JSON.stringify(secondDish).includes('"amount":0'), "36 no zero-price fallback is created");

// F. General versus restaurant-specific (37-43)
verify(firstDish.generalKnowledge.definition?.includes("northern Thai") === true, "37 general knowledge is preserved");
verify(!("sourceIds" in firstDish.generalKnowledge), "38 general knowledge has no source IDs");
verify(firstDish.restaurantSpecific.confirmedIngredients.availability === "unknown", "39 restaurant-specific ingredients stay unconfirmed");
verify(firstDish.menuDescription === "Coconut curry noodles" && firstDish.restaurantSpecific.menuDescription === null, "40 visible description stays in visible field");
verify(firstDish.options.some((option) => option.label === "Add chicken") && firstDish.restaurantSpecific.proteinOptions.values.length === 0, "41 protein choice remains an option");
verify(firstDish.reviews.status === "insufficient" && firstDish.reviews.evidenceCount === 0, "42 reviews are not generated");
verify(firstDish.restaurantSpecific.signatureStatus.value === "unknown", "43 signature status is not generated");

// G. Dietary safety (44-49)
verify(firstDish.visibleDietaryLabels.includes("GF") && firstDish.visibleDietaryLabels.includes("Contains peanuts"), "44 visible dietary labels are preserved");
const peanuts = firstDish.dietary.items.find((item) => item.key === "peanuts");
verify(peanuts?.status === "confirmed_present" && peanuts.basis === "direct_observation", "45 explicit contains is confirmed present");
verify(firstDish.dietary.items.find((item) => item.key === "gluten")?.status === "confirm_with_staff", "46 free-from requires staff confirmation");
verify(firstDish.dietary.items.find((item) => item.key === "vegetarian")?.status === "confirm_with_staff", "47 dietary label requires staff confirmation");
verify(!firstDish.dietary.items.some((item) => item.status === "confirmed_absent"), "48 general recipes never confirm absence");
verify(firstDish.dietary.warning === ALLERGY_SAFETY_NOTICE, "49 allergy notice literal is preserved");

// H. Reviews, freshness, and images (50-55)
verify(firstDish.reviews.status === "insufficient", "50 reviews default to insufficient");
verify(menu.freshness.status === "could_not_verify", "51 freshness is not verified");
verify(firstDish.image.sourceType === "unavailable" && firstDish.image.url === null, "52 dish image is unavailable");
verify(firstDish.image.rightsStatus !== "cleared", "53 image rights are not fabricated");
verify(!JSON.stringify(firstDish.image).includes("ai_generated"), "54 no AI-generated dish image is created");
verify(result.status === "complete", "55 optional evidence gaps do not force partial");

// I. Partial and failure (56-60)
verify(result.status === "complete", "56 good useful menu is complete");
const partialModel = clone(validModelFixture);
partialModel.analysisQuality = "partial";
const partialResult = await analyzeWithProvider(new FakeMenuVisionProvider(partialModel));
verify(partialResult.status === "partial", "57 partial useful menu is partial");
const unreadableAnalyzerError = await captureError(() => analyzeWithProvider(new FakeMenuVisionProvider(unreadable)));
verify(unreadableAnalyzerError instanceof MenuAnalysisError && unreadableAnalyzerError.code === "MENU_NOT_READABLE", "58 unreadable analyzer result is a typed error");
const emptyAnalyzerError = await captureError(() => analyzeWithProvider(new FakeMenuVisionProvider(noDishes)));
verify(emptyAnalyzerError instanceof MenuAnalysisError && emptyAnalyzerError.code === "MENU_DISHES_MISSING", "59 no useful dish is a typed error");
verify(unreadableAnalyzerError !== null && !(unreadableAnalyzerError instanceof AnalysisCapabilityUnavailableError), "60 failure never returns demo fallback");

// J. API and route pure helpers (61-72)
const noImagesUploadError = await captureError(() => validateUploadedMenuImages([]));
verify(noImagesUploadError instanceof MenuUploadValidationError && noImagesUploadError.code === "NO_IMAGES", "61 no images is rejected");
const elevenUploads = Array.from({ length: 11 }, () => makeUpload("image/jpeg", jpegBytes));
const tooManyUploadError = await captureError(() => validateUploadedMenuImages(elevenUploads));
verify(tooManyUploadError instanceof MenuUploadValidationError && tooManyUploadError.code === "TOO_MANY_IMAGES", "62 eleven images is rejected");
const unsupportedError = await captureError(() => validateUploadedMenuImages([makeUpload("image/gif", jpegBytes)]));
verify(unsupportedError instanceof MenuUploadValidationError && unsupportedError.code === "UNSUPPORTED_IMAGE_TYPE", "63 unsupported MIME is rejected");
const emptyUploadError = await captureError(() => validateUploadedMenuImages([makeUpload("image/jpeg", new Uint8Array())]));
verify(emptyUploadError instanceof MenuUploadValidationError && emptyUploadError.code === "EMPTY_IMAGE", "64 empty file is rejected");
const totalLimitError = await captureError(() => validateUploadedMenuImages([makeUpload("image/jpeg", jpegBytes, 2_100_000), makeUpload("image/jpeg", jpegBytes, 2_100_000)]));
verify(totalLimitError instanceof MenuUploadValidationError && totalLimitError.code === "TOTAL_UPLOAD_TOO_LARGE", "65 total server size is enforced");
const longNameError = await captureError(async () => validateRestaurantName("x".repeat(121)));
verify(longNameError instanceof MenuUploadValidationError && longNameError.code === "INVALID_RESTAURANT_NAME", "66 restaurant name length is enforced");
verify(detectMenuImageMediaType(jpegBytes) === "image/jpeg", "67 JPEG magic bytes are detected");
verify(detectMenuImageMediaType(pngBytes) === "image/png", "68 PNG magic bytes are detected");
verify(detectMenuImageMediaType(webpBytes) === "image/webp", "69 WEBP magic bytes are detected");
const mismatchError = await captureError(() => validateUploadedMenuImages([makeUpload("image/jpeg", pngBytes)]));
verify(mismatchError instanceof MenuUploadValidationError && mismatchError.code === "IMAGE_CONTENT_TYPE_MISMATCH", "70 MIME mismatch is rejected");
const safeMapped = mapMenuAnalysisError(new MenuAnalysisError("OPENAI_RATE_LIMITED", "raw provider detail"));
verify(safeMapped.status === 429 && safeMapped.body.error.code === "OPENAI_RATE_LIMITED", "71 provider error maps to safe response");
verify(!JSON.stringify(mapMenuAnalysisError(new Error("raw provider secret"))).includes("raw provider secret"), "72 raw provider message is not leaked");

// K. Storage and security (73-83)
const serialized = serializeCurrentAnalysis(result);
verify(parseStoredCurrentAnalysis(serialized)?.analysisId === result.analysisId, "73 session storage serialization round-trips");
verify(parseStoredCurrentAnalysis('{"bad":true}') === null, "74 invalid stored data is rejected");
const finalJson = JSON.stringify(result);
verify(!finalJson.includes("data:image"), "75 final JSON has no data URL");
verify(!finalJson.toLowerCase().includes("base64"), "76 final JSON has no base64 payload");
verify(!finalJson.includes("private-page-1.jpg"), "77 final JSON has no test filename");
verify(!finalJson.includes("sk-test"), "78 final JSON has no API key");
const openAIRequest = buildOpenAIMenuResponseRequest(provider.calls[0], "gpt-5.6");
verify(openAIRequest.store === false, "79 OpenAI request disables storage");
const requestJson = JSON.stringify(openAIRequest);
verify(requestJson.includes('"detail":"high"'), "80 OpenAI images use high detail");
verify(!("tools" in openAIRequest), "81 OpenAI request has no tools");
verify(resolveMenuAnalysisModel(undefined) === "gpt-5.6" && ALLOWED_MENU_ANALYSIS_MODELS.includes("gpt-5.6-terra"), "82 model comes from allowed server config");
verify(networkGuard.callCount === 0, "automatic tests make no network calls");

// L. Ten-image adaptive preprocessing policy (84-90)
verify(MAX_MENU_IMAGE_COUNT === 10, "84 client and server share a ten-image maximum");
verify(CLIENT_MENU_IMAGE_TARGET_BYTES === 3_800_000, "85 client preprocessing target remains 3,800,000 bytes");
verify(SERVER_MENU_IMAGE_MAX_BYTES === 4_000_000, "86 server total limit remains 4,000,000 bytes");
const profileTwo = getAdaptiveMenuImageProfile(2);
const profileTen = getAdaptiveMenuImageProfile(10);
verify(profileTen.maxLongEdge < profileTwo.maxLongEdge, "87 resolution adapts downward as image count grows");
verify(profileTen.initialQuality < profileTwo.initialQuality, "88 compression quality adapts as image count grows");
verify(profileTen.minLongEdge === 1_400 && profileTen.minQuality === 0.68, "89 readability floors remain enforced");
const orderedRequest = buildOpenAIMenuResponseRequest(
  {
    images: Array.from({ length: 10 }, (_, index) => ({ index, mediaType: "image/jpeg" as const, bytes: new Uint8Array([index]) })),
    userEnteredRestaurantName: null,
    signal: null,
  },
  "gpt-5.6",
);
const orderedContent = orderedRequest.input[0].content;
const markerOrder = orderedContent
  .filter((item) => item.type === "input_text" && item.text.startsWith("Image "))
  .map((item) => (item.type === "input_text" ? item.text : ""));
verify(orderedRequest.input.length === 1 && markerOrder.join(",") === Array.from({ length: 10 }, (_, index) => `Image ${index}`).join(","), "90 ten images preserve order in one Responses request");

let tenImageClientSelectionAccepted = true;
try {
  validateMenuImageSelection(
    Array.from({ length: 10 }, () => ({ type: "image/jpeg", size: 1 }) as File),
  );
} catch {
  tenImageClientSelectionAccepted = false;
} finally {
  networkGuard.restore();
}
verify(tenImageClientSelectionAccepted, "91 client selection accepts exactly ten images");

report();
