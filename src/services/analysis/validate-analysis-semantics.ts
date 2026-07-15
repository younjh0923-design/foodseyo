import type {
  AnalysisIssue,
  ClaimEvidence,
  Dish,
  FoodseyoAnalysisPayload,
} from "../../domain/foodseyo-analysis.ts";
import type {
  SemanticProblem,
  SemanticRuleCode,
  SemanticValidationResult,
} from "./analysis-types.ts";

const OFFICIAL_FRESHNESS_SOURCES = new Set(["official_menu", "official_website"]);
const PRICE_BASES = new Set([
  "direct_observation",
  "external_source",
  "deterministic_calculation",
]);
const RESTAURANT_SPECIFIC_IMAGE_SOURCES = new Set([
  "uploaded_menu",
  "user_provided_screen",
  "official_menu",
  "official_website",
  "official_social",
]);

const findDuplicates = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
};

const createWarning = (
  code: AnalysisIssue["code"],
  message: string,
  relatedEntityIds: readonly string[],
): AnalysisIssue => ({
  code,
  severity: code === "DIETARY_CONFIRM_WITH_STAFF" ? "warning" : "info",
  message,
  relatedEntityIds: [...relatedEntityIds],
  recoverable: true,
});

export function validateAnalysisSemantics(
  payload: FoodseyoAnalysisPayload,
): SemanticValidationResult {
  const errors: SemanticProblem[] = [];
  const warnings: AnalysisIssue[] = [];

  const addError = (
    code: SemanticRuleCode,
    message: string,
    relatedEntityIds: readonly string[] = [],
  ) => errors.push({ code, message, relatedEntityIds: [...relatedEntityIds] });

  const evidenceIds = payload.evidence.map((evidence) => evidence.id);
  const evidenceIdSet = new Set(evidenceIds);
  const evidenceById = new Map(payload.evidence.map((evidence) => [evidence.id, evidence]));

  for (const duplicateId of findDuplicates(evidenceIds)) {
    addError(
      "DUPLICATE_EVIDENCE_ID",
      `Evidence ID ${duplicateId} appears more than once.`,
      [duplicateId],
    );
  }

  const validateSourceIds = (
    sourceIds: readonly string[],
    label: string,
    relatedEntityIds: readonly string[] = [],
  ) => {
    for (const sourceId of sourceIds) {
      if (!evidenceIdSet.has(sourceId)) {
        addError(
          "EVIDENCE_REFERENCE_MISSING",
          `${label} references missing evidence ID ${sourceId}.`,
          relatedEntityIds,
        );
      }
    }
  };

  const validateClaimEvidence = (
    evidence: ClaimEvidence,
    label: string,
    relatedEntityIds: readonly string[],
  ) => {
    validateSourceIds(evidence.sourceIds, label, relatedEntityIds);
    if (
      evidence.availability === "available" &&
      (evidence.basis === "direct_observation" || evidence.basis === "external_source") &&
      evidence.sourceIds.length === 0
    ) {
      addError(
        "AVAILABLE_CLAIM_WITHOUT_EVIDENCE",
        `${label} is available from ${evidence.basis} but has no evidence source.`,
        relatedEntityIds,
      );
    }
  };

  const resolution = payload.restaurantResolution;
  validateSourceIds(resolution.sourceIds, "Restaurant resolution");
  for (const candidate of resolution.candidates) {
    validateSourceIds(candidate.sourceIds, `Restaurant candidate ${candidate.id}`, [candidate.id]);
  }
  if (payload.restaurant) {
    validateSourceIds(
      payload.restaurant.sourceIds,
      "Restaurant",
      payload.restaurant.id ? [payload.restaurant.id] : [],
    );
  }

  if (resolution.status === "confirmed") {
    if (payload.restaurant === null) {
      addError(
        "CONFIRMED_RESTAURANT_MISSING",
        "A confirmed restaurant resolution requires restaurant data.",
      );
    }
    if (resolution.confirmedBy === null) {
      addError("CONFIRMED_BY_MISSING", "A confirmed restaurant requires confirmedBy.");
    }

    const selectedCandidate = resolution.candidates.find(
      (candidate) => candidate.id === resolution.selectedCandidateId,
    );
    const confirmationCarriesUserEvidence =
      resolution.confirmedBy === "user_confirmation" ||
      (resolution.confirmedBy === "nearby_selection" && selectedCandidate?.selectedByUser === true);
    if (resolution.sourceIds.length === 0 && !confirmationCarriesUserEvidence) {
      addError(
        "CONFIRMED_EVIDENCE_MISSING",
        "A confirmed restaurant requires evidence or explicit user confirmation.",
      );
    }
  }

  if (resolution.status === "likely") {
    if (resolution.candidates.length === 0) {
      addError("LIKELY_CANDIDATE_MISSING", "A likely match requires at least one candidate.");
    }
    if (resolution.confirmedBy !== null) {
      addError("LIKELY_HAS_CONFIRMED_BY", "A likely match must not be marked confirmed.");
    }
    warnings.push(
      createWarning(
        "RESTAURANT_MATCH_LIKELY",
        "Restaurant identity is a likely match and requires user confirmation.",
        resolution.selectedCandidateId ? [resolution.selectedCandidateId] : [],
      ),
    );
  }

  if (resolution.status === "unconfirmed") {
    if (resolution.confirmedBy !== null) {
      addError(
        "UNCONFIRMED_HAS_CONFIRMED_BY",
        "An unconfirmed restaurant must not have confirmedBy.",
      );
    }
    warnings.push(
      createWarning(
        "RESTAURANT_UNCONFIRMED",
        "Restaurant identity was not confirmed; general dish guidance may still be available.",
        [],
      ),
    );
  }

  if (resolution.status === "not_attempted" && resolution.confirmedBy !== null) {
    addError(
      "NOT_ATTEMPTED_HAS_CONFIRMED_BY",
      "Restaurant matching marked not_attempted must not have confirmedBy.",
    );
  }

  if (
    resolution.selectedCandidateId !== null &&
    !resolution.candidates.some((candidate) => candidate.id === resolution.selectedCandidateId)
  ) {
    addError(
      "SELECTED_CANDIDATE_MISSING",
      `Selected candidate ${resolution.selectedCandidateId} does not exist.`,
      [resolution.selectedCandidateId],
    );
  }

  const userSelectedCandidates = resolution.candidates.filter(
    (candidate) => candidate.selectedByUser,
  );
  if (userSelectedCandidates.length > 1) {
    addError(
      "MULTIPLE_USER_SELECTED_CANDIDATES",
      "Only one restaurant candidate may be selected by the user.",
      userSelectedCandidates.map((candidate) => candidate.id),
    );
  }

  const menu = payload.menu;
  const dishById = new Map<string, Dish>();

  if (menu) {
    validateSourceIds(menu.sourceIds, "Menu");
    validateSourceIds(menu.freshness.sourceIds, "Menu freshness");

    const dishIds = menu.dishes.map((dish) => dish.id);
    const categoryIds = menu.categories.map((category) => category.id);
    const categoryIdSet = new Set(categoryIds);

    for (const duplicateId of findDuplicates(dishIds)) {
      addError("DUPLICATE_DISH_ID", `Dish ID ${duplicateId} appears more than once.`, [duplicateId]);
    }
    for (const duplicateId of findDuplicates(categoryIds)) {
      addError(
        "DUPLICATE_CATEGORY_ID",
        `Category ID ${duplicateId} appears more than once.`,
        [duplicateId],
      );
    }
    for (const duplicateId of findDuplicates(menu.featuredDishIds)) {
      addError(
        "DUPLICATE_FEATURED_DISH_ID",
        `Featured dish ID ${duplicateId} appears more than once.`,
        [duplicateId],
      );
    }

    for (const dish of menu.dishes) {
      if (!dishById.has(dish.id)) dishById.set(dish.id, dish);
      if (dish.categoryId !== null && !categoryIdSet.has(dish.categoryId)) {
        addError(
          "DISH_CATEGORY_REFERENCE_MISSING",
          `Dish ${dish.id} references missing category ${dish.categoryId}.`,
          [dish.id],
        );
      }
    }

    for (const featuredDishId of menu.featuredDishIds) {
      if (!dishById.has(featuredDishId)) {
        addError(
          "FEATURED_DISH_REFERENCE_MISSING",
          `Featured dish ${featuredDishId} does not exist in the menu.`,
          [featuredDishId],
        );
      }
    }

    const validatePrice = (
      priceExists: boolean,
      evidence: ClaimEvidence,
      label: string,
      relatedEntityIds: readonly string[],
    ) => {
      validateClaimEvidence(evidence, label, relatedEntityIds);
      if (priceExists) {
        if (evidence.availability !== "available" || !PRICE_BASES.has(evidence.basis)) {
          addError(
            "PRICE_EVIDENCE_MISMATCH",
            `${label} exists but its evidence does not mark an available supported price.`,
            relatedEntityIds,
          );
        }
        if (
          (evidence.basis === "direct_observation" || evidence.basis === "external_source") &&
          evidence.sourceIds.length === 0
        ) {
          addError(
            "PRICE_EVIDENCE_SOURCE_MISSING",
            `${label} requires a source for ${evidence.basis}.`,
            relatedEntityIds,
          );
        }
      } else if (evidence.availability === "available") {
        addError(
          "PRICE_EVIDENCE_MISMATCH",
          `${label} is null while its evidence says available.`,
          relatedEntityIds,
        );
      }
    };

    for (const dish of menu.dishes) {
      const dishEntity = [dish.id];
      validateSourceIds(dish.evidenceIds, `Dish ${dish.id}`, dishEntity);
      validatePrice(dish.price !== null, dish.priceEvidence, `Dish ${dish.id} price`, dishEntity);

      for (const priceOption of dish.priceOptions) {
        validatePrice(
          priceOption.price !== null,
          priceOption.priceEvidence,
          `Dish ${dish.id} price option ${priceOption.id}`,
          dishEntity,
        );
      }
      for (const option of dish.options) {
        validatePrice(
          option.additionalPrice !== null,
          option.priceEvidence,
          `Dish ${dish.id} option ${option.id}`,
          dishEntity,
        );
      }

      const restaurantSpecific = dish.restaurantSpecific;
      validateSourceIds(
        restaurantSpecific.sourceIds,
        `Dish ${dish.id} restaurant-specific data`,
        dishEntity,
      );
      validateClaimEvidence(
        restaurantSpecific.confirmedIngredients,
        `Dish ${dish.id} confirmed ingredients`,
        dishEntity,
      );
      validateClaimEvidence(
        restaurantSpecific.preparationDetails,
        `Dish ${dish.id} preparation details`,
        dishEntity,
      );
      validateClaimEvidence(
        restaurantSpecific.signatureStatus,
        `Dish ${dish.id} signature status`,
        dishEntity,
      );
      validateClaimEvidence(
        restaurantSpecific.proteinOptions,
        `Dish ${dish.id} protein options`,
        dishEntity,
      );
      validateClaimEvidence(
        restaurantSpecific.modificationOptions,
        `Dish ${dish.id} modification options`,
        dishEntity,
      );
      if (
        resolution.status !== "confirmed" &&
        (restaurantSpecific.menuDescription !== null ||
          restaurantSpecific.confirmedIngredients.availability === "available" ||
          restaurantSpecific.preparationDetails.availability === "available" ||
          restaurantSpecific.signatureStatus.availability === "available" ||
          restaurantSpecific.proteinOptions.availability === "available" ||
          restaurantSpecific.modificationOptions.availability === "available")
      ) {
        addError(
          "RESTAURANT_SPECIFIC_FACT_UNCONFIRMED",
          `Dish ${dish.id} contains confirmed restaurant-specific facts while restaurant identity is ${resolution.status}.`,
          dishEntity,
        );
      }

      const review = dish.reviews;
      validateSourceIds(review.sourceIds, `Dish ${dish.id} reviews`, dishEntity);
      if (review.status === "insufficient") {
        if (review.limitation === null && review.rationale === null) {
          addError(
            "REVIEW_INSUFFICIENT_CONTEXT_MISSING",
            `Dish ${dish.id} has insufficient reviews without a rationale or limitation.`,
            dishEntity,
          );
        }
        if (review.sourceGroupCount > 0 && review.evidenceCount === 0) {
          addError(
            "REVIEW_COUNT_MISMATCH",
            `Dish ${dish.id} has review source groups but zero evidence items.`,
            dishEntity,
          );
        }
        warnings.push(
          createWarning(
            "REVIEW_EVIDENCE_INSUFFICIENT",
            `Review evidence is insufficient for ${dish.name}.`,
            dishEntity,
          ),
        );
      }
      if (review.status === "strong" || review.status === "moderate") {
        if (review.sourceGroupCount === 0 || review.evidenceCount === 0) {
          addError(
            "REVIEW_COUNT_MISMATCH",
            `Dish ${dish.id} has ${review.status} review consensus without positive counts.`,
            dishEntity,
          );
        }
        if (review.sourceIds.length === 0) {
          addError(
            "REVIEW_EVIDENCE_MISSING",
            `Dish ${dish.id} has ${review.status} review consensus without evidence.`,
            dishEntity,
          );
        }
      }
      if (review.status === "mixed" && review.disagreements.length === 0) {
        addError(
          "MIXED_REVIEW_DISAGREEMENT_MISSING",
          `Dish ${dish.id} has mixed review consensus without disagreements.`,
          dishEntity,
        );
      }

      const image = dish.image;
      if (
        image.sourceType === "unavailable" &&
        (image.url !== null ||
          image.localAssetPath !== null ||
          image.restaurantSpecific ||
          /official/i.test(image.userFacingLabel))
      ) {
        addError(
          "IMAGE_UNAVAILABLE_MISMATCH",
          `Dish ${dish.id} has an unavailable image with reusable or official-image fields.`,
          dishEntity,
        );
      }
      if (
        image.rightsStatus === "attribution_required" &&
        (image.attribution === null || image.attribution.trim().length === 0)
      ) {
        addError(
          "IMAGE_ATTRIBUTION_MISSING",
          `Dish ${dish.id} requires image attribution metadata.`,
          dishEntity,
        );
      }
      if (image.sourceType === "general_reference") {
        if (image.restaurantSpecific) {
          addError(
            "GENERAL_REFERENCE_RESTAURANT_SPECIFIC",
            `Dish ${dish.id} marks a general reference as restaurant-specific.`,
            dishEntity,
          );
        }
        if (image.limitation === null || !/presentation may differ/i.test(image.limitation)) {
          addError(
            "GENERAL_REFERENCE_LIMITATION_MISSING",
            `Dish ${dish.id} general reference must state that presentation may differ.`,
            dishEntity,
          );
        }
        if (image.rightsStatus !== "cleared" && image.rightsStatus !== "attribution_required") {
          addError(
            "GENERAL_REFERENCE_RIGHTS_INVALID",
            `Dish ${dish.id} general reference lacks reusable rights.`,
            dishEntity,
          );
        }
        if (image.sourcePageUrl === null) {
          addError(
            "GENERAL_REFERENCE_SOURCE_MISSING",
            `Dish ${dish.id} general reference lacks a traceable source page.`,
            dishEntity,
          );
        }
      }
      if (
        image.sourceType === "user_provided_screen" &&
        image.rightsStatus !== "session_only" &&
        image.rightsStatus !== "not_reusable" &&
        image.sourcePageUrl === null
      ) {
        addError(
          "SCREEN_IMAGE_RIGHTS_UNVERIFIED",
          `Dish ${dish.id} screen image is reusable without verified source rights.`,
          dishEntity,
        );
      }
      if (image.rightsStatus === "session_only" && image.localAssetPath !== null) {
        addError(
          "SESSION_IMAGE_PERSISTED",
          `Dish ${dish.id} session-only image must not use a persistent local asset.`,
          dishEntity,
        );
      }
      if (image.restaurantSpecific) {
        if (!RESTAURANT_SPECIFIC_IMAGE_SOURCES.has(image.sourceType)) {
          addError(
            "RESTAURANT_SPECIFIC_IMAGE_SOURCE_INVALID",
            `Dish ${dish.id} restaurant-specific image has an invalid source type.`,
            dishEntity,
          );
        }
        if (resolution.status !== "confirmed" || dish.evidenceIds.length === 0) {
          addError(
            "RESTAURANT_SPECIFIC_IMAGE_RESTAURANT_UNCONFIRMED",
            `Dish ${dish.id} restaurant-specific image lacks confirmed restaurant evidence.`,
            dishEntity,
          );
        }
      }
      if (image.sourceType === "unavailable") {
        warnings.push(
          createWarning("IMAGE_UNAVAILABLE", `Image is unavailable for ${dish.name}.`, dishEntity),
        );
      }
      if (image.rightsStatus === "session_only" || image.rightsStatus === "not_reusable") {
        warnings.push(
          createWarning(
            "IMAGE_NOT_REUSABLE",
            `Image for ${dish.name} may be used only as analysis evidence.`,
            dishEntity,
          ),
        );
      }

      for (const dietary of dish.dietary.items) {
        validateSourceIds(
          dietary.sourceIds,
          `Dish ${dish.id} dietary item ${dietary.key}`,
          dishEntity,
        );
        if (dietary.status === "confirmed_present" || dietary.status === "confirmed_absent") {
          if (dietary.basis === "general_food_knowledge") {
            addError(
              "DIETARY_GENERAL_KNOWLEDGE_CONFIRMED",
              `Dish ${dish.id} confirms ${dietary.key} from general food knowledge.`,
              dishEntity,
            );
          }
          if (
            (dietary.basis !== "direct_observation" && dietary.basis !== "external_source") ||
            dietary.sourceIds.length === 0
          ) {
            addError(
              "DIETARY_CONFIRMATION_EVIDENCE_MISSING",
              `Dish ${dish.id} confirms ${dietary.key} without direct or external evidence.`,
              dishEntity,
            );
          }
        }
        if (
          dietary.status === "confirm_with_staff" &&
          dietary.explanation === null &&
          dietary.limitation === null
        ) {
          addError(
            "DIETARY_STAFF_CONTEXT_MISSING",
            `Dish ${dish.id} asks for staff confirmation without an explanation or limitation.`,
            dishEntity,
          );
        }
        if (dietary.status === "confirm_with_staff") {
          warnings.push(
            createWarning(
              "DIETARY_CONFIRM_WITH_STAFF",
              `Confirm ${dietary.label.toLowerCase()} directly with restaurant staff.`,
              dishEntity,
            ),
          );
        }
      }

      if (dish.price === null) {
        warnings.push(
          createWarning("PRICE_UNKNOWN", `Price is unknown for ${dish.name}.`, dishEntity),
        );
      }
    }

    const freshness = menu.freshness;
    if (freshness.status === "verified_against_official_source") {
      if (freshness.checkedAt === null) {
        addError(
          "FRESHNESS_CHECK_MISSING",
          "Verified menu freshness requires a checkedAt timestamp.",
        );
      }
      if (freshness.sourceIds.length === 0) {
        addError("FRESHNESS_SOURCE_MISSING", "Verified menu freshness requires evidence.");
      }
      const hasOfficialSource = freshness.sourceIds.some((sourceId) => {
        const sourceType = evidenceById.get(sourceId)?.sourceType;
        return sourceType !== undefined && OFFICIAL_FRESHNESS_SOURCES.has(sourceType);
      });
      if (!hasOfficialSource) {
        addError(
          "FRESHNESS_OFFICIAL_SOURCE_MISSING",
          "Verified menu freshness requires official menu or website evidence.",
        );
      }
    }
    if (freshness.status === "possible_differences") {
      if (freshness.differences.length === 0 && freshness.limitation === null) {
        addError(
          "FRESHNESS_DIFFERENCE_CONTEXT_MISSING",
          "Possible menu differences require differences or a limitation.",
        );
      }
      if (freshness.sourceIds.length === 0) {
        addError(
          "FRESHNESS_SOURCE_MISSING",
          "Possible menu differences require comparison evidence.",
        );
      }
    }
    if (freshness.status === "could_not_verify") {
      warnings.push(
        createWarning(
          "MENU_FRESHNESS_UNVERIFIED",
          "Menu freshness could not be verified against an official source.",
          [],
        ),
      );
    }
  }

  const ordering = payload.orderingGuidance;
  if (ordering) {
    validateClaimEvidence(
      ordering.estimatedTotalEvidence,
      "Ordering estimated total",
      [],
    );
    if (ordering.estimatedTotal !== null) {
      if (
        ordering.estimatedTotalEvidence.availability !== "available" ||
        ordering.estimatedTotalEvidence.basis !== "deterministic_calculation"
      ) {
        addError(
          "ESTIMATED_TOTAL_EVIDENCE_MISMATCH",
          "An estimated total requires available deterministic-calculation evidence.",
        );
      }
    } else if (ordering.estimatedTotalEvidence.availability === "available") {
      addError(
        "ESTIMATED_TOTAL_EVIDENCE_MISMATCH",
        "Estimated total is null while its evidence says available.",
      );
    }

    let recommendationHasUnknownPrice = false;
    for (const recommendation of ordering.recommendations) {
      for (const dishId of recommendation.dishIds) {
        const dish = dishById.get(dishId);
        if (!dish) {
          addError(
            "ORDERING_DISH_REFERENCE_MISSING",
            `Order recommendation references missing dish ${dishId}.`,
            [dishId],
          );
        } else if (dish.price === null) {
          recommendationHasUnknownPrice = true;
        }
      }
    }
    if (ordering.estimatedTotal !== null && recommendationHasUnknownPrice) {
      addError(
        "ESTIMATED_TOTAL_WITH_UNKNOWN_PRICE",
        "An exact estimated total includes a dish with unknown price.",
      );
    }
  }

  return { errors, warnings };
}
