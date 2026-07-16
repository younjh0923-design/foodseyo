import { z } from "zod";
import { demoFoodseyoAnalysis } from "../src/data/demoFoodseyoAnalysis.ts";
import {
  ALLERGY_SAFETY_NOTICE,
  DishImageSchema,
  DishSchema,
  EvidenceSourceTypeSchema,
  FoodseyoAnalysisPayloadSchema,
  FoodseyoAnalysisSchema,
  InputContextSchema,
  RestaurantMatchStatusSchema,
  ReviewConsensusSchema,
} from "../src/domain/foodseyo-analysis.ts";
import { createValidationSuite } from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo analysis contract validation",
  "Contract validation failed",
);

verify(
  FoodseyoAnalysisSchema.safeParse(demoFoodseyoAnalysis).success,
  "canonical demo fixture parses",
);

verify(
  !RestaurantMatchStatusSchema.safeParse("invalid_match_state").success,
  "invalid restaurant match status is rejected",
);

const demoDish = demoFoodseyoAnalysis.payload.menu?.dishes[0];
if (!demoDish) throw new Error("Contract validation requires one demo dish.");

verify(
  DishSchema.safeParse({
    ...demoDish,
    price: null,
    priceEvidence: {
      availability: "unknown",
      basis: "direct_observation",
      sourceIds: [],
      limitation: "Price was not visible.",
    },
  }).success,
  "unknown price accepts null",
);

verify(
  ReviewConsensusSchema.safeParse({
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
  }).success,
  "insufficient review evidence structure is accepted",
);

verify(
  !DishImageSchema.safeParse({
    ...demoDish.image,
    sourceType: "ai_generated",
  }).success,
  "AI-generated image source is rejected",
);

verify(
  FoodseyoAnalysisSchema.safeParse({
    ...demoFoodseyoAnalysis,
    status: "partial",
    payload: {
      ...demoFoodseyoAnalysis.payload,
      restaurantResolution: {
        status: "unconfirmed",
        candidates: [],
        selectedCandidateId: null,
        confirmedBy: null,
        sourceIds: [],
        limitations: ["Restaurant identity was not confirmed."],
      },
      restaurant: null,
    },
    issues: [
      {
        code: "RESTAURANT_UNCONFIRMED",
        severity: "warning",
        message: "Restaurant identity was not confirmed.",
        relatedEntityIds: [],
        recoverable: true,
      },
    ],
  }).success,
  "unconfirmed restaurant with available general knowledge is accepted",
);

verify(
  InputContextSchema.safeParse({
    type: "restaurant_screen",
    imageCount: 1,
    sourcePlatformLabel: "User-provided screen",
    userEnteredRestaurantName: null,
    locationUsed: false,
    storageScope: "session_only",
  }).success &&
    DishImageSchema.safeParse({
      ...demoDish.image,
      sourceType: "user_provided_screen",
      rightsStatus: "session_only",
      restaurantSpecific: false,
      userFacingLabel: "Legacy user evidence",
      limitation: "May be used only as session evidence; do not republish.",
    }).success,
  "user-provided screen with a session-only image is accepted",
);

verify(
  !EvidenceSourceTypeSchema.safeParse("ai_inference").success &&
    !EvidenceSourceTypeSchema.safeParse("unavailable").success,
  "claim basis and availability values are rejected as evidence sources",
);

verify(
  !InputContextSchema.safeParse({
    type: "demo",
    fixtureId: "unsafe-extra-field",
    clearlyLabeledDemo: true,
    storageScope: "session_only",
    rawImageData: "data:image/png;base64,not-stored-here",
  }).success,
  "raw image and base64 fields are rejected by strict input schemas",
);

const serialized = JSON.stringify(demoFoodseyoAnalysis);
verify(
  typeof serialized === "string" &&
    FoodseyoAnalysisSchema.safeParse(JSON.parse(serialized)).success &&
    demoFoodseyoAnalysis.payload.allergySafetyNotice === ALLERGY_SAFETY_NOTICE,
  "analysis is JSON serializable and preserves the safety notice",
);

const payloadJsonSchema = z.toJSONSchema(FoodseyoAnalysisPayloadSchema);
verify(
  payloadJsonSchema.type === "object" &&
    payloadJsonSchema.additionalProperties === false &&
    Array.isArray(payloadJsonSchema.required),
  "payload converts to a strict JSON Schema",
);

report();
