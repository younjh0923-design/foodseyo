import { demoFoodseyoAnalysis } from "../src/data/demoFoodseyoAnalysis.ts";
import {
  DishImageSchema,
  FoodseyoAnalysisPayloadSchema,
  FoodseyoAnalysisSchema,
  type FoodseyoAnalysisPayload,
} from "../src/domain/foodseyo-analysis.ts";
import {
  AnalysisCapabilityUnavailableError,
  analyzeFoodseyoInput,
  analyzerRegistry,
  deriveAnalysisIssues,
  deriveAnalysisStatus,
  isDishImageReusableForDisplay,
  validateAnalysisSemantics,
  type AnalysisCapability,
  type AnalysisDraft,
  type SemanticRuleCode,
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

const notReusableImage = structuredClone(canonicalKhaoSoi.image);
notReusableImage.rightsStatus = "not_reusable";
verify(
  !isDishImageReusableForDisplay(notReusableImage),
  "not-reusable image is rejected by display helper",
);

verify(
  !DishImageSchema.safeParse({
    ...canonicalKhaoSoi.image,
    sourceType: "ai_generated",
  }).success,
  "AI-generated image source remains rejected by Zod",
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
  ) !== "failed",
  "unconfirmed restaurant with useful menu is not failed",
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

const transientImage = {
  id: "transient-menu-image",
  fileName: "menu.jpg",
  mediaType: "image/jpeg",
  byteLength: 1,
  read: async () => new Uint8Array([0]),
};
let unavailableAnalyzerError: unknown = null;
try {
  await analyzeFoodseyoInput({
    type: "menu_images",
    images: [transientImage],
    userEnteredRestaurantName: null,
    location: null,
  });
} catch (error) {
  unavailableAnalyzerError = error;
}
verify(
  unavailableAnalyzerError instanceof AnalysisCapabilityUnavailableError,
  "unimplemented analyzer returns a typed capability error",
);
verify(
  unavailableAnalyzerError instanceof AnalysisCapabilityUnavailableError &&
    unavailableAnalyzerError.inputType === "menu_images" &&
    unavailableAnalyzerError.code === "ANALYZER_CAPABILITY_UNAVAILABLE",
  "unimplemented menu analyzer never returns demo data",
);

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

verify(
  Object.keys(analyzerRegistry).sort().join(",") ===
    "demo,menu_images,nearby_search,restaurant_link,restaurant_photo,restaurant_screen",
  "analyzer registry covers all six input types",
);

verify(
  demoFoodseyoAnalysis.payload.menu?.dishes[0].id === "khao-soi",
  "orchestration tests do not mutate the canonical demo fixture",
);

console.log(`Foodseyo analysis orchestration validation: ${passedChecks.length} checks passed.`);
