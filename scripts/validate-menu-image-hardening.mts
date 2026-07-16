import OpenAI from "openai";
import {
  FoodseyoAnalysisSchema,
  type FoodseyoAnalysis,
} from "../src/domain/foodseyo-analysis.ts";
import {
  MENU_ANALYSIS_RESPONSE_JSON_MESSAGE,
  MENU_ANALYSIS_RESPONSE_MISMATCH_MESSAGE,
  SAFE_MENU_ANALYSIS_ERROR_MESSAGE,
  getSafeMenuAnalysisFailure,
  parseMenuAnalysisResponse,
} from "../src/lib/menu-analysis-client.ts";
import {
  MAX_SOURCE_MENU_IMAGE_BYTES,
  MAX_SOURCE_MENU_IMAGES_TOTAL_BYTES,
  MenuImagePreprocessingError,
  decodeMenuImage,
  validateMenuImageSelection,
  type MenuImageDecoderDependencies,
} from "../src/lib/menu-image-preprocessing.ts";
import {
  CURRENT_ANALYSIS_STORAGE_KEY,
  parseStoredCurrentAnalysis,
  tryWriteCurrentAnalysis,
} from "../src/lib/storage.ts";
import {
  AnalysisAbortedError,
  analyzeFoodseyoInput,
  createAnalyzerRegistry,
  validateAnalysisSemantics,
  type MenuImagesAnalyzeRequest,
  type TransientImageInput,
} from "../src/services/analysis/index.ts";
import { mapMenuAnalysisError } from "../src/services/menu-analysis/menu-analysis-api-errors.ts";
import {
  MenuAnalysisApiErrorSchema,
  MenuAnalysisApiSuccessSchema,
} from "../src/services/menu-analysis/menu-analysis-api.ts";
import { createMenuAnalysisPostHandler } from "../src/services/menu-analysis/menu-analysis-post-handler.ts";
import { MenuAnalysisError } from "../src/services/menu-analysis/menu-analysis-errors.ts";
import { adaptMenuImageModelOutput } from "../src/services/menu-analysis/menu-image-adapter.ts";
import {
  MAX_MENU_IMAGE_COUNT,
  SERVER_MENU_IMAGE_MAX_BYTES,
} from "../src/services/menu-analysis/menu-image-limits.ts";
import {
  MenuImageModelOutputSchema,
  type MenuImageModelOutput,
} from "../src/services/menu-analysis/menu-image-model-schema.ts";
import { MENU_IMAGE_DEVELOPER_PROMPT } from "../src/services/menu-analysis/menu-image-prompt.ts";
import { createMenuImagesAnalyzer } from "../src/services/menu-analysis/menu-images-analyzer.ts";
import { normalizeOpenAIMenuProviderError } from "../src/services/menu-analysis/openai-menu-error-mapper.ts";
import {
  MENU_ANALYSIS_MAX_OUTPUT_TOKENS,
  MENU_ANALYSIS_TIMEOUT_MS,
  buildOpenAIMenuResponseRequest,
} from "../src/services/menu-analysis/openai-menu-request.ts";
import type {
  MenuVisionProvider,
  MenuVisionProviderInput,
} from "../src/services/menu-analysis/menu-vision-provider.ts";
import {
  captureError,
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo menu image production hardening validation",
  "Menu image hardening validation failed",
);
const safeMessage = (error: unknown, signalAborted = false): string | null =>
  getSafeMenuAnalysisFailure(error, {
    signalAborted,
    timedOut: false,
  })?.message ?? null;
const clone = <T>(value: T): T => structuredClone(value);

const modelFixture: MenuImageModelOutput = {
  analysisQuality: "good",
  menuTitle: "Test Menu",
  currency: null,
  restaurantSignals: [
    { kind: "name", value: "North Star Kitchen", sourceImageIndex: 0 },
    { kind: "address", value: "1 Test Street", sourceImageIndex: 1 },
    { kind: "phone", value: "+1 555 0100", sourceImageIndex: 1 },
    { kind: "website", value: "https://example.com/menu", sourceImageIndex: 1 },
  ],
  categories: [
    {
      label: "Mains",
      sourceImageIndexes: [0],
      dishes: [
        {
          name: "Noodle Soup",
          originalName: null,
          pronunciation: null,
          menuDescription: "Noodles in broth",
          rawPriceText: "$12",
          price: { amount: 12, currency: null, displayText: "$12" },
          priceOptions: [
            {
              label: "Large",
              price: { amount: 15, currency: null, displayText: "$15" },
              sourceImageIndexes: [0],
            },
          ],
          options: [
            {
              label: "Add egg",
              additionalPrice: { amount: 2, currency: null, displayText: "+$2" },
              sourceImageIndexes: [0],
            },
          ],
          visibleSpiceLabel: null,
          visibleDietaryLabels: [],
          explicitDietaryClaims: [
            {
              key: "eggs",
              claimType: "contains",
              exactVisibleText: "Contains egg",
              sourceImageIndexes: [0],
            },
          ],
          generalKnowledge: {
            definition: "A noodle dish served in broth.",
            regionalBackground: null,
            typicalTaste: ["savory"],
            typicalTexture: ["soft"],
            typicalSpice: null,
            typicalPreparation: "Noodles and broth.",
            commonIngredients: ["noodles"],
            similarDishes: [],
            orderingConsiderations: [],
          },
          sourceImageIndexes: [0],
          uncertaintyNotes: [],
        },
      ],
    },
  ],
  warnings: [],
};

class FakeProvider implements MenuVisionProvider {
  readonly calls: MenuVisionProviderInput[] = [];
  readonly output: MenuImageModelOutput;
  readonly thrownError: unknown;

  constructor(
    output: MenuImageModelOutput = modelFixture,
    thrownError: unknown = null,
  ) {
    this.output = output;
    this.thrownError = thrownError;
  }
  async analyzeMenuImages(input: MenuVisionProviderInput): Promise<MenuImageModelOutput> {
    this.calls.push(input);
    if (this.thrownError) throw this.thrownError;
    return clone(this.output);
  }
}

const jpegA = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1]);
const jpegB = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 2]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const transient = (
  id: string,
  bytes: Uint8Array,
  mediaType = "image/jpeg",
  byteLength: number | null = bytes.byteLength,
): TransientImageInput => ({
  id,
  fileName: null,
  mediaType,
  byteLength,
  async read() {
    return bytes.slice();
  },
});
const menuRequest = (
  images: readonly TransientImageInput[] = [
    transient("first", jpegA),
    transient("second", jpegB),
  ],
  userEnteredRestaurantName: string | null = null,
): MenuImagesAnalyzeRequest => ({
  type: "menu_images",
  images,
  userEnteredRestaurantName,
  location: null,
});
const analyze = (
  provider: MenuVisionProvider,
  request: MenuImagesAnalyzeRequest = menuRequest(),
): Promise<FoodseyoAnalysis> =>
  analyzeFoodseyoInput(request, {
    analyzerRegistry: createAnalyzerRegistry({
      menu_images: createMenuImagesAnalyzer({ provider }),
    }),
    now: () => new Date("2026-07-15T12:00:00.000Z"),
    createAnalysisId: () => "hardening-analysis-id",
  });

// Explicit restaurant provenance.
const explicitConflict = adaptMenuImageModelOutput({
  modelOutput: modelFixture,
  imageCount: 2,
  userEnteredRestaurantName: "Different Restaurant",
});
verify(
  explicitConflict.restaurantResolution.status === "confirmed" &&
    explicitConflict.restaurantResolution.confirmedBy === "explicit_input",
  "explicit input confirms the user-entered identity",
);
verify(
  explicitConflict.restaurant?.name === "Different Restaurant" &&
    explicitConflict.restaurantResolution.candidates[0]?.name === "Different Restaurant",
  "explicit input owns restaurant and candidate names",
);
verify(
  explicitConflict.restaurantResolution.sourceIds.length === 0 &&
    explicitConflict.restaurant?.sourceIds.length === 0 &&
    explicitConflict.restaurantResolution.candidates[0]?.sourceIds.length === 0,
  "explicit-only identity borrows no image source IDs",
);
verify(
  explicitConflict.restaurant?.address === null &&
    explicitConflict.restaurant?.phone === null &&
    explicitConflict.restaurant?.website === null,
  "conflicting image contact data is not merged",
);
verify(
  explicitConflict.restaurantResolution.limitations.some((item) =>
    item.includes("explicit user input"),
  ) &&
    explicitConflict.restaurantResolution.limitations.some((item) =>
      item.includes("not verified against public web"),
    ) &&
    explicitConflict.restaurantResolution.limitations.some((item) =>
      item.includes("not merged"),
    ),
  "explicit conflict limitations record provenance and non-merge",
);
verify(
  validateAnalysisSemantics(explicitConflict).errors.length === 0,
  "confirmed explicit input without source IDs passes semantics",
);
const directWithoutSources = adaptMenuImageModelOutput({
  modelOutput: modelFixture,
  imageCount: 2,
  userEnteredRestaurantName: null,
});
directWithoutSources.restaurantResolution.sourceIds = [];
verify(
  validateAnalysisSemantics(directWithoutSources).errors.some(
    (item) => item.code === "CONFIRMED_EVIDENCE_MISSING",
  ),
  "confirmed direct evidence without source IDs still fails semantics",
);
const explicitMatch = adaptMenuImageModelOutput({
  modelOutput: modelFixture,
  imageCount: 2,
  userEnteredRestaurantName: "  NORTH—STAR kitchen! ",
});
verify(
  explicitMatch.restaurant?.address === "1 Test Street" &&
    explicitMatch.restaurant?.phone === "+1 555 0100" &&
    explicitMatch.restaurant?.website === "https://example.com/menu",
  "conservatively normalized matching name may merge contact data",
);
verify(
  explicitMatch.restaurantResolution.sourceIds.join(",") ===
    "uploaded-menu-image-1,uploaded-menu-image-2",
  "matching visible identity may carry matched evidence",
);
const punctuationOnlyNames = clone(modelFixture);
punctuationOnlyNames.restaurantSignals[0].value = "!!!";
const punctuationOnlyConflict = adaptMenuImageModelOutput({
  modelOutput: punctuationOnlyNames,
  imageCount: 2,
  userEnteredRestaurantName: "???",
});
verify(
  punctuationOnlyConflict.restaurant?.address === null &&
    punctuationOnlyConflict.restaurantResolution.sourceIds.length === 0,
  "empty normalized names are never treated as a conservative match",
);

// Analyzer defense in depth.
const invalidProvider = new FakeProvider();
const analyzer = createMenuImagesAnalyzer({ provider: invalidProvider });
const zeroError = await captureError(() => analyzer.analyze(menuRequest([]), { signal: null }));
verify(
  zeroError instanceof MenuAnalysisError && zeroError.code === "INVALID_MENU_IMAGE_INPUT",
  "direct analyzer rejects zero images",
);
const elevenError = await captureError(() =>
  analyzer.analyze(
    menuRequest(Array.from({ length: 11 }, (_, index) => transient(`${index}`, jpegA))),
    { signal: null },
  ),
);
verify(
  elevenError instanceof MenuAnalysisError && elevenError.code === "TOO_MANY_MENU_IMAGES",
  "direct analyzer rejects eleven images",
);
const tooManyBytesError = await captureError(() =>
  analyzer.analyze(
    menuRequest([
      transient(
        "oversized",
        new Uint8Array(SERVER_MENU_IMAGE_MAX_BYTES + 1),
        "image/jpeg",
      ),
    ]),
    { signal: null },
  ),
);
verify(
  tooManyBytesError instanceof MenuAnalysisError &&
    tooManyBytesError.code === "MENU_IMAGE_BYTES_EXCEEDED",
  "direct analyzer enforces actual total bytes",
);
const emptyBytesError = await captureError(() =>
  analyzer.analyze(menuRequest([transient("empty", new Uint8Array())]), { signal: null }),
);
verify(
  emptyBytesError instanceof MenuAnalysisError &&
    emptyBytesError.code === "INVALID_MENU_IMAGE_INPUT",
  "direct analyzer rejects empty actual bytes",
);
const mediaError = await captureError(() =>
  analyzer.analyze(menuRequest([transient("gif", jpegA, "image/gif")]), { signal: null }),
);
verify(
  mediaError instanceof MenuAnalysisError && mediaError.code === "INVALID_MENU_IMAGE_INPUT",
  "direct analyzer rejects unsupported media",
);
const metadataError = await captureError(() =>
  analyzer.analyze(menuRequest([transient("mismatch", jpegA, "image/jpeg", 999)]), {
    signal: null,
  }),
);
verify(
  metadataError instanceof MenuAnalysisError &&
    metadataError.code === "INVALID_MENU_IMAGE_INPUT",
  "direct analyzer rejects byteLength metadata mismatch",
);
verify(invalidProvider.calls.length === 0, "invalid analyzer inputs never call the provider");
const orderedProvider = new FakeProvider();
const orderedAnalyzer = createMenuImagesAnalyzer({ provider: orderedProvider });
await orderedAnalyzer.analyze(
  menuRequest(),
  { signal: null },
);
verify(
  orderedProvider.calls[0]?.images.map((image) => image.bytes.at(-1)).join(",") === "1,2",
  "valid analyzer input preserves image order",
);
const readAbortController = new AbortController();
const abortingImage: TransientImageInput = {
  ...transient("abort", jpegA),
  async read() {
    readAbortController.abort();
    return jpegA;
  },
};
const readAbortError = await captureError(() =>
  analyzer.analyze(menuRequest([abortingImage]), { signal: readAbortController.signal }),
);
verify(readAbortError instanceof AnalysisAbortedError, "abort after an async read is honored");
verify(
  mapMenuAnalysisError(zeroError).status === 400 &&
    mapMenuAnalysisError(elevenError).status === 400 &&
    mapMenuAnalysisError(tooManyBytesError).status === 413,
  "internal analyzer errors map to 400/400/413 boundaries",
);
verify(
  !(
    zeroError instanceof AnalysisAbortedError ||
    elevenError instanceof AnalysisAbortedError ||
    tooManyBytesError instanceof AnalysisAbortedError
  ),
  "invalid input never falls back to demo or abort behavior",
);

// Model source indexes and empty-category adapter behavior.
const emptySourceVariants: MenuImageModelOutput[] = [];
const emptyCategorySource = clone(modelFixture);
emptyCategorySource.categories[0].sourceImageIndexes = [];
emptySourceVariants.push(emptyCategorySource);
const emptyDishSource = clone(modelFixture);
emptyDishSource.categories[0].dishes[0].sourceImageIndexes = [];
emptySourceVariants.push(emptyDishSource);
const emptyPriceOptionSource = clone(modelFixture);
emptyPriceOptionSource.categories[0].dishes[0].priceOptions[0].sourceImageIndexes = [];
emptySourceVariants.push(emptyPriceOptionSource);
const emptyOptionSource = clone(modelFixture);
emptyOptionSource.categories[0].dishes[0].options[0].sourceImageIndexes = [];
emptySourceVariants.push(emptyOptionSource);
const emptyDietarySource = clone(modelFixture);
emptyDietarySource.categories[0].dishes[0].explicitDietaryClaims[0].sourceImageIndexes = [];
emptySourceVariants.push(emptyDietarySource);
for (const [index, variant] of emptySourceVariants.entries()) {
  verify(
    !MenuImageModelOutputSchema.safeParse(variant).success,
    `source-bound model object ${index + 1} rejects an empty source array`,
  );
}
verify(MenuImageModelOutputSchema.safeParse(modelFixture).success, "one-element source arrays remain valid");
verify(
  modelFixture.categories[0].sourceImageIndexes[0] === 0,
  "zero-based source indexes remain supported",
);
const withEmptyCategory = clone(modelFixture);
withEmptyCategory.categories.unshift({
  label: "Empty heading",
  sourceImageIndexes: [0],
  dishes: [],
});
const withoutEmptyCategory = adaptMenuImageModelOutput({
  modelOutput: withEmptyCategory,
  imageCount: 2,
  userEnteredRestaurantName: null,
});
verify(
  withoutEmptyCategory.menu?.categories.map((item) => item.label).join(",") === "Mains",
  "empty canonical categories are removed",
);
const orderedCategories = clone(modelFixture);
orderedCategories.categories.push({
  label: "Desserts",
  sourceImageIndexes: [1],
  dishes: [
    {
      ...clone(modelFixture.categories[0].dishes[0]),
      name: "Rice Pudding",
      sourceImageIndexes: [1],
      priceOptions: [],
      options: [],
      explicitDietaryClaims: [],
    },
  ],
});
const orderedPayload = adaptMenuImageModelOutput({
  modelOutput: orderedCategories,
  imageCount: 2,
  userEnteredRestaurantName: null,
});
verify(
  orderedPayload.menu?.categories.map((item) => item.label).join(",") ===
    "Mains,Desserts",
  "non-empty category order is preserved",
);
verify(
  orderedPayload.menu?.dishes.every((dish) =>
    orderedPayload.menu?.categories.some((category) => category.id === dish.categoryId),
  ) === true,
  "dish category references remain valid after filtering",
);
const allEmpty = clone(modelFixture);
allEmpty.categories[0].dishes = [];
const allEmptyError = await captureError(async () =>
  adaptMenuImageModelOutput({
    modelOutput: allEmpty,
    imageCount: 2,
    userEnteredRestaurantName: null,
  }),
);
verify(
  allEmptyError instanceof MenuAnalysisError && allEmptyError.code === "MENU_DISHES_MISSING",
  "all-empty categories keep MENU_DISHES_MISSING behavior",
);

// Provider authentication and operational errors use real installed SDK classes.
const headers = new Headers();
const authError = normalizeOpenAIMenuProviderError(
  new OpenAI.AuthenticationError(401, { message: "raw auth secret" }, undefined, headers),
  false,
);
const permissionError = normalizeOpenAIMenuProviderError(
  new OpenAI.PermissionDeniedError(403, { message: "raw permission secret" }, undefined, headers),
  false,
);
verify(
  authError instanceof MenuAnalysisError &&
    authError.code === "OPENAI_AUTH_FAILED" &&
    !authError.retryable,
  "401 becomes non-retryable authentication configuration failure",
);
verify(
  permissionError instanceof MenuAnalysisError &&
    permissionError.code === "OPENAI_AUTH_FAILED" &&
    !permissionError.retryable,
  "403 becomes non-retryable permission configuration failure",
);
const rateError = normalizeOpenAIMenuProviderError(
  new OpenAI.RateLimitError(429, { message: "rate detail" }, undefined, headers),
  false,
);
verify(
  rateError instanceof MenuAnalysisError &&
    rateError.code === "OPENAI_RATE_LIMITED" &&
    rateError.retryable,
  "429 remains retryable rate limiting",
);
const timeoutError = normalizeOpenAIMenuProviderError(
  new OpenAI.APIConnectionTimeoutError(),
  false,
);
verify(
  timeoutError instanceof MenuAnalysisError &&
    timeoutError.code === "OPENAI_TIMEOUT" &&
    timeoutError.retryable,
  "SDK timeout remains retryable timeout",
);
const unavailableError = normalizeOpenAIMenuProviderError(
  new OpenAI.InternalServerError(500, { message: "raw upstream body" }, undefined, headers),
  false,
);
verify(
  unavailableError instanceof MenuAnalysisError &&
    unavailableError.code === "OPENAI_UNAVAILABLE" &&
    unavailableError.retryable,
  "5xx remains retryable unavailable",
);
const safeAuthResponse = mapMenuAnalysisError(authError);
verify(
  safeAuthResponse.status === 503 &&
    safeAuthResponse.body.error.code === "OPENAI_AUTH_FAILED" &&
    !safeAuthResponse.body.error.retryable,
  "authentication failures map to stable safe 503",
);
verify(
  !JSON.stringify(safeAuthResponse).includes("raw auth secret"),
  "provider authentication messages are not leaked",
);

// Client-safe response and error handling.
const safeApiMessage = "Menu analysis is busy. Try again shortly.";
const validApiError = await captureError(() =>
  parseMenuAnalysisResponse({
    ok: false,
    async text() {
      return JSON.stringify({
        ok: false,
        error: { code: "OPENAI_RATE_LIMITED", message: safeApiMessage, retryable: true },
      });
    },
  }),
);
verify(
  safeMessage(validApiError) === safeApiMessage,
  "schema-validated API error message is accepted",
);
const invalidJsonError = await captureError(() =>
  parseMenuAnalysisResponse({
    ok: false,
    async text() {
      return "<html>truncated";
    },
  }),
);
verify(
  safeMessage(invalidJsonError) === MENU_ANALYSIS_RESPONSE_JSON_MESSAGE,
  "invalid JSON uses the categorized safe message",
);
const htmlError = await captureError(() =>
  parseMenuAnalysisResponse(new Response("<html>Vercel failure</html>", { status: 502 })),
);
verify(
  safeMessage(htmlError) === MENU_ANALYSIS_RESPONSE_JSON_MESSAGE,
  "HTML response uses the categorized safe message",
);
verify(
  safeMessage(new TypeError("Failed to fetch")) === SAFE_MENU_ANALYSIS_ERROR_MESSAGE,
  "network TypeError uses the generic safe message",
);
const preprocessingError = new MenuImagePreprocessingError(
  "SOURCE_IMAGE_TOO_LARGE",
  "Safe preprocessing guidance.",
);
verify(
  safeMessage(preprocessingError) === "Safe preprocessing guidance.",
  "preprocessing error retains its safe message",
);
verify(
  safeMessage(new Error("technical stack detail"), true) === null,
  "aborted analysis stays silent",
);
verify(
  !safeMessage(new Error("QuotaExceededError raw"))?.includes(
    "QuotaExceededError",
  ),
  "unexpected technical messages are never exposed",
);
const mismatchedStatusError = await captureError(() =>
  parseMenuAnalysisResponse({
    ok: true,
    async text() {
      return JSON.stringify({
        ok: false,
        error: { code: "OPENAI_TIMEOUT", message: "safe but mismatched", retryable: true },
      });
    },
  }),
);
verify(
  safeMessage(mismatchedStatusError) === MENU_ANALYSIS_RESPONSE_MISMATCH_MESSAGE,
  "HTTP and schema status mismatch uses a categorized error",
);

// Original source-file memory guards.
const selectionFile = (size: number, type = "image/jpeg") => ({ size, type }) as File;
let sourceError: unknown = null;
try {
  validateMenuImageSelection([selectionFile(MAX_SOURCE_MENU_IMAGE_BYTES + 1)]);
} catch (error) {
  sourceError = error;
}
verify(
  sourceError instanceof MenuImagePreprocessingError &&
    sourceError.code === "SOURCE_IMAGE_TOO_LARGE",
  "single original source over 25MB is rejected",
);
let sourceTotalError: unknown = null;
try {
  validateMenuImageSelection(Array.from({ length: 5 }, () => selectionFile(21_000_000)));
} catch (error) {
  sourceTotalError = error;
}
verify(
  sourceTotalError instanceof MenuImagePreprocessingError &&
    sourceTotalError.code === "SOURCE_IMAGES_TOTAL_TOO_LARGE",
  "original source total over 100MB is rejected",
);
let normalSelectionAccepted = true;
try {
  validateMenuImageSelection([selectionFile(8_000_000), selectionFile(7_000_000)]);
} catch {
  normalSelectionAccepted = false;
}
verify(normalSelectionAccepted, "normal phone-sized source files remain accepted");
verify(
  MAX_SOURCE_MENU_IMAGES_TOTAL_BYTES === 100_000_000 &&
    MAX_SOURCE_MENU_IMAGE_BYTES === 25_000_000 &&
    MAX_MENU_IMAGE_COUNT === 10,
  "source guards remain distinct from the ten-image policy",
);

// Browser decoder selection and cleanup with DOM-free injected fakes.
let bitmapClosed = 0;
const fakeBitmap = {
  width: 1200,
  height: 800,
  close() {
    bitmapClosed += 1;
  },
} as ImageBitmap;
const bitmapDependencies: MenuImageDecoderDependencies = {
  createBitmap: async () => fakeBitmap,
  createObjectURL() {
    throw new Error("fallback should not run");
  },
  revokeObjectURL() {},
  createImage() {
    throw new Error("fallback should not run");
  },
};
const bitmapDecoded = await decodeMenuImage(selectionFile(1), bitmapDependencies);
verify(
  bitmapDecoded.source === fakeBitmap &&
    bitmapDecoded.width === 1200 &&
    bitmapDecoded.height === 800,
  "createImageBitmap remains the primary decode path",
);
bitmapDecoded.dispose();
bitmapDecoded.dispose();
verify(bitmapClosed === 1, "ImageBitmap disposal is idempotent");
let revokedUrl = "";
const fakeImage = {
  src: "",
  naturalWidth: 900,
  naturalHeight: 1400,
  onload: null,
  onerror: null,
  async decode() {},
} as unknown as HTMLImageElement;
const fallbackDependencies: MenuImageDecoderDependencies = {
  createBitmap: async () => {
    throw new Error("bitmap unsupported");
  },
  createObjectURL: () => "blob:fallback",
  revokeObjectURL: (url) => {
    revokedUrl = url;
  },
  createImage: () => fakeImage,
};
const fallbackDecoded = await decodeMenuImage(selectionFile(1), fallbackDependencies);
verify(
  fallbackDecoded.source === fakeImage &&
    fallbackDecoded.width === 900 &&
    fallbackDecoded.height === 1400,
  "HTMLImageElement fallback preserves decoded dimensions",
);
fallbackDecoded.dispose();
verify(
  revokedUrl === "blob:fallback" && fakeImage.src === "",
  "HTML image fallback revokes its object URL and clears src",
);
let failedFallbackRevoked = false;
const failedDecode = await captureError(() =>
  decodeMenuImage(selectionFile(1), {
    createBitmap: null,
    createObjectURL: () => "blob:failed",
    revokeObjectURL: () => {
      failedFallbackRevoked = true;
    },
    createImage: () =>
      ({
        src: "",
        naturalWidth: 0,
        naturalHeight: 0,
        onload: null,
        onerror: null,
        async decode() {
          throw new Error("raw decoder failure");
        },
      }) as unknown as HTMLImageElement,
  }),
);
verify(
  failedDecode instanceof MenuImagePreprocessingError &&
    failedDecode.code === "IMAGE_DECODE_FAILED",
  "both decoder failures return the existing safe typed error",
);
verify(failedFallbackRevoked, "failed HTML fallback also revokes its object URL");

// Storage write failures remain separate from successful analysis.
const storageResult = await analyze(new FakeProvider());
let storedKey = "";
let storedValue = "";
verify(
  tryWriteCurrentAnalysis(storageResult, {
    setItem(key, value) {
      storedKey = key;
      storedValue = value;
    },
    getItem() {
      return storedValue;
    },
  }),
  "current analysis storage helper reports write success",
);
verify(
  storedKey === CURRENT_ANALYSIS_STORAGE_KEY &&
    parseStoredCurrentAnalysis(storedValue)?.analysisId === storageResult.analysisId,
  "stored analysis remains schema validated",
);
verify(
  !tryWriteCurrentAnalysis(storageResult, {
    setItem() {
      throw new Error("QuotaExceededError raw browser message");
    },
    getItem() {
      return null;
    },
  }),
  "simulated storage exception reports write failure without throwing",
);
verify(
  FoodseyoAnalysisSchema.safeParse(storageResult).success,
  "storage failure does not turn a valid analysis into provider failure",
);

// Actual Request/Response route boundary with an injected provider.
const networkGuard = installNetworkGuard(
  "Automatic hardening tests must not call the network.",
);
const formRequest = (
  files: ReadonlyArray<{ bytes: Uint8Array; type: string }> = [],
  stringImage = false,
): Request => {
  const formData = new FormData();
  if (stringImage) formData.append("images", "not-a-file");
  files.forEach((file, index) => {
    formData.append(
      "images",
      new Blob([file.bytes as BlobPart], { type: file.type }),
      `menu-${index + 1}.jpg`,
    );
  });
  return new Request("http://localhost/api/analyze/menu-images", {
    method: "POST",
    body: formData,
  });
};
const routeProvider = new FakeProvider();
const ignoreObservation = () => {};
const routeHandler = createMenuAnalysisPostHandler({
  createProvider: () => routeProvider,
  logObservation: ignoreObservation,
});
const nonMultipart = await routeHandler(
  new Request("http://localhost/api/analyze/menu-images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }),
);
verify(nonMultipart.status === 400, "Route rejects a non-multipart request");
const malformed = await routeHandler(
  new Request("http://localhost/api/analyze/menu-images", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=broken" },
    body: "not-valid-multipart",
  }),
);
verify(malformed.status === 400, "Route rejects malformed multipart data");
verify(
  (await routeHandler(formRequest([], true))).status === 400,
  "Route rejects a string images field",
);
const noImagesResponse = await routeHandler(formRequest());
verify(noImagesResponse.status === 400, "Route rejects missing images");
const elevenResponse = await routeHandler(
  formRequest(
    Array.from({ length: 11 }, () => ({ bytes: jpegA, type: "image/jpeg" })),
  ),
);
verify(elevenResponse.status === 400, "Route rejects eleven images");
const routeTooLarge = await routeHandler(
  formRequest([
    {
      bytes: new Uint8Array(SERVER_MENU_IMAGE_MAX_BYTES + 1),
      type: "image/jpeg",
    },
  ]),
);
verify(routeTooLarge.status === 413, "Route rejects declared total bytes above 4MB");
verify(
  (await routeHandler(formRequest([{ bytes: jpegA, type: "image/gif" }]))).status === 415,
  "Route rejects unsupported MIME",
);
const mismatchResponse = await routeHandler(
  formRequest([{ bytes: png, type: "image/jpeg" }]),
);
verify(mismatchResponse.status === 415, "Route rejects magic-byte mismatch");
const missingConfigResponse = await createMenuAnalysisPostHandler({
  createProvider() {
    throw new MenuAnalysisError("OPENAI_NOT_CONFIGURED", "raw configuration detail");
  },
  logObservation: ignoreObservation,
})(formRequest([{ bytes: jpegA, type: "image/jpeg" }]));
verify(missingConfigResponse.status === 503, "Route maps missing server configuration to 503");
const successResponse = await routeHandler(
  formRequest([
    { bytes: jpegA, type: "image/jpeg" },
    { bytes: jpegB, type: "image/jpeg" },
  ]),
);
const successBody = await successResponse.json();
verify(successResponse.status === 200, "fake-provider Route request succeeds");
verify(MenuAnalysisApiSuccessSchema.safeParse(successBody).success, "Route success body parses");
verify(
  successResponse.headers.get("cache-control") === "no-store",
  "Route success response is no-store",
);
verify(
  nonMultipart.headers.get("cache-control") === "no-store",
  "Route failure response is no-store",
);
verify(
  successBody.ok === true &&
    successBody.analysis.inputContext.type === "menu_images" &&
    !successBody.analysis.inputContext.locationUsed,
  "Route passes no exact location into canonical output",
);
verify(
  routeProvider.calls.at(-1)?.images.map((image) => image.bytes.at(-1)).join(",") === "1,2",
  "Route preserves multipart image order",
);
const rawFailureResponse = await createMenuAnalysisPostHandler({
  createProvider: () =>
    new FakeProvider(modelFixture, new Error("raw provider secret and request id")),
  logObservation: ignoreObservation,
})(formRequest([{ bytes: jpegA, type: "image/jpeg" }]));
const rawFailureText = await rawFailureResponse.text();
verify(
  MenuAnalysisApiErrorSchema.safeParse(JSON.parse(rawFailureText)).success,
  "Route failure body parses as the safe API error schema",
);
verify(
  !rawFailureText.includes("raw provider secret") &&
    !rawFailureText.toLowerCase().includes("authorization"),
  "Route response leaks no provider or credential detail",
);
verify(networkGuard.callCount === 0, "Route boundary tests make zero network calls");
networkGuard.restore();

// Prompt and one-request policy remain unchanged except for concision hardening.
const request = buildOpenAIMenuResponseRequest(
  {
    images: [
      { index: 0, mediaType: "image/jpeg", bytes: jpegA },
      { index: 1, mediaType: "image/jpeg", bytes: jpegB },
    ],
    userEnteredRestaurantName: null,
    signal: null,
  },
  "gpt-5.6",
);
verify(
  MENU_IMAGE_DEVELOPER_PROMPT.includes("Prioritize complete extraction") &&
    MENU_IMAGE_DEVELOPER_PROMPT.includes("later menu items are not omitted") &&
    MENU_IMAGE_DEVELOPER_PROMPT.includes("compact arrays") &&
    MENU_IMAGE_DEVELOPER_PROMPT.includes("do not repeat menu descriptions"),
  "prompt prioritizes complete extraction over verbose enrichment",
);
verify(MENU_ANALYSIS_MAX_OUTPUT_TOKENS === 12_000, "output token limit remains 12,000");
verify(MENU_ANALYSIS_TIMEOUT_MS === 80_000, "provider timeout is reduced to 80 seconds");
verify(MENU_ANALYSIS_TIMEOUT_MS < 90_000, "provider timeout leaves Route response margin");
verify(request.input.length === 1 && !("tools" in request), "request remains one call with no tools");
verify(request.store === false, "request continues to disable provider storage");
verify(
  JSON.stringify(request).includes('"detail":"high"'),
  "request continues to use high image detail",
);

report();
