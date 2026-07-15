import { demoFoodseyoAnalysis } from "../src/data/demoFoodseyoAnalysis.ts";
import {
  DishImageSchema,
  FoodseyoAnalysisPayloadSchema,
  FoodseyoAnalysisSchema,
  type AnalysisIssue,
  type DishImage,
  type FoodseyoAnalysisPayload,
} from "../src/domain/foodseyo-analysis.ts";
import {
  AnalysisCapabilityUnavailableError,
  analyzeFoodseyoInput,
  analyzerRegistry,
  deduplicateAnalysisIssues,
  deriveAnalysisIssues,
  deriveAnalysisStatus,
  getReusableDishImageSource,
  isDishImageReusableForDisplay,
  validateAnalysisSemantics,
  type AnalysisCapability,
  type AnalysisDraft,
  type AnalyzeFoodseyoRequest,
  type SemanticRuleCode,
  type TransientImageInput,
} from "../src/services/analysis/index.ts";

const passedChecks: string[] = [];

const verify = (condition: boolean, label: string) => {
  if (!condition) throw new Error(`Orchestration validation failed: ${label}`);
  passedChecks.push(label);
};

const clonePayload = (): FoodseyoAnalysisPayload =>
  FoodseyoAnalysisPayloadSchema.parse(structuredClone(demoFoodseyoAnalysis.payload));

const hasSemanticError = (
  payload: FoodseyoAnalysisPayload,
  code: SemanticRuleCode,
): boolean => validateAnalysisSemantics(payload).errors.some((error) => error.code === code);

const draftFor = (
  payload: FoodseyoAnalysisPayload,
  coreCapability: AnalysisCapability,
  degradedCapabilities: readonly AnalysisCapability[] = [],
): AnalysisDraft => ({
  inputContext: demoFoodseyoAnalysis.inputContext,
  payloadCandidate: payload,
  operationalIssues: [],
  completedCapabilities: [coreCapability],
  degradedCapabilities,
  coreCapability,
});

const fixedTimestamp = "2026-07-15T12:00:00.000Z";
const canonicalFixtureBeforeAnalysis = JSON.stringify(demoFoodseyoAnalysis);
const demoResult = await analyzeFoodseyoInput(
  { type: "demo", fixtureId: "pai-northern-thai-kitchen" },
  {
    createAnalysisId: () => "test-analysis-id",
    now: () => new Date(fixedTimestamp),
  },
);

verify(demoResult.inputContext.type === "demo", "demo request passes through dispatcher");
verify(FoodseyoAnalysisSchema.safeParse(demoResult).success, "demo result passes final schema");
verify(
  demoResult.analysisId === "test-analysis-id" && demoResult.generatedAt === fixedTimestamp,
  "deterministic ID and timestamp injection works",
);
verify(typeof JSON.stringify(demoResult) === "string", "demo result is JSON serializable");

const canonicalKhaoSoi = demoFoodseyoAnalysis.payload.menu?.dishes.find(
  (dish) => dish.id === "khao-soi",
);
if (!canonicalKhaoSoi) throw new Error("Orchestration tests require Khao Soi.");

verify(
  canonicalKhaoSoi.restaurantSpecific.confirmedIngredients.values.length === 0 &&
    canonicalKhaoSoi.restaurantSpecific.confirmedIngredients.availability === "unknown",
  "confirmed ingredients do not reuse protein options",
);
verify(
  canonicalKhaoSoi.restaurantSpecific.proteinOptions.values.join(",") === "Chicken,Beef",
  "protein options remain available",
);
const canonicalVeganAssessment = canonicalKhaoSoi.dietary.items.find(
  (item) => item.key === "vegan",
);
verify(
  canonicalVeganAssessment?.status === "confirm_with_staff" &&
    canonicalVeganAssessment.explanation ===
      "The listed demo options are chicken and beef, but vegan availability was not confirmed." &&
    canonicalVeganAssessment.basis === "direct_observation" &&
    canonicalVeganAssessment.sourceIds.includes("demo-menu-fixture") &&
    canonicalVeganAssessment.limitation ===
      "Confirm current ingredients, broth, preparation, and modification options with staff.",
  "demo vegan assessment conservatively requires staff confirmation",
);

const confirmedByMissing = clonePayload();
confirmedByMissing.restaurantResolution.confirmedBy = null;
verify(
  hasSemanticError(confirmedByMissing, "CONFIRMED_BY_MISSING"),
  "confirmed restaurant without confirmedBy is rejected",
);

const confirmedRestaurantMissing = clonePayload();
confirmedRestaurantMissing.restaurant = null;
verify(
  hasSemanticError(confirmedRestaurantMissing, "CONFIRMED_RESTAURANT_MISSING"),
  "confirmed restaurant without restaurant data is rejected",
);

const likelyWithoutCandidate = clonePayload();
likelyWithoutCandidate.restaurantResolution.status = "likely";
likelyWithoutCandidate.restaurantResolution.candidates = [];
likelyWithoutCandidate.restaurantResolution.selectedCandidateId = null;
likelyWithoutCandidate.restaurantResolution.confirmedBy = null;
verify(
  hasSemanticError(likelyWithoutCandidate, "LIKELY_CANDIDATE_MISSING"),
  "likely status without a candidate is rejected",
);

const invalidSelectedCandidate = clonePayload();
invalidSelectedCandidate.restaurantResolution.selectedCandidateId = "missing-candidate";
verify(
  hasSemanticError(invalidSelectedCandidate, "SELECTED_CANDIDATE_MISSING"),
  "selected candidate must reference an actual candidate",
);

const missingEvidenceReference = clonePayload();
if (!missingEvidenceReference.menu) throw new Error("Demo menu is required.");
missingEvidenceReference.menu.sourceIds = ["missing-evidence"];
verify(
  hasSemanticError(missingEvidenceReference, "EVIDENCE_REFERENCE_MISSING"),
  "missing evidence references are rejected",
);

const duplicateDish = clonePayload();
if (!duplicateDish.menu) throw new Error("Demo menu is required.");
duplicateDish.menu.dishes.push(structuredClone(duplicateDish.menu.dishes[0]));
verify(
  hasSemanticError(duplicateDish, "DUPLICATE_DISH_ID"),
  "duplicate dish IDs are rejected",
);

const invalidCategoryReference = clonePayload();
if (!invalidCategoryReference.menu) throw new Error("Demo menu is required.");
invalidCategoryReference.menu.dishes[0].categoryId = "missing-category";
verify(
  hasSemanticError(invalidCategoryReference, "DISH_CATEGORY_REFERENCE_MISSING"),
  "dish category IDs must reference actual categories",
);

const invalidFeaturedDish = clonePayload();
if (!invalidFeaturedDish.menu) throw new Error("Demo menu is required.");
invalidFeaturedDish.menu.featuredDishIds = ["missing-dish"];
verify(
  hasSemanticError(invalidFeaturedDish, "FEATURED_DISH_REFERENCE_MISSING"),
  "featured dish IDs must reference actual dishes",
);

const invalidPriceEvidence = clonePayload();
if (!invalidPriceEvidence.menu) throw new Error("Demo menu is required.");
invalidPriceEvidence.menu.dishes[0].priceEvidence.availability = "unavailable";
verify(
  hasSemanticError(invalidPriceEvidence, "PRICE_EVIDENCE_MISMATCH"),
  "available prices require available price evidence",
);

const insufficientReview = clonePayload();
if (!insufficientReview.menu) throw new Error("Demo menu is required.");
insufficientReview.menu.dishes[0].reviews = {
  status: "insufficient",
  sourceGroupCount: 0,
  evidenceCount: 0,
  freshness: null,
  repeatedPositives: [],
  repeatedNegatives: [],
  disagreements: [],
  rationale: null,
  sourceIds: [],
  limitation: "No review evidence was available.",
};
verify(
  validateAnalysisSemantics(insufficientReview).errors.length === 0,
  "reasonable insufficient review structure is accepted",
);

const strongReviewWithoutEvidenceCount = clonePayload();
if (!strongReviewWithoutEvidenceCount.menu) throw new Error("Demo menu is required.");
strongReviewWithoutEvidenceCount.menu.dishes[0].reviews.evidenceCount = 0;
verify(
  hasSemanticError(strongReviewWithoutEvidenceCount, "REVIEW_COUNT_MISMATCH"),
  "strong review consensus with zero evidence is rejected",
);

const verifiedFreshnessWithoutOfficialEvidence = clonePayload();
if (!verifiedFreshnessWithoutOfficialEvidence.menu) throw new Error("Demo menu is required.");
verifiedFreshnessWithoutOfficialEvidence.menu.freshness.status =
  "verified_against_official_source";
verifiedFreshnessWithoutOfficialEvidence.menu.freshness.checkedAt = fixedTimestamp;
verify(
  hasSemanticError(
    verifiedFreshnessWithoutOfficialEvidence,
    "FRESHNESS_OFFICIAL_SOURCE_MISSING",
  ),
  "verified freshness requires official evidence",
);

const unavailableImageWithUrl = clonePayload();
if (!unavailableImageWithUrl.menu) throw new Error("Demo menu is required.");
unavailableImageWithUrl.menu.dishes[0].image = {
  ...unavailableImageWithUrl.menu.dishes[0].image,
  sourceType: "unavailable",
  url: "https://example.com/should-not-exist.jpg",
  localAssetPath: null,
  restaurantSpecific: false,
  userFacingLabel: "Image unavailable",
  rightsStatus: "unknown",
};
verify(
  hasSemanticError(unavailableImageWithUrl, "IMAGE_UNAVAILABLE_MISMATCH"),
  "unavailable image with a URL is rejected",
);

const restaurantSpecificGeneralReference = clonePayload();
if (!restaurantSpecificGeneralReference.menu) throw new Error("Demo menu is required.");
restaurantSpecificGeneralReference.menu.dishes[0].image = {
  ...restaurantSpecificGeneralReference.menu.dishes[0].image,
  sourceType: "general_reference",
  url: "https://example.com/reference.jpg",
  localAssetPath: null,
  sourcePageUrl: "https://example.com/source",
  restaurantSpecific: true,
  rightsStatus: "cleared",
  limitation: "Actual presentation may differ.",
};
verify(
  hasSemanticError(
    restaurantSpecificGeneralReference,
    "GENERAL_REFERENCE_RESTAURANT_SPECIFIC",
  ),
  "general reference cannot be restaurant-specific",
);

const generalReferenceWithoutLimitation = clonePayload();
if (!generalReferenceWithoutLimitation.menu) throw new Error("Demo menu is required.");
generalReferenceWithoutLimitation.menu.dishes[0].image = {
  ...generalReferenceWithoutLimitation.menu.dishes[0].image,
  sourceType: "general_reference",
  url: "https://example.com/reference.jpg",
  localAssetPath: null,
  sourcePageUrl: "https://example.com/source",
  restaurantSpecific: false,
  rightsStatus: "cleared",
  limitation: null,
};
verify(
  hasSemanticError(
    generalReferenceWithoutLimitation,
    "GENERAL_REFERENCE_LIMITATION_MISSING",
  ),
  "general reference requires presentation limitation",
);

const sessionScreenImage = clonePayload();
if (!sessionScreenImage.menu) throw new Error("Demo menu is required.");
sessionScreenImage.menu.dishes[0].image = {
  ...sessionScreenImage.menu.dishes[0].image,
  sourceType: "user_provided_screen",
  url: "https://example.com/session-image.jpg",
  localAssetPath: null,
  sourcePageUrl: null,
  restaurantSpecific: false,
  rightsStatus: "session_only",
  limitation: "Session evidence only; do not redistribute.",
};
verify(
  validateAnalysisSemantics(sessionScreenImage).errors.length === 0,
  "user-provided screen with session-only rights is accepted",
);

const imageWith = (overrides: Partial<DishImage>): DishImage => ({
  ...structuredClone(canonicalKhaoSoi.image),
  ...overrides,
});

const verifyImageDisplayPolicy = (
  image: DishImage,
  expectedSource: string | null,
  label: string,
) => {
  verify(
    isDishImageReusableForDisplay(image) === (expectedSource !== null) &&
      getReusableDishImageSource(image) === expectedSource,
    label,
  );
};

verifyImageDisplayPolicy(
  canonicalKhaoSoi.image,
  "/images/thai-dishes.png",
  "cleared demo local asset remains displayable",
);
verifyImageDisplayPolicy(
  imageWith({
    url: "https://example.com/cleared.jpg",
    localAssetPath: null,
    rightsStatus: "cleared",
  }),
  "https://example.com/cleared.jpg",
  "cleared image URL is displayable",
);
verifyImageDisplayPolicy(
  imageWith({ url: null, localAssetPath: null, rightsStatus: "cleared" }),
  null,
  "cleared image without a source is not displayable",
);
verifyImageDisplayPolicy(
  imageWith({ rightsStatus: "session_only" }),
  null,
  "session-only image is not displayable",
);
verifyImageDisplayPolicy(
  imageWith({ rightsStatus: "not_reusable" }),
  null,
  "not-reusable image is not displayable",
);
verifyImageDisplayPolicy(
  imageWith({ rightsStatus: "unknown" }),
  null,
  "unknown-rights image is not displayable",
);
verifyImageDisplayPolicy(
  imageWith({ rightsStatus: "attribution_required", attribution: "Example source" }),
  null,
  "attribution-required image remains hidden before attribution UI exists",
);

const attributionMissing = clonePayload();
if (!attributionMissing.menu) throw new Error("Demo menu is required.");
attributionMissing.menu.dishes[0].image = {
  ...attributionMissing.menu.dishes[0].image,
  rightsStatus: "attribution_required",
  attribution: " ",
};
verify(
  hasSemanticError(attributionMissing, "IMAGE_ATTRIBUTION_MISSING"),
  "attribution-required image without attribution metadata is rejected",
);

verifyImageDisplayPolicy(
  imageWith({
    sourceType: "unavailable",
    url: null,
    localAssetPath: null,
    sourcePageUrl: null,
    restaurantSpecific: false,
    userFacingLabel: "Image unavailable",
    attribution: null,
    rightsStatus: "unknown",
  }),
  null,
  "unavailable image is not displayable",
);

verify(
  !DishImageSchema.safeParse({
    ...canonicalKhaoSoi.image,
    sourceType: "ai_generated",
  }).success,
  "AI-generated image source remains rejected by Zod",
);

const completePayload = clonePayload();
const completeSemantics = validateAnalysisSemantics(completePayload);
verify(
  deriveAnalysisStatus(
    draftFor(completePayload, "demo_analysis"),
    completePayload,
    completeSemantics,
  ) === "complete",
  "completed core capability with a useful result is complete",
);

const incompleteCoreDraft: AnalysisDraft = {
  ...draftFor(completePayload, "demo_analysis"),
  completedCapabilities: [],
};
verify(
  deriveAnalysisStatus(incompleteCoreDraft, completePayload, completeSemantics) === "partial",
  "incomplete core capability with a useful result is partial",
);

verify(
  deriveAnalysisStatus(
    draftFor(completePayload, "demo_analysis", ["demo_analysis"]),
    completePayload,
    completeSemantics,
  ) === "partial",
  "degraded core capability with a useful result is partial",
);

const failedPayload = clonePayload();
failedPayload.restaurantResolution = {
  status: "unconfirmed",
  candidates: [],
  selectedCandidateId: null,
  confirmedBy: null,
  sourceIds: [],
  limitations: ["No usable result was produced."],
};
failedPayload.restaurant = null;
failedPayload.menu = null;
failedPayload.orderingGuidance = null;
const failedSemantics = validateAnalysisSemantics(failedPayload);
verify(
  deriveAnalysisStatus(
    draftFor(failedPayload, "menu_analysis"),
    failedPayload,
    failedSemantics,
  ) === "failed",
  "analysis without restaurant, menu dishes, or ordering guidance is failed",
);

const unconfirmedUsefulMenu = clonePayload();
unconfirmedUsefulMenu.restaurantResolution = {
  status: "unconfirmed",
  candidates: [],
  selectedCandidateId: null,
  confirmedBy: null,
  sourceIds: [],
  limitations: ["Restaurant identity was not confirmed."],
};
unconfirmedUsefulMenu.restaurant = null;
verify(
  hasSemanticError(unconfirmedUsefulMenu, "RESTAURANT_SPECIFIC_FACT_UNCONFIRMED"),
  "unconfirmed restaurant cannot retain confirmed restaurant-specific facts",
);
if (!unconfirmedUsefulMenu.menu) throw new Error("Demo menu is required.");
for (const dish of unconfirmedUsefulMenu.menu.dishes) {
  dish.restaurantSpecific.menuDescription = null;
  dish.restaurantSpecific.confirmedIngredients.availability = "unknown";
  dish.restaurantSpecific.confirmedIngredients.values = [];
  dish.restaurantSpecific.preparationDetails.availability = "unknown";
  dish.restaurantSpecific.preparationDetails.values = [];
  dish.restaurantSpecific.signatureStatus.availability = "unknown";
  dish.restaurantSpecific.signatureStatus.value = "unknown";
  dish.restaurantSpecific.proteinOptions.availability = "unknown";
  dish.restaurantSpecific.proteinOptions.values = [];
  dish.restaurantSpecific.modificationOptions.availability = "unknown";
  dish.restaurantSpecific.modificationOptions.values = [];
}
const unconfirmedSemantics = validateAnalysisSemantics(unconfirmedUsefulMenu);
verify(
  deriveAnalysisStatus(
    draftFor(unconfirmedUsefulMenu, "menu_analysis"),
    unconfirmedUsefulMenu,
    unconfirmedSemantics,
  ) === "complete",
  "unconfirmed restaurant with useful general menu remains complete",
);

const insufficientReviewSemantics = validateAnalysisSemantics(insufficientReview);
verify(
  deriveAnalysisStatus(
    draftFor(insufficientReview, "demo_analysis"),
    insufficientReview,
    insufficientReviewSemantics,
  ) === "complete",
  "insufficient reviews alone do not cause partial status",
);

const freshnessSemantics = validateAnalysisSemantics(clonePayload());
const freshnessPayload = clonePayload();
verify(
  deriveAnalysisStatus(
    draftFor(freshnessPayload, "demo_analysis"),
    freshnessPayload,
    freshnessSemantics,
  ) === "complete",
  "could-not-verify freshness alone does not cause partial status",
);

const dietaryPayload = clonePayload();
const dietarySemantics = validateAnalysisSemantics(dietaryPayload);
verify(
  deriveAnalysisStatus(
    draftFor(dietaryPayload, "demo_analysis"),
    dietaryPayload,
    dietarySemantics,
  ) === "complete",
  "dietary staff confirmation alone does not cause partial status",
);

const unavailableOptionalImage = clonePayload();
if (!unavailableOptionalImage.menu) throw new Error("Demo menu is required.");
unavailableOptionalImage.menu.dishes[0].image = {
  ...unavailableOptionalImage.menu.dishes[0].image,
  sourceType: "unavailable",
  url: null,
  localAssetPath: null,
  sourcePageUrl: null,
  restaurantSpecific: false,
  userFacingLabel: "Image unavailable",
  attribution: null,
  rightsStatus: "unknown",
};
const unavailableImageSemantics = validateAnalysisSemantics(unavailableOptionalImage);
verify(
  deriveAnalysisStatus(
    draftFor(unavailableOptionalImage, "demo_analysis"),
    unavailableOptionalImage,
    unavailableImageSemantics,
  ) === "complete",
  "unavailable optional image alone does not cause partial status",
);

const transientImage: TransientImageInput = {
  id: "transient-menu-image",
  fileName: "menu.jpg",
  mediaType: "image/jpeg",
  byteLength: 1,
  read: async () => new Uint8Array([0]),
};
const unavailableRequests: readonly AnalyzeFoodseyoRequest[] = [
  {
    type: "menu_images",
    images: [transientImage],
    userEnteredRestaurantName: null,
    location: null,
  },
  {
    type: "restaurant_photo",
    image: transientImage,
    userEnteredRestaurantName: null,
    location: null,
  },
  {
    type: "restaurant_screen",
    image: transientImage,
    sourcePlatformLabel: "Test screen",
    userEnteredRestaurantName: null,
    location: null,
  },
  {
    type: "restaurant_link",
    submittedUrl: "https://example.com/restaurant",
    userEnteredRestaurantName: null,
  },
  {
    type: "nearby_search",
    location: {
      latitude: 43.6532,
      longitude: -79.3832,
      label: "Test location",
    },
    selectedCandidateId: null,
    selectedByUser: false,
  },
];

const verifyUnavailableAnalyzer = async (request: AnalyzeFoodseyoRequest) => {
  let unavailableAnalyzerError: unknown = null;
  let returnedResult: unknown;
  try {
    returnedResult = await analyzeFoodseyoInput(request);
  } catch (error) {
    unavailableAnalyzerError = error;
  }

  verify(
    unavailableAnalyzerError instanceof AnalysisCapabilityUnavailableError,
    `${request.type} throws AnalysisCapabilityUnavailableError`,
  );
  verify(
    unavailableAnalyzerError instanceof AnalysisCapabilityUnavailableError &&
      unavailableAnalyzerError.code === "ANALYZER_CAPABILITY_UNAVAILABLE",
    `${request.type} preserves the stable capability error code`,
  );
  verify(
    unavailableAnalyzerError instanceof AnalysisCapabilityUnavailableError &&
      unavailableAnalyzerError.inputType === request.type,
    `${request.type} preserves the requested input type`,
  );
  verify(
    returnedResult === undefined && unavailableAnalyzerError !== null,
    `${request.type} returns no analysis and never falls back to demo data`,
  );
};

for (const request of unavailableRequests) {
  await verifyUnavailableAnalyzer(request);
}

const duplicateIssuePayload = clonePayload();
const duplicateWarning = {
  code: "MENU_FRESHNESS_UNVERIFIED" as const,
  severity: "info" as const,
  message: "Duplicate warning fixture.",
  relatedEntityIds: [],
  recoverable: true,
};
const deduplicatedIssues = deriveAnalysisIssues(
  duplicateIssuePayload,
  [duplicateWarning, duplicateWarning],
  [duplicateWarning],
  "complete",
  [],
);
verify(
  deduplicatedIssues.filter(
    (issue) => issue.code === "MENU_FRESHNESS_UNVERIFIED" && issue.relatedEntityIds.length === 0,
  ).length === 1,
  "issue derivation deduplicates code and related-entity combinations",
);

const issueFor = (
  severity: AnalysisIssue["severity"],
  relatedEntityIds: readonly string[],
  recoverable = true,
  code: AnalysisIssue["code"] = "MENU_FRESHNESS_UNVERIFIED",
): AnalysisIssue => ({
  code,
  severity,
  message: `${severity} ${code}`,
  relatedEntityIds: [...relatedEntityIds],
  recoverable,
});

const infoThenWarning = deduplicateAnalysisIssues([
  issueFor("info", ["dish-a"]),
  issueFor("warning", ["dish-a"]),
]);
verify(
  infoThenWarning.length === 1 &&
    infoThenWarning[0].severity === "warning" &&
    infoThenWarning[0].message === "warning MENU_FRESHNESS_UNVERIFIED",
  "issue merge upgrades info to warning and keeps the warning message",
);

const warningThenInfo = deduplicateAnalysisIssues([
  issueFor("warning", ["dish-a"]),
  issueFor("info", ["dish-a"]),
]);
verify(
  warningThenInfo.length === 1 && warningThenInfo[0].severity === "warning",
  "issue merge does not downgrade warning to info",
);

const errorThenWarning = deduplicateAnalysisIssues([
  issueFor("error", ["dish-a"]),
  issueFor("warning", ["dish-a"]),
]);
verify(
  errorThenWarning.length === 1 && errorThenWarning[0].severity === "error",
  "issue merge does not downgrade error to warning",
);

const strictRecoverability = deduplicateAnalysisIssues([
  issueFor("warning", ["dish-a"], true),
  issueFor("warning", ["dish-a"], false),
]);
verify(
  strictRecoverability.length === 1 && !strictRecoverability[0].recoverable,
  "issue merge preserves non-recoverable state",
);

const reversedEntityOrder = deduplicateAnalysisIssues([
  issueFor("info", ["dish-a", "dish-b"]),
  issueFor("warning", ["dish-b", "dish-a"]),
]);
verify(
  reversedEntityOrder.length === 1 &&
    reversedEntityOrder[0].severity === "warning" &&
    reversedEntityOrder[0].relatedEntityIds.join(",") === "dish-a,dish-b",
  "issue key treats reversed related-entity order as the same stable set",
);

const differentEntities = deduplicateAnalysisIssues([
  issueFor("info", ["dish-a"]),
  issueFor("warning", ["dish-b"]),
]);
verify(
  differentEntities.length === 2,
  "same issue code with different related entities remains separate",
);

const differentCodes = deduplicateAnalysisIssues([
  issueFor("info", ["dish-a"]),
  issueFor("warning", ["dish-a"], true, "REVIEW_EVIDENCE_INSUFFICIENT"),
]);
verify(differentCodes.length === 2, "different issue codes remain separate");

verify(
  Object.keys(analyzerRegistry).sort().join(",") ===
    "demo,menu_images,nearby_search,restaurant_link,restaurant_photo,restaurant_screen",
  "analyzer registry covers all six input types",
);

verify(
  JSON.stringify(demoFoodseyoAnalysis) === canonicalFixtureBeforeAnalysis,
  "orchestration preserves the complete canonical demo fixture",
);

console.log(`Foodseyo analysis orchestration validation: ${passedChecks.length} checks passed.`);
