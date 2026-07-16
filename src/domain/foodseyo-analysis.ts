import { z } from "zod";

export const FOODSEYO_ANALYSIS_SCHEMA_VERSION = "1.0.0" as const;

export const ALLERGY_SAFETY_NOTICE =
  "Recipes and preparation practices may change. Foodseyo cannot guarantee allergy safety. Confirm ingredients and cross-contact directly with restaurant staff." as const;

// Schema-v1 compatibility: restaurant_photo and restaurant_screen stay parseable,
// but T5.5 exposes no MVP UI, route, provider override, or successful live analyzer.
export const InputTypeSchema = z.enum([
  "menu_images",
  "restaurant_photo",
  "restaurant_screen",
  "restaurant_link",
  "nearby_search",
  "demo",
]);

export const AnalysisStatusSchema = z.enum(["complete", "partial", "failed"]);

export const RestaurantMatchStatusSchema = z.enum([
  "confirmed",
  "likely",
  "unconfirmed",
  "not_attempted",
]);

export const AvailabilitySchema = z.enum([
  "available",
  "unknown",
  "unavailable",
  "insufficient",
]);

export const ClaimBasisSchema = z.enum([
  "direct_observation",
  "external_source",
  "general_food_knowledge",
  "ai_inference",
  "user_confirmation",
  "deterministic_calculation",
]);

export const EvidenceSourceTypeSchema = z.enum([
  "official_menu",
  "official_website",
  "official_social",
  "uploaded_menu",
  "user_provided_screen",
  "public_web",
  "web_search_result",
  "platform_api_sample",
  "staff_confirmation",
  "demo_data",
]);

export const ReviewConsensusStatusSchema = z.enum([
  "strong",
  "moderate",
  "mixed",
  "insufficient",
]);

export const MenuFreshnessStatusSchema = z.enum([
  "verified_against_official_source",
  "possible_differences",
  "could_not_verify",
]);

export const DietaryStatusSchema = z.enum([
  "confirmed_present",
  "likely_present",
  "confirmed_absent",
  "may_be_modifiable",
  "unknown",
  "confirm_with_staff",
]);

export const DietaryKeySchema = z.enum([
  "peanuts",
  "tree_nuts",
  "shellfish",
  "dairy",
  "eggs",
  "gluten",
  "vegetarian",
  "vegan",
  "halal_preference",
  "gluten_avoidance",
  "cilantro",
  "coconut",
  "pork",
  "seafood",
  "cross_contact",
  "ingredient_details",
]);

export const IssueSeveritySchema = z.enum(["info", "warning", "error"]);

export const DishImageSourceSchema = z.enum([
  "uploaded_menu",
  "user_provided_screen",
  "official_menu",
  "official_website",
  "official_social",
  "general_reference",
  "demo_data",
  "unavailable",
]);

export const ImageRightsStatusSchema = z.enum([
  "cleared",
  "attribution_required",
  "session_only",
  "unknown",
  "not_reusable",
]);

export const RestaurantConfirmedBySchema = z.enum([
  "explicit_input",
  "direct_evidence",
  "user_confirmation",
  "nearby_selection",
]);

export const SignatureStatusSchema = z.enum([
  "confirmed_signature",
  "not_confirmed",
  "unknown",
]);

export const PriceLevelSchema = z.enum(["$", "$$", "$$$", "$$$$"]);

export const ANALYSIS_ISSUE_CODES = [
  "RESTAURANT_UNCONFIRMED",
  "RESTAURANT_MATCH_LIKELY",
  "REVIEW_EVIDENCE_INSUFFICIENT",
  "MENU_FRESHNESS_UNVERIFIED",
  "IMAGE_UNAVAILABLE",
  "IMAGE_NOT_REUSABLE",
  "DIETARY_CONFIRM_WITH_STAFF",
  "PRICE_UNKNOWN",
  "EXTERNAL_RESEARCH_FAILED",
  "ANALYSIS_PARTIAL",
] as const;

export const AnalysisIssueCodeSchema = z.enum(ANALYSIS_ISSUE_CODES);

const NullableUrlSchema = z.string().url().nullable();
const NullableIsoDateTimeSchema = z.string().datetime({ offset: true }).nullable();

export const EvidenceItemSchema = z.strictObject({
  id: z.string().min(1),
  sourceType: EvidenceSourceTypeSchema,
  title: z.string().min(1),
  url: NullableUrlSchema,
  sourceLabel: z.string().nullable(),
  retrievedAt: NullableIsoDateTimeSchema,
  publishedAt: NullableIsoDateTimeSchema,
  excerpt: z.string().nullable(),
  attribution: z.string().nullable(),
  limitations: z.array(z.string()),
});

export const ClaimEvidenceSchema = z.strictObject({
  availability: AvailabilitySchema,
  basis: ClaimBasisSchema,
  sourceIds: z.array(z.string().min(1)),
  limitation: z.string().nullable(),
});

const SessionStorageScopeSchema = z.literal("session_only");

export const MenuImagesInputContextSchema = z.strictObject({
  type: z.literal("menu_images"),
  imageCount: z.number().int().positive(),
  userEnteredRestaurantName: z.string().nullable(),
  locationUsed: z.boolean(),
  storageScope: SessionStorageScopeSchema,
});

/** @deprecated Schema-v1 compatibility only; unavailable in the active MVP. */
export const RestaurantPhotoInputContextSchema = z.strictObject({
  type: z.literal("restaurant_photo"),
  imageCount: z.number().int().positive(),
  userEnteredRestaurantName: z.string().nullable(),
  locationUsed: z.boolean(),
  storageScope: SessionStorageScopeSchema,
});

/** @deprecated Schema-v1 compatibility only; unavailable in the active MVP. */
export const RestaurantScreenInputContextSchema = z.strictObject({
  type: z.literal("restaurant_screen"),
  imageCount: z.number().int().positive(),
  sourcePlatformLabel: z.string().nullable(),
  userEnteredRestaurantName: z.string().nullable(),
  locationUsed: z.boolean(),
  storageScope: SessionStorageScopeSchema,
});

export const RestaurantLinkInputContextSchema = z.strictObject({
  type: z.literal("restaurant_link"),
  submittedUrl: z.string().url(),
  userEnteredRestaurantName: z.string().nullable(),
  storageScope: SessionStorageScopeSchema,
});

export const NearbySearchInputContextSchema = z.strictObject({
  type: z.literal("nearby_search"),
  locationUsed: z.boolean(),
  selectedCandidateId: z.string().nullable(),
  selectedByUser: z.boolean(),
  storageScope: SessionStorageScopeSchema,
});

export const DemoInputContextSchema = z.strictObject({
  type: z.literal("demo"),
  fixtureId: z.string().min(1),
  clearlyLabeledDemo: z.literal(true),
  storageScope: SessionStorageScopeSchema,
});

export const InputContextSchema = z.discriminatedUnion("type", [
  MenuImagesInputContextSchema,
  RestaurantPhotoInputContextSchema,
  RestaurantScreenInputContextSchema,
  RestaurantLinkInputContextSchema,
  NearbySearchInputContextSchema,
  DemoInputContextSchema,
]);

export const RestaurantCandidateSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullable(),
  website: NullableUrlSchema,
  cuisineLabels: z.array(z.string()),
  matchReasons: z.array(z.string()),
  sourceIds: z.array(z.string().min(1)),
  selectedByUser: z.boolean(),
});

export const RestaurantResolutionSchema = z.strictObject({
  status: RestaurantMatchStatusSchema,
  candidates: z.array(RestaurantCandidateSchema),
  selectedCandidateId: z.string().nullable(),
  confirmedBy: RestaurantConfirmedBySchema.nullable(),
  sourceIds: z.array(z.string().min(1)),
  limitations: z.array(z.string()),
});

export const PublicLocationSchema = z.strictObject({
  label: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const RestaurantSchema = z.strictObject({
  id: z.string().nullable(),
  name: z.string().nullable(),
  summary: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  website: NullableUrlSchema,
  cuisineLabels: z.array(z.string()),
  priceLevel: PriceLevelSchema.nullable(),
  publicLocation: PublicLocationSchema.nullable(),
  sourceIds: z.array(z.string().min(1)),
});

export const MoneySchema = z.strictObject({
  amount: z.number().finite().nonnegative(),
  currency: z.string().nullable(),
  displayText: z.string().min(1),
});

export const PriceOptionSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  price: MoneySchema.nullable(),
  priceEvidence: ClaimEvidenceSchema,
});

export const MenuOptionSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  additionalPrice: MoneySchema.nullable(),
  priceEvidence: ClaimEvidenceSchema,
});

export const GeneralDishKnowledgeSchema = z.strictObject({
  definition: z.string().nullable(),
  regionalBackground: z.string().nullable(),
  typicalTaste: z.array(z.string()),
  typicalTexture: z.array(z.string()),
  typicalSpice: z.string().nullable(),
  typicalPreparation: z.string().nullable(),
  commonIngredients: z.array(z.string()),
  similarDishes: z.array(z.string()),
  orderingConsiderations: z.array(z.string()),
});

export const EvidenceBackedStringListSchema = z.strictObject({
  values: z.array(z.string()),
  availability: AvailabilitySchema,
  basis: ClaimBasisSchema,
  sourceIds: z.array(z.string().min(1)),
  limitation: z.string().nullable(),
});

export const EvidenceBackedSignatureStatusSchema = z.strictObject({
  value: SignatureStatusSchema,
  availability: AvailabilitySchema,
  basis: ClaimBasisSchema,
  sourceIds: z.array(z.string().min(1)),
  limitation: z.string().nullable(),
});

export const RestaurantSpecificDishInfoSchema = z.strictObject({
  menuDescription: z.string().nullable(),
  confirmedIngredients: EvidenceBackedStringListSchema,
  preparationDetails: EvidenceBackedStringListSchema,
  signatureStatus: EvidenceBackedSignatureStatusSchema,
  proteinOptions: EvidenceBackedStringListSchema,
  modificationOptions: EvidenceBackedStringListSchema,
  sourceIds: z.array(z.string().min(1)),
  limitations: z.array(z.string()),
});

export const ReviewConsensusSchema = z.strictObject({
  status: ReviewConsensusStatusSchema,
  sourceGroupCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative(),
  freshness: z.string().nullable(),
  repeatedPositives: z.array(z.string()),
  repeatedNegatives: z.array(z.string()),
  disagreements: z.array(z.string()),
  rationale: z.string().nullable(),
  sourceIds: z.array(z.string().min(1)),
  limitation: z.string().nullable(),
});

export const MenuFreshnessSchema = z.strictObject({
  status: MenuFreshnessStatusSchema,
  checkedAt: NullableIsoDateTimeSchema,
  sourceUpdatedAt: NullableIsoDateTimeSchema,
  comparedFields: z.array(z.string()),
  differences: z.array(z.string()),
  sourceIds: z.array(z.string().min(1)),
  limitation: z.string().nullable(),
});

export const DietaryAssessmentSchema = z.strictObject({
  key: DietaryKeySchema,
  label: z.string().min(1),
  status: DietaryStatusSchema,
  explanation: z.string().nullable(),
  basis: ClaimBasisSchema,
  sourceIds: z.array(z.string().min(1)),
  limitation: z.string().nullable(),
});

export const DietaryAssessmentCollectionSchema = z.strictObject({
  items: z.array(DietaryAssessmentSchema),
  warning: z.literal(ALLERGY_SAFETY_NOTICE),
});

export const DishImageSchema = z.strictObject({
  url: NullableUrlSchema,
  localAssetPath: z.string().nullable(),
  sourceType: DishImageSourceSchema,
  sourcePageUrl: NullableUrlSchema,
  restaurantSpecific: z.boolean(),
  userFacingLabel: z.string().min(1),
  attribution: z.string().nullable(),
  rightsStatus: ImageRightsStatusSchema,
  limitation: z.string().nullable(),
  altText: z.string().min(1),
  displayPosition: z.string().nullable(),
});

export const DishSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  originalName: z.string().nullable(),
  pronunciation: z.string().nullable(),
  categoryId: z.string().nullable(),
  menuDescription: z.string().nullable(),
  price: MoneySchema.nullable(),
  priceEvidence: ClaimEvidenceSchema,
  priceOptions: z.array(PriceOptionSchema),
  options: z.array(MenuOptionSchema),
  visibleSpiceLabel: z.string().nullable(),
  visibleDietaryLabels: z.array(z.string()),
  generalKnowledge: GeneralDishKnowledgeSchema,
  restaurantSpecific: RestaurantSpecificDishInfoSchema,
  image: DishImageSchema,
  reviews: ReviewConsensusSchema,
  dietary: DietaryAssessmentCollectionSchema,
  evidenceIds: z.array(z.string().min(1)),
  limitations: z.array(z.string()),
});

export const MenuCategorySchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const MenuSchema = z.strictObject({
  title: z.string().nullable(),
  currency: z.string().nullable(),
  categories: z.array(MenuCategorySchema),
  dishes: z.array(DishSchema),
  featuredDishIds: z.array(z.string().min(1)),
  freshness: MenuFreshnessSchema,
  sourceIds: z.array(z.string().min(1)),
  limitations: z.array(z.string()),
});

export const OrderRecommendationSchema = z.strictObject({
  id: z.string().min(1),
  dishIds: z.array(z.string().min(1)),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
  estimatedPrice: MoneySchema.nullable(),
  dietaryWarnings: z.array(z.string()),
  evidenceLimitations: z.array(z.string()),
});

export const OrderingGuidanceSchema = z.strictObject({
  partySize: z.number().int().positive().nullable(),
  budget: MoneySchema.nullable(),
  goal: z.string().nullable(),
  sharingPreference: z.string().nullable(),
  recommendations: z.array(OrderRecommendationSchema),
  estimatedTotal: MoneySchema.nullable(),
  estimatedTotalEvidence: ClaimEvidenceSchema,
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const AnalysisIssueSchema = z.strictObject({
  code: AnalysisIssueCodeSchema,
  severity: IssueSeveritySchema,
  message: z.string().min(1),
  relatedEntityIds: z.array(z.string().min(1)),
  recoverable: z.boolean(),
});

export const FoodseyoAnalysisPayloadSchema = z.strictObject({
  restaurantResolution: RestaurantResolutionSchema,
  restaurant: RestaurantSchema.nullable(),
  menu: MenuSchema.nullable(),
  orderingGuidance: OrderingGuidanceSchema.nullable(),
  evidence: z.array(EvidenceItemSchema),
  allergySafetyNotice: z.literal(ALLERGY_SAFETY_NOTICE),
});

export const FoodseyoAnalysisSchema = z.strictObject({
  schemaVersion: z.literal(FOODSEYO_ANALYSIS_SCHEMA_VERSION),
  analysisId: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  status: AnalysisStatusSchema,
  inputContext: InputContextSchema,
  payload: FoodseyoAnalysisPayloadSchema,
  issues: z.array(AnalysisIssueSchema),
});

export type InputType = z.infer<typeof InputTypeSchema>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;
export type RestaurantMatchStatus = z.infer<typeof RestaurantMatchStatusSchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;
export type ClaimBasis = z.infer<typeof ClaimBasisSchema>;
export type EvidenceSourceType = z.infer<typeof EvidenceSourceTypeSchema>;
export type ReviewConsensusStatus = z.infer<typeof ReviewConsensusStatusSchema>;
export type MenuFreshnessStatus = z.infer<typeof MenuFreshnessStatusSchema>;
export type DietaryStatus = z.infer<typeof DietaryStatusSchema>;
export type DietaryKey = z.infer<typeof DietaryKeySchema>;
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;
export type DishImageSource = z.infer<typeof DishImageSourceSchema>;
export type ImageRightsStatus = z.infer<typeof ImageRightsStatusSchema>;
export type RestaurantConfirmedBy = z.infer<typeof RestaurantConfirmedBySchema>;
export type SignatureStatus = z.infer<typeof SignatureStatusSchema>;
export type AnalysisIssueCode = z.infer<typeof AnalysisIssueCodeSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type ClaimEvidence = z.infer<typeof ClaimEvidenceSchema>;
export type InputContext = z.infer<typeof InputContextSchema>;
export type RestaurantCandidate = z.infer<typeof RestaurantCandidateSchema>;
export type RestaurantResolution = z.infer<typeof RestaurantResolutionSchema>;
export type Restaurant = z.infer<typeof RestaurantSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type PriceOption = z.infer<typeof PriceOptionSchema>;
export type MenuOption = z.infer<typeof MenuOptionSchema>;
export type GeneralDishKnowledge = z.infer<typeof GeneralDishKnowledgeSchema>;
export type RestaurantSpecificDishInfo = z.infer<
  typeof RestaurantSpecificDishInfoSchema
>;
export type ReviewConsensus = z.infer<typeof ReviewConsensusSchema>;
export type MenuFreshness = z.infer<typeof MenuFreshnessSchema>;
export type DietaryAssessment = z.infer<typeof DietaryAssessmentSchema>;
export type DietaryAssessmentCollection = z.infer<
  typeof DietaryAssessmentCollectionSchema
>;
export type DishImage = z.infer<typeof DishImageSchema>;
export type Dish = z.infer<typeof DishSchema>;
export type MenuCategory = z.infer<typeof MenuCategorySchema>;
export type Menu = z.infer<typeof MenuSchema>;
export type OrderRecommendation = z.infer<typeof OrderRecommendationSchema>;
export type OrderingGuidance = z.infer<typeof OrderingGuidanceSchema>;
export type AnalysisIssue = z.infer<typeof AnalysisIssueSchema>;
export type FoodseyoAnalysisPayload = z.infer<
  typeof FoodseyoAnalysisPayloadSchema
>;
export type FoodseyoAnalysis = z.infer<typeof FoodseyoAnalysisSchema>;
