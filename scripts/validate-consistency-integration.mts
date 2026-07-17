import {
  FOODSEYO_ANALYSIS_LEGACY_SCHEMA_VERSION,
  FOODSEYO_ANALYSIS_PREVIOUS_SCHEMA_VERSION,
  FOODSEYO_ANALYSIS_SCHEMA_VERSION,
  FoodseyoAnalysisSchema,
  type ConsistentFoodseyoAnalysis,
} from "../src/domain/foodseyo-analysis.ts";
import { demoFoodseyoAnalysis } from "../src/data/demoFoodseyoAnalysis.ts";
import {
  createAnalysisResultFingerprint,
  createAnalysisConsistencyVersionMetadata,
  createDishFingerprint,
  createSourceFingerprint,
  validateAnalysisConsistency,
} from "../src/lib/analysis-consistency/index.ts";
import {
  BASIC_TASTES,
  FLAVOR_NOTES,
  HEAT_LEVELS,
  INGREDIENT_EVIDENCE_BASES,
  RICHNESS_LEVELS,
  TEXTURES,
} from "../src/lib/analysis-consistency/profile.ts";
import {
  createLiveAnalysisOverview,
  createLiveDishDetail,
  getRestaurantResolutionProvenance,
} from "../src/lib/live-analysis-results.ts";
import { parseCurrentAnalysisStorageValue, serializeCurrentAnalysis } from "../src/lib/storage.ts";
import {
  analyzeFoodseyoInput,
  createAnalyzerRegistry,
  validateAnalysisSemantics,
  type TransientImageInput,
} from "../src/services/analysis/index.ts";
import { finalizeLiveDishConsistency } from "../src/services/menu-analysis/menu-image-consistency.ts";
import { adaptMenuImageModelOutput } from "../src/services/menu-analysis/menu-image-adapter.ts";
import {
  MenuImageModelOutputSchema,
  type MenuImageModelOutput,
} from "../src/services/menu-analysis/menu-image-model-schema.ts";
import { MenuAnalysisError } from "../src/services/menu-analysis/menu-analysis-errors.ts";
import { MENU_IMAGE_DEVELOPER_PROMPT } from "../src/services/menu-analysis/menu-image-prompt.ts";
import { createMenuImagesAnalyzer } from "../src/services/menu-analysis/menu-images-analyzer.ts";
import {
  MENU_IMAGE_PROMPT_VERSION,
  MENU_IMAGE_PROVIDER_SCHEMA_VERSION,
  createMenuAnalysisVersionMetadata,
} from "../src/services/menu-analysis/menu-analysis-versions.ts";
import { buildOpenAIMenuResponseRequest } from "../src/services/menu-analysis/openai-menu-request.ts";
import type {
  MenuVisionProvider,
  MenuVisionProviderInput,
} from "../src/services/menu-analysis/menu-vision-provider.ts";
import {
  createValidationSuite,
  captureError,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo live consistency integration validation",
  "Live consistency integration validation failed",
);
const network = installNetworkGuard(
  "Live consistency integration must remain network-free.",
);

const modelVersion = "gpt-5.6";
const modelOutput: MenuImageModelOutput = {
  analysisQuality: "good",
  menuTitle: "Synthetic menu",
  currency: "USD",
  restaurantSignals: [],
  categories: [
    {
      label: "Mains",
      sourceImageIndexes: [0, 1],
      dishes: [
        {
          name: "Synthetic noodles",
          originalName: null,
          pronunciation: null,
          menuDescription: "Noodles with garlic and herbs",
          rawPriceText: "$12",
          price: { amount: 12, currency: "USD", displayText: "$12" },
          priceOptions: [],
          options: [],
          visibleSpiceLabel: null,
          visibleDietaryLabels: [],
          explicitDietaryClaims: [],
          generalKnowledge: {
            definition: "A synthetic noodle fixture.",
            regionalBackground: null,
            typicalTaste: ["free-form legacy field"],
            typicalTexture: ["free-form legacy field"],
            typicalSpice: "free-form legacy field",
            typicalPreparation: null,
            commonIngredients: ["legacy fixture ingredient"],
            similarDishes: [],
            orderingConsiderations: [],
          },
          consistency: {
            basicTastes: [
              { value: "sweet", intensity: 1 },
              { value: "savory", intensity: 3 },
            ],
            flavorNotes: ["herbal", "garlicky"],
            heatLevel: "mild",
            richnessLevel: "moderate",
            textures: ["tender", "springy"],
            ingredients: [
              { name: "garlic", basis: "stated" },
              { name: "noodles", basis: "stated" },
              { name: "sesame oil", basis: "typical" },
              { name: "chili", basis: "uncertain" },
            ],
          },
          sourceImageIndexes: [0, 1],
          uncertaintyNotes: [],
        },
      ],
    },
  ],
  warnings: [],
};

verify(BASIC_TASTES.join(",") === "sweet,salty,sour,bitter,savory", "provider and canonical schema share the exact basic-taste source of truth");
verify(FLAVOR_NOTES.join(",") === "smoky,herbal,nutty,earthy,garlicky,buttery,cheesy,fruity,citrusy,fermented", "provider and canonical schema share the exact flavor-note source of truth");
verify(HEAT_LEVELS.join(",") === "none,mild,medium,hot,very_hot,unknown", "provider and canonical schema share the exact heat source of truth");
verify(RICHNESS_LEVELS.join(",") === "light,moderate,rich,unknown", "provider and canonical schema share the exact richness source of truth");
verify(TEXTURES.length === 16 && TEXTURES.includes("moist"), "provider and canonical schema share the exact texture source of truth");
verify(INGREDIENT_EVIDENCE_BASES.join(",") === "stated,typical,uncertain", "provider and canonical schema share the exact ingredient-basis source of truth");
verify(MenuImageModelOutputSchema.safeParse(modelOutput).success, "provider schema accepts the bounded consistency fixture");
const invalidTaste = structuredClone(modelOutput);
Object.assign(invalidTaste.categories[0].dishes[0].consistency, {
  basicTastes: [{ value: "spicy", intensity: 2 }],
});
verify(!MenuImageModelOutputSchema.safeParse(invalidTaste).success, "provider schema rejects a non-basic taste");
const invalidIntensity = structuredClone(modelOutput);
Object.assign(invalidIntensity.categories[0].dishes[0].consistency, {
  basicTastes: [{ value: "savory", intensity: 0 }],
});
verify(!MenuImageModelOutputSchema.safeParse(invalidIntensity).success, "provider schema rejects intensity outside 1 through 3");
const tooManyTextures = structuredClone(modelOutput);
Object.assign(tooManyTextures.categories[0].dishes[0].consistency, {
  textures: ["crispy", "tender", "soft"],
});
verify(!MenuImageModelOutputSchema.safeParse(tooManyTextures).success, "provider schema enforces the texture tag limit");
const freeFormIngredient = structuredClone(modelOutput);
freeFormIngredient.categories[0].dishes[0].consistency.ingredients = [
  { name: "synthetic preserved ingredient", basis: "uncertain" },
];
verify(MenuImageModelOutputSchema.safeParse(freeFormIngredient).success, "provider schema keeps ingredient names free-form");
const emptyUnknown = structuredClone(modelOutput);
Object.assign(emptyUnknown.categories[0].dishes[0].consistency, {
  basicTastes: [],
  flavorNotes: [],
  heatLevel: "unknown",
  richnessLevel: "unknown",
  textures: [],
  ingredients: [],
});
verify(MenuImageModelOutputSchema.safeParse(emptyUnknown).success, "provider schema accepts empty axes and unknown levels");
const providerWording = structuredClone(modelOutput) as unknown as Record<string, unknown>;
const providerCategories = providerWording.categories as Array<Record<string, unknown>>;
const providerDishes = providerCategories[0]?.dishes as Array<Record<string, unknown>>;
providerDishes[0].consistencyWording = "Model-written copy";
verify(!MenuImageModelOutputSchema.safeParse(providerWording).success, "provider schema rejects model-written final wording");

const imageA = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1]);
const imageB = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const transient = (
  id: string,
  bytes: Uint8Array,
  mediaType: "image/jpeg" | "image/png",
): TransientImageInput => ({
  id,
  fileName: null,
  mediaType,
  byteLength: bytes.byteLength,
  async read() {
    return bytes.slice();
  },
});

const events: string[] = [];
let providerCalls = 0;
const provider: MenuVisionProvider = {
  modelVersion,
  async analyzeMenuImages(input: MenuVisionProviderInput) {
    events.push("provider");
    providerCalls += 1;
    verify(input.images.map((image) => image.index).join(",") === "0,1", "provider receives images in selection order");
    return structuredClone(modelOutput);
  },
};

const orderedHashes = ["1".repeat(64), "2".repeat(64)];
let hashIndex = 0;
const analyzer = createMenuImagesAnalyzer({
  createProvider: () => provider,
  async createImageHash() {
    events.push(`hash-${hashIndex}`);
    return orderedHashes[hashIndex++];
  },
  async createSourceIdentity(input) {
    events.push("source");
    verify(input.imageCount === 2, "source identity records image count");
    verify(input.orderedImageContentHashes.join(",") === orderedHashes.join(","), "source identity records ordered image hashes");
    return createSourceFingerprint(input);
  },
});

const analysis = (await analyzeFoodseyoInput(
  {
    type: "menu_images",
    images: [
      transient("image-a", imageA, "image/jpeg"),
      transient("image-b", imageB, "image/png"),
    ],
    userEnteredRestaurantName: null,
    location: null,
  },
  {
    analyzerRegistry: createAnalyzerRegistry({ menu_images: analyzer }),
    createAnalysisId: () => "synthetic-live-consistency-analysis",
    now: () => new Date("2026-07-16T12:00:00.000Z"),
  },
)) as ConsistentFoodseyoAnalysis;

verify(events.join(",") === "hash-0,hash-1,source,provider", "source fingerprint is complete before the provider call");
verify(providerCalls === 1, "live integration invokes exactly one provider call");
verify(analysis.schemaVersion === FOODSEYO_ANALYSIS_SCHEMA_VERSION, "new live analysis emits canonical 1.1.1");
verify(FoodseyoAnalysisSchema.safeParse(analysis).success, "canonical vNext envelope parses");
verify(analysis.analysisMetadata.versions.modelVersion === modelVersion, "metadata records the effective model version");
verify(analysis.analysisMetadata.versions.promptVersion === MENU_IMAGE_PROMPT_VERSION, "metadata records the prompt version");
verify(analysis.analysisMetadata.versions.providerSchemaVersion === MENU_IMAGE_PROVIDER_SCHEMA_VERSION, "metadata records the provider schema version");
verify(analysis.analysisMetadata.versions.canonicalSchemaVersion === FOODSEYO_ANALYSIS_SCHEMA_VERSION, "metadata records the canonical schema version");
verify(analysis.analysisMetadata.versions.consistencyProfileVersion === "foodseyo-consistency-v1", "metadata records the consistency profile version");
verify(analysis.payload.restaurantResolution.status === "unconfirmed" && analysis.payload.restaurantResolution.basis === "none" && analysis.payload.restaurantResolution.scope === "unknown", "no restaurant evidence stays conservatively unresolved");

const dish = analysis.payload.menu?.dishes[0];
if (!dish) throw new Error("Synthetic vNext dish is required.");
verify(validateAnalysisConsistency({ versions: analysis.analysisMetadata.versions, consistency: dish.consistency }).length === 0, "stored live consistency passes the C1 validator");
verify(dish.consistency.basicTastes.map((taste) => taste.value).join(",") === "sweet,savory", "basic tastes use profile order");
verify(dish.consistencyWording.basicTastes === "Mostly savory, with mild sweetness.", "live result stores natural deterministic taste wording");
verify(dish.consistencyWording.flavorNotes === "Herbal and garlicky.", "live result stores deterministic flavor wording");
verify(dish.consistencyWording.heat === "Mild heat.", "live result stores deterministic heat wording");
verify(dish.consistencyWording.richness === "Moderately rich.", "live result stores deterministic richness wording");
verify(dish.consistencyWording.textures === "Tender and springy.", "live result stores deterministic texture wording");

const expectedDishFingerprint = await createDishFingerprint({
  sourceFingerprint: analysis.analysisMetadata.sourceFingerprint,
  sourceDishIdentifier: "menu-images:0,1:dish-1",
  sourceStatedName: "Synthetic noodles",
  sourceStatedDescription: "Noodles with garlic and herbs",
  sourceStatedCategoryLabel: "Mains",
  sourceStatedPrice: { amount: 12, currency: "USD", displayText: "$12" },
});
verify(dish.analysisIdentity.dishFingerprint === expectedDishFingerprint, "dish fingerprint uses source-stated evidence only");
verify(dish.analysisIdentity.resultFingerprint === (await createAnalysisResultFingerprint({ dishFingerprint: expectedDishFingerprint, consistency: dish.consistency, versions: analysis.analysisMetadata.versions })), "result fingerprint is separate and includes normalized result identity");
const previousVersions = createAnalysisConsistencyVersionMetadata({
  modelVersion,
  promptVersion: MENU_IMAGE_PROMPT_VERSION,
  providerSchemaVersion: MENU_IMAGE_PROVIDER_SCHEMA_VERSION,
  canonicalSchemaVersion: FOODSEYO_ANALYSIS_PREVIOUS_SCHEMA_VERSION,
});
verify(
  dish.analysisIdentity.resultFingerprint !==
    (await createAnalysisResultFingerprint({
      dishFingerprint: expectedDishFingerprint,
      consistency: dish.consistency,
      versions: previousVersions,
    })),
  "result fingerprint changes when canonical schema version changes from 1.1.0 to 1.1.1",
);
verify(!JSON.stringify(analysis).includes(orderedHashes[0]) && !JSON.stringify(analysis).includes(orderedHashes[1]), "canonical result stores no ordered image content hashes");
verify(!JSON.stringify(analysis).includes("Uint8Array") && !JSON.stringify(analysis).includes("base64"), "canonical result stores no raw image or Base64 payload");

const adaptRestaurantCase = async (
  restaurantSignals: MenuImageModelOutput["restaurantSignals"],
  userEnteredRestaurantName: string | null,
) =>
  adaptMenuImageModelOutput({
    modelOutput: { ...structuredClone(modelOutput), restaurantSignals: [...restaurantSignals] },
    imageCount: 2,
    userEnteredRestaurantName,
    sourceFingerprint: analysis.analysisMetadata.sourceFingerprint,
    versions: analysis.analysisMetadata.versions,
  });

const userOnly = await adaptRestaurantCase([], "  User Declared Cafe  ");
verify(
  userOnly.restaurantResolution.status === "likely" &&
    userOnly.restaurantResolution.basis === "user_declared" &&
    userOnly.restaurantResolution.scope === "restaurant" &&
    userOnly.restaurantResolution.displayName === "User Declared Cafe" &&
    userOnly.restaurant === null,
  "a user-declared restaurant without source corroboration is likely, never confirmed",
);

const sourceOnly = await adaptRestaurantCase(
  [{ kind: "name", value: "Source Stated Cafe", sourceImageIndex: 0 }],
  null,
);
verify(
  sourceOnly.restaurantResolution.status === "confirmed" &&
    sourceOnly.restaurantResolution.basis === "source_stated" &&
    sourceOnly.restaurantResolution.scope === "restaurant" &&
    sourceOnly.restaurant?.name === "Source Stated Cafe",
  "a source-stated restaurant name confirms restaurant-level identity",
);

const corroborated = await adaptRestaurantCase(
  [{ kind: "logo_text", value: "source stated cafe", sourceImageIndex: 0 }],
  "Source-Stated Cafe",
);
verify(
  corroborated.restaurantResolution.status === "confirmed" &&
    corroborated.restaurantResolution.basis === "source_and_user" &&
    corroborated.restaurantResolution.scope === "restaurant",
  "compatible user and source names produce confirmed source-and-user provenance",
);

const conflicting = await adaptRestaurantCase(
  [{ kind: "name", value: "Different Source Cafe", sourceImageIndex: 0 }],
  "User Declared Cafe",
);
verify(
  conflicting.restaurantResolution.status === "unconfirmed" &&
    conflicting.restaurantResolution.basis === "source_and_user" &&
    conflicting.restaurantResolution.scope === "unknown" &&
    conflicting.restaurantResolution.conflictCode === "restaurant_name_mismatch" &&
    conflicting.restaurantResolution.selectedCandidateId === null &&
    conflicting.restaurantResolution.displayName === undefined &&
    conflicting.restaurant === null,
  "conflicting user and source names remain unconfirmed without silently selecting one identity",
);
verify(
  conflicting.restaurantResolution.candidates.length === 2 &&
    conflicting.restaurantResolution.candidates.some((candidate) => candidate.name === "User Declared Cafe") &&
    conflicting.restaurantResolution.candidates.some((candidate) => candidate.name === "Different Source Cafe"),
  "restaurant-name conflict preserves two separate candidates without combining names",
);

const locationOnly = await adaptRestaurantCase(
  [{ kind: "address", value: "100 Synthetic Avenue", sourceImageIndex: 0 }],
  null,
);
verify(
  locationOnly.restaurantResolution.status === "unconfirmed" &&
    locationOnly.restaurantResolution.basis === "location_only" &&
    locationOnly.restaurantResolution.scope === "unknown" &&
    locationOnly.restaurant === null,
  "location-only evidence never confirms a restaurant or branch",
);

const branchSpecific = await adaptRestaurantCase(
  [
    { kind: "name", value: "Source Stated Cafe", sourceImageIndex: 0 },
    { kind: "address", value: "100 Synthetic Avenue", sourceImageIndex: 0 },
  ],
  null,
);
verify(
  branchSpecific.restaurantResolution.status === "confirmed" &&
    branchSpecific.restaurantResolution.scope === "branch" &&
    branchSpecific.restaurant?.address === "100 Synthetic Avenue",
  "branch scope requires preserved branch-specific source evidence",
);
verify(
  [userOnly, sourceOnly, corroborated, conflicting, locationOnly, branchSpecific].every(
    (payload) =>
      payload.menu?.dishes[0]?.analysisIdentity.dishFingerprint ===
      dish.analysisIdentity.dishFingerprint,
  ),
  "restaurant-resolution provenance does not change the source or dish fingerprint inputs",
);
verify(
  [userOnly, sourceOnly, corroborated, conflicting, locationOnly, branchSpecific].every(
    (payload) => validateAnalysisSemantics(payload).errors.length === 0,
  ),
  "all deterministic restaurant-resolution cases pass semantic validation",
);
const invalidUserConfirmation = structuredClone(userOnly);
invalidUserConfirmation.restaurantResolution.status = "confirmed";
invalidUserConfirmation.restaurantResolution.confirmedBy = "explicit_input";
verify(
  validateAnalysisSemantics(invalidUserConfirmation).errors.some(
    (error) => error.code === "RESTAURANT_PROVENANCE_INVALID",
  ),
  "semantic validation rejects user declaration as confirmed restaurant identity",
);

const serialized = serializeCurrentAnalysis(analysis);
const currentRead = parseCurrentAnalysisStorageValue(serialized);
verify(currentRead.status === "success", "session storage accepts canonical 1.1.1");
verify(
  currentRead.status === "success" &&
    getRestaurantResolutionProvenance(currentRead.analysis.payload.restaurantResolution).basis === "none" &&
    getRestaurantResolutionProvenance(currentRead.analysis.payload.restaurantResolution).scope === "unknown",
  "canonical 1.1.1 restaurant provenance survives serialization and storage readback",
);

const previousCandidate = structuredClone(analysis) as unknown as Record<string, unknown>;
previousCandidate.schemaVersion = FOODSEYO_ANALYSIS_PREVIOUS_SCHEMA_VERSION;
const previousPayload = previousCandidate.payload as Record<string, unknown>;
const previousResolution = previousPayload.restaurantResolution as Record<string, unknown>;
delete previousResolution.basis;
delete previousResolution.scope;
delete previousResolution.displayName;
delete previousResolution.conflictCode;
const previousMetadata = previousCandidate.analysisMetadata as Record<string, unknown>;
const previousMetadataVersions = previousMetadata.versions as Record<string, unknown>;
previousMetadataVersions.canonicalSchemaVersion = FOODSEYO_ANALYSIS_PREVIOUS_SCHEMA_VERSION;
const previousRead = parseCurrentAnalysisStorageValue(JSON.stringify(previousCandidate));
verify(previousRead.status === "success", "session storage still accepts canonical 1.1.0 without provenance fields");
verify(
  previousRead.status === "success" &&
    getRestaurantResolutionProvenance(previousRead.analysis.payload.restaurantResolution).basis === "none" &&
    getRestaurantResolutionProvenance(previousRead.analysis.payload.restaurantResolution).scope === "unknown" &&
    createLiveAnalysisOverview(previousRead.analysis).categories.length > 0,
  "canonical 1.1.0 receives conservative reader fallback and remains renderable",
);
verify(demoFoodseyoAnalysis.schemaVersion === FOODSEYO_ANALYSIS_LEGACY_SCHEMA_VERSION, "legacy demo remains canonical 1.0.0");
verify(parseCurrentAnalysisStorageValue(serializeCurrentAnalysis(demoFoodseyoAnalysis)).status === "success", "session storage still accepts canonical 1.0.0");
const futureVersion = JSON.parse(serialized) as Record<string, unknown>;
futureVersion.schemaVersion = "2.0.0";
verify(parseCurrentAnalysisStorageValue(JSON.stringify(futureVersion)).status === "unsupported-version", "unsupported future canonical versions keep the safe recovery boundary");

const overview = createLiveAnalysisOverview(analysis);
const detail = createLiveDishDetail(analysis, dish.id);
verify(overview.categories[0]?.dishes[0]?.labels[0] === dish.consistencyWording.basicTastes, "vNext Overview uses deterministic wording rather than legacy free text");
verify(detail?.expectations.includes("Mild heat.") === true, "vNext Dish Detail uses deterministic heat wording");
verify(detail?.statedIngredients.join(",") === "garlic,noodles", "Dish Detail separates stated ingredients");
verify(detail?.typicalIngredients.join(",") === "sesame oil", "Dish Detail separates typical ingredients");
verify(detail?.uncertainIngredientsSummary === "Some ingredients could not be confirmed.", "Dish Detail summarizes uncertain ingredients without a tag");
verify(detail?.allergySafetyNotice.includes("cannot guarantee allergy safety") === true, "allergy safety notice remains present");
verify(!("consistency" in (demoFoodseyoAnalysis.payload.menu?.dishes[0] ?? {})), "legacy results are not backfilled with inferred consistency");

const degraded = finalizeLiveDishConsistency(
  {
    basicTastes: [
      { value: "Umami", intensity: 2 },
      { value: "savory", intensity: 3 },
      { value: "rich", intensity: 3 },
    ],
    flavorNotes: ["garlic-forward", "fresh"],
    heatLevel: "warmly spiced",
    richnessLevel: "heavy",
    textures: ["dense", "airy"],
    ingredients: [
      { name: " Cumin ", basis: "typical" },
      { name: "cumin", basis: "stated" },
      { name: "", basis: "uncertain" },
    ],
  },
  createMenuAnalysisVersionMetadata(modelVersion),
);
verify(degraded.degraded, "normalization reports a degraded synthetic result");
verify(degraded.consistency.basicTastes.length === 1 && degraded.consistency.basicTastes[0]?.value === "savory" && degraded.consistency.basicTastes[0]?.intensity === 3, "normalization aliases and merges basic tastes deterministically");
verify(degraded.consistency.heatLevel === "unknown" && degraded.consistency.richnessLevel === "unknown", "invalid heat and richness degrade to unknown");
verify(degraded.consistency.textures.length === 0, "defined texture contradiction degrades to an empty texture axis");
verify(degraded.consistency.ingredients.length === 1 && degraded.consistency.ingredients[0]?.basis === "stated", "malformed ingredients are removed and evidence conflicts favor stated");
verify(validateAnalysisConsistency({ versions: createMenuAnalysisVersionMetadata(modelVersion), consistency: degraded.consistency }).length === 0, "degraded result passes one final semantic validation");

let blockedProviderCalls = 0;
const blockedProvider: MenuVisionProvider = {
  modelVersion,
  async analyzeMenuImages() {
    blockedProviderCalls += 1;
    return structuredClone(modelOutput);
  },
};
const blockedAnalyzer = createMenuImagesAnalyzer({
  createProvider: () => blockedProvider,
  async createImageHash() {
    throw new Error("synthetic hash failure");
  },
});
const sourceFailure = await captureError(() =>
  blockedAnalyzer.analyze(
    {
      type: "menu_images",
      images: [transient("blocked", imageA, "image/jpeg")],
      userEnteredRestaurantName: null,
      location: null,
    },
    { signal: null },
  ),
);
verify(sourceFailure instanceof MenuAnalysisError && sourceFailure.code === "CANONICAL_ADAPTER_FAILED", "source fingerprint failure uses a safe typed boundary");
verify(blockedProviderCalls === 0, "source fingerprint failure prevents the provider call");

const request = buildOpenAIMenuResponseRequest(
  {
    images: [{ index: 0, mediaType: "image/jpeg", bytes: imageA }],
    userEnteredRestaurantName: null,
    signal: null,
  },
  "gpt-5.6",
);
verify(request.store === false, "Responses request remains store false");
verify(request.reasoning.effort === "low" && request.max_output_tokens === 12_000, "reasoning effort and output token limit are unchanged");
verify(!("tools" in request), "Responses request enables no tools or web search");
verify(MENU_IMAGE_DEVELOPER_PROMPT.includes("stated only") && MENU_IMAGE_DEVELOPER_PROMPT.includes("Spiced does not mean spicy"), "live prompt states evidence and conservative heat rules");
verify(!MENU_IMAGE_DEVELOPER_PROMPT.includes("customer reviews") || MENU_IMAGE_DEVELOPER_PROMPT.includes("Do not generate customer reviews"), "live prompt forbids generated reviews");
verify(network.callCount === 0, "integration evaluation made zero external network calls");
network.restore();

report();
