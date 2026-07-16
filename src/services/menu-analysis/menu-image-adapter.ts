import {
  ALLERGY_SAFETY_NOTICE,
  type AnalysisConsistencyVersionMetadata,
  type ClaimEvidence,
  type ConsistentDish,
  type ConsistentFoodseyoAnalysisPayload,
  type DietaryAssessment,
  type Dish,
  type EvidenceItem,
  type LegacyDish,
  type MenuCategory,
  type Money,
  type Restaurant,
  type RestaurantResolution,
} from "../../domain/foodseyo-analysis.ts";
import {
  createAnalysisResultFingerprint,
  createDishFingerprint,
} from "../../lib/analysis-consistency/index.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import { finalizeLiveDishConsistency } from "./menu-image-consistency.ts";
import type {
  MenuImageDish,
  MenuImageModelOutput,
  MenuImageMoney,
} from "./menu-image-model-schema.ts";

const UPLOADED_MENU_LIMITATIONS = [
  "User-provided image used only for this analysis session.",
  "Menu content may be incomplete or outdated.",
] as const;

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const slugPart = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createIdAllocator = () => {
  const counts = new Map<string, number>();
  return (prefix: string, value: string, fallbackIndex: number): string => {
    const base = `${prefix}-${slugPart(value) || fallbackIndex}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
};

const safeUrl = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const normalizeRestaurantName = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const toEvidenceId = (index: number): string => `uploaded-menu-image-${index + 1}`;

const validateSourceImageIndex = (index: number, imageCount: number): void => {
  if (index < 0 || index >= imageCount) {
    throw new MenuAnalysisError(
      "INVALID_SOURCE_IMAGE_INDEX",
      "Model output referenced an image outside the uploaded set.",
    );
  }
};

const evidenceIdsForIndexes = (
  indexes: readonly number[],
  imageCount: number,
): string[] => {
  for (const index of indexes) validateSourceImageIndex(index, imageCount);
  return unique(indexes.map(toEvidenceId));
};

const validateAllSourceIndexes = (
  output: MenuImageModelOutput,
  imageCount: number,
): void => {
  for (const signal of output.restaurantSignals) {
    validateSourceImageIndex(signal.sourceImageIndex, imageCount);
  }
  for (const category of output.categories) {
    evidenceIdsForIndexes(category.sourceImageIndexes, imageCount);
    for (const dish of category.dishes) {
      if (dish.sourceImageIndexes.length === 0) {
        throw new MenuAnalysisError(
          "MODEL_OUTPUT_INVALID",
          "Every extracted dish requires at least one source image.",
        );
      }
      evidenceIdsForIndexes(dish.sourceImageIndexes, imageCount);
      for (const priceOption of dish.priceOptions) {
        evidenceIdsForIndexes(priceOption.sourceImageIndexes, imageCount);
      }
      for (const option of dish.options) {
        evidenceIdsForIndexes(option.sourceImageIndexes, imageCount);
      }
      for (const dietary of dish.explicitDietaryClaims) {
        evidenceIdsForIndexes(dietary.sourceImageIndexes, imageCount);
      }
    }
  }
};

const createEvidence = (imageCount: number): EvidenceItem[] =>
  Array.from({ length: imageCount }, (_, index) => ({
    id: toEvidenceId(index),
    sourceType: "uploaded_menu",
    title: `Uploaded menu image ${index + 1}`,
    url: null,
    sourceLabel: "User-uploaded menu",
    retrievedAt: null,
    publishedAt: null,
    excerpt: null,
    attribution: null,
    limitations: [...UPLOADED_MENU_LIMITATIONS],
  }));

const toMoney = (money: MenuImageMoney | null): Money | null =>
  money
    ? {
        amount: money.amount,
        currency: money.currency,
        displayText: money.displayText,
      }
    : null;

const directPriceEvidence = (
  price: Money | null,
  sourceIds: readonly string[],
): ClaimEvidence => ({
  availability: price ? "available" : "unknown",
  basis: "direct_observation",
  sourceIds: [...sourceIds],
  limitation: price
    ? "Price was read from the uploaded menu and may have changed."
    : "A reliable numeric price was not visible in the uploaded menu.",
});

const unknownStringList = (
  sourceIds: readonly string[],
  limitation: string,
): Dish["restaurantSpecific"]["confirmedIngredients"] => ({
  values: [],
  availability: "unknown",
  basis: "direct_observation",
  sourceIds: [...sourceIds],
  limitation,
});

const toDietaryAssessments = (
  dish: MenuImageDish,
  imageCount: number,
  dishSourceIds: readonly string[],
): DietaryAssessment[] => {
  if (dish.explicitDietaryClaims.length === 0) {
    return [
      {
        key: "ingredient_details",
        label: "Ingredient details",
        status: "confirm_with_staff",
        explanation: "The uploaded menu does not establish complete ingredients.",
        basis: "direct_observation",
        sourceIds: [...dishSourceIds],
        limitation: "Confirm ingredients and cross-contact directly with restaurant staff.",
      },
    ];
  }

  return dish.explicitDietaryClaims.map((claim) => {
    const sourceIds = evidenceIdsForIndexes(claim.sourceImageIndexes, imageCount);
    const confirmedPresent = claim.claimType === "contains";
    return {
      key: claim.key,
      label: claim.exactVisibleText,
      status: confirmedPresent ? "confirmed_present" : "confirm_with_staff",
      explanation: confirmedPresent
        ? `The uploaded menu states: ${claim.exactVisibleText}`
        : `The uploaded menu displays: ${claim.exactVisibleText}`,
      basis: "direct_observation",
      sourceIds,
      limitation: confirmedPresent
        ? "Confirm the current recipe and cross-contact directly with restaurant staff."
        : "A menu label does not confirm current ingredients, preparation, or cross-contact safety.",
    };
  });
};

const toDish = async (
  dish: MenuImageDish,
  categoryId: string,
  categoryLabel: string,
  imageCount: number,
  dishId: string,
  sourceDishIdentifier: string,
  sourceFingerprint: string,
  versions: AnalysisConsistencyVersionMetadata,
): Promise<ConsistentDish> => {
  const dishSourceIds = evidenceIdsForIndexes(dish.sourceImageIndexes, imageCount);
  const price = toMoney(dish.price);
  const allocatePriceOptionId = createIdAllocator();
  const allocateMenuOptionId = createIdAllocator();
  const uncertaintyLimitations = [
    ...dish.uncertaintyNotes,
    ...(dish.rawPriceText && !price
      ? [`Price text was visible but not normalized: ${dish.rawPriceText}`]
      : []),
  ];

  const legacyDish: LegacyDish = {
    id: dishId,
    name: dish.name,
    originalName: dish.originalName,
    pronunciation: dish.pronunciation,
    categoryId,
    menuDescription: dish.menuDescription,
    price,
    priceEvidence: directPriceEvidence(price, dishSourceIds),
    priceOptions: dish.priceOptions.map((option, index) => {
      const optionPrice = toMoney(option.price);
      const sourceIds = evidenceIdsForIndexes(option.sourceImageIndexes, imageCount);
      return {
        id: allocatePriceOptionId("price-option", option.label, index + 1),
        label: option.label,
        price: optionPrice,
        priceEvidence: directPriceEvidence(optionPrice, sourceIds),
      };
    }),
    options: dish.options.map((option, index) => {
      const additionalPrice = toMoney(option.additionalPrice);
      const sourceIds = evidenceIdsForIndexes(option.sourceImageIndexes, imageCount);
      return {
        id: allocateMenuOptionId("option", option.label, index + 1),
        label: option.label,
        additionalPrice,
        priceEvidence: directPriceEvidence(additionalPrice, sourceIds),
      };
    }),
    visibleSpiceLabel: dish.visibleSpiceLabel,
    visibleDietaryLabels: unique([
      ...dish.visibleDietaryLabels,
      ...dish.explicitDietaryClaims.map((claim) => claim.exactVisibleText),
    ]),
    generalKnowledge: {
      definition: dish.generalKnowledge.definition,
      regionalBackground: dish.generalKnowledge.regionalBackground,
      typicalTaste: [...dish.generalKnowledge.typicalTaste],
      typicalTexture: [...dish.generalKnowledge.typicalTexture],
      typicalSpice: dish.generalKnowledge.typicalSpice,
      typicalPreparation: dish.generalKnowledge.typicalPreparation,
      commonIngredients: [...dish.generalKnowledge.commonIngredients],
      similarDishes: [...dish.generalKnowledge.similarDishes],
      orderingConsiderations: [...dish.generalKnowledge.orderingConsiderations],
    },
    restaurantSpecific: {
      menuDescription: null,
      confirmedIngredients: unknownStringList(
        dishSourceIds,
        "The uploaded menu does not confirm a complete restaurant-specific ingredient list.",
      ),
      preparationDetails: unknownStringList(
        dishSourceIds,
        "Restaurant-specific preparation was not confirmed by the uploaded menu.",
      ),
      signatureStatus: {
        value: "unknown",
        availability: "insufficient",
        basis: "direct_observation",
        sourceIds: [...dishSourceIds],
        limitation: "Menu-image analysis does not establish signature-dish status.",
      },
      proteinOptions: unknownStringList(
        dishSourceIds,
        "Visible protein choices are stored as menu options, not confirmed recipe facts.",
      ),
      modificationOptions: unknownStringList(
        dishSourceIds,
        "Modification availability was not confirmed.",
      ),
      sourceIds: [...dishSourceIds],
      limitations: ["No restaurant-specific recipe facts were inferred from general knowledge."],
    },
    image: {
      url: null,
      localAssetPath: null,
      sourceType: "unavailable",
      sourcePageUrl: null,
      restaurantSpecific: false,
      userFacingLabel: "Image unavailable",
      attribution: null,
      rightsStatus: "unknown",
      limitation: "No rights-cleared dish image is available.",
      altText: `Image unavailable for ${dish.name}`,
      displayPosition: null,
    },
    reviews: {
      status: "insufficient",
      sourceGroupCount: 0,
      evidenceCount: 0,
      freshness: null,
      repeatedPositives: [],
      repeatedNegatives: [],
      disagreements: [],
      rationale: null,
      sourceIds: [],
      limitation: "No public review research was performed in menu-image analysis.",
    },
    dietary: {
      items: toDietaryAssessments(dish, imageCount, dishSourceIds),
      warning: ALLERGY_SAFETY_NOTICE,
    },
    evidenceIds: unique([
      ...dishSourceIds,
      ...dish.priceOptions.flatMap((option) =>
        evidenceIdsForIndexes(option.sourceImageIndexes, imageCount),
      ),
      ...dish.options.flatMap((option) =>
        evidenceIdsForIndexes(option.sourceImageIndexes, imageCount),
      ),
      ...dish.explicitDietaryClaims.flatMap((claim) =>
        evidenceIdsForIndexes(claim.sourceImageIndexes, imageCount),
      ),
    ]),
    limitations: unique([
      "Menu values were extracted from user-uploaded images and were not verified online.",
      ...uncertaintyLimitations,
    ]),
  };
  const finalized = finalizeLiveDishConsistency(dish.consistency, versions);
  const dishFingerprint = await createDishFingerprint({
    sourceFingerprint,
    sourceDishIdentifier,
    sourceStatedName: dish.name,
    sourceStatedDescription: dish.menuDescription,
    sourceStatedCategoryLabel: categoryLabel,
    sourceStatedPrice: {
      amount: price?.amount ?? null,
      currency: price?.currency ?? null,
      displayText: price?.displayText ?? dish.rawPriceText,
    },
  });
  const resultFingerprint = await createAnalysisResultFingerprint({
    dishFingerprint,
    consistency: finalized.consistency,
    versions,
  });

  return {
    ...legacyDish,
    consistency: finalized.consistency,
    consistencyWording: finalized.wording,
    analysisIdentity: { dishFingerprint, resultFingerprint },
  };
};

const resolveRestaurant = (
  output: MenuImageModelOutput,
  imageCount: number,
  userEnteredRestaurantName: string | null,
): { resolution: RestaurantResolution; restaurant: Restaurant | null } => {
  const allocateId = createIdAllocator();
  const userName = userEnteredRestaurantName?.trim() || null;
  const nameSignal = output.restaurantSignals.find(
    (signal) => signal.kind === "name" || signal.kind === "logo_text",
  );
  const addressSignal = output.restaurantSignals.find((signal) => signal.kind === "address");
  const phoneSignal = output.restaurantSignals.find((signal) => signal.kind === "phone");
  const websiteSignal = output.restaurantSignals.find((signal) => signal.kind === "website");
  const visibleName = nameSignal?.value ?? null;
  const restaurantName = userName ?? visibleName;

  if (!restaurantName) {
    return {
      resolution: {
        status: "unconfirmed",
        candidates: [],
        selectedCandidateId: null,
        confirmedBy: null,
        sourceIds: [],
        limitations: ["No reliable restaurant identity was visible in the uploaded menu."],
      },
      restaurant: null,
    };
  }

  const normalizedUserName = userName ? normalizeRestaurantName(userName) : "";
  const normalizedVisibleName = visibleName ? normalizeRestaurantName(visibleName) : "";
  const explicitNameMatchesVisibleName = Boolean(
    normalizedUserName &&
      normalizedVisibleName &&
      normalizedUserName === normalizedVisibleName,
  );
  const matchedIdentitySignals = explicitNameMatchesVisibleName
    ? [nameSignal, addressSignal, phoneSignal, websiteSignal].filter(
        (signal): signal is NonNullable<typeof signal> => signal !== undefined,
      )
    : [];
  const directSignalIndexes = output.restaurantSignals.map(
    (signal) => signal.sourceImageIndex,
  );
  const sourceIds = userName
    ? evidenceIdsForIndexes(
        matchedIdentitySignals.map((signal) => signal.sourceImageIndex),
        imageCount,
      )
    : evidenceIdsForIndexes(directSignalIndexes, imageCount);
  const canMergeImageIdentity = !userName || explicitNameMatchesVisibleName;
  const candidateId = allocateId("restaurant", restaurantName, 1);
  const candidate = {
    id: candidateId,
    name: restaurantName,
    address: canMergeImageIdentity ? (addressSignal?.value ?? null) : null,
    website: canMergeImageIdentity ? safeUrl(websiteSignal?.value) : null,
    cuisineLabels: [],
    matchReasons: userName
      ? [
          "Restaurant name entered by the user",
          ...(explicitNameMatchesVisibleName
            ? ["Visible restaurant name conservatively matches the entered name"]
            : []),
        ]
      : ["Restaurant name or logo text visible in the uploaded menu"],
    sourceIds,
    selectedByUser: false,
  };
  const directIdentityConfirmed =
    !userName && Boolean(nameSignal && (addressSignal || phoneSignal || websiteSignal));
  const confirmed = Boolean(userName) || directIdentityConfirmed;

  if (!confirmed) {
    return {
      resolution: {
        status: "likely",
        candidates: [candidate],
        selectedCandidateId: candidateId,
        confirmedBy: null,
        sourceIds,
        limitations: ["A visible name alone requires user confirmation."],
      },
      restaurant: null,
    };
  }

  return {
    resolution: {
      status: "confirmed",
      candidates: [candidate],
      selectedCandidateId: candidateId,
      confirmedBy: userName ? "explicit_input" : "direct_evidence",
      sourceIds,
      limitations: [
        ...(userName
          ? [
              "Restaurant identity is based on explicit user input.",
              "The entered restaurant name was not verified against public web data.",
              explicitNameMatchesVisibleName
                ? "Only conservatively matching image-derived identity and contact signals were merged."
                : "Conflicting or unmatched image-derived identity and contact signals were not merged.",
            ]
          : [
              "Restaurant identity is based only on direct signals visible in uploaded menu images.",
            ]),
      ],
    },
    restaurant: {
      id: candidateId,
      name: restaurantName,
      summary: null,
      address: canMergeImageIdentity ? (addressSignal?.value ?? null) : null,
      phone: canMergeImageIdentity ? (phoneSignal?.value ?? null) : null,
      website: canMergeImageIdentity ? safeUrl(websiteSignal?.value) : null,
      cuisineLabels: [],
      priceLevel: null,
      publicLocation: null,
      sourceIds,
    },
  };
};

export interface AdaptMenuImageModelOutputInput {
  readonly modelOutput: MenuImageModelOutput;
  readonly imageCount: number;
  readonly userEnteredRestaurantName: string | null;
  readonly sourceFingerprint: string;
  readonly versions: AnalysisConsistencyVersionMetadata;
}

export async function adaptMenuImageModelOutput(
  input: AdaptMenuImageModelOutputInput,
): Promise<ConsistentFoodseyoAnalysisPayload> {
  const {
    modelOutput,
    imageCount,
    userEnteredRestaurantName,
    sourceFingerprint,
    versions,
  } = input;
  if (modelOutput.analysisQuality === "unreadable") {
    throw new MenuAnalysisError(
      "MENU_NOT_READABLE",
      "No readable menu content was found in the uploaded images.",
    );
  }
  if (imageCount < 1) {
    throw new MenuAnalysisError("MENU_DISHES_MISSING", "Menu analysis requires an image.");
  }

  validateAllSourceIndexes(modelOutput, imageCount);
  const dishCount = modelOutput.categories.reduce(
    (total, category) => total + category.dishes.length,
    0,
  );
  if (dishCount === 0) {
    throw new MenuAnalysisError(
      "MENU_DISHES_MISSING",
      "No useful menu dishes were extracted.",
    );
  }

  const allocateCategoryId = createIdAllocator();
  const allocateDishId = createIdAllocator();
  const categories: MenuCategory[] = [];
  const dishes: ConsistentDish[] = [];
  let dishSequence = 0;

  const populatedCategories = modelOutput.categories.filter(
    (category) => category.dishes.length > 0,
  );
  for (const [categoryIndex, category] of populatedCategories.entries()) {
    const categoryId = allocateCategoryId("category", category.label, categoryIndex + 1);
    categories.push({ id: categoryId, label: category.label });
    for (const dish of category.dishes) {
      dishSequence += 1;
      const dishId = allocateDishId("dish", dish.name, dishSequence);
      const sourceDishIdentifier = `menu-images:${dish.sourceImageIndexes.join(
        ",",
      )}:dish-${dishSequence}`;
      dishes.push(
        await toDish(
          dish,
          categoryId,
          category.label,
          imageCount,
          dishId,
          sourceDishIdentifier,
          sourceFingerprint,
          versions,
        ),
      );
    }
  }

  const restaurant = resolveRestaurant(modelOutput, imageCount, userEnteredRestaurantName);
  const menuLimitations = unique([
    "The uploaded menu was not compared with a current official source.",
    ...(modelOutput.analysisQuality === "partial"
      ? ["Some menu content was unreadable or incomplete."]
      : []),
    ...modelOutput.warnings,
  ]);

  return {
    restaurantResolution: restaurant.resolution,
    restaurant: restaurant.restaurant,
    menu: {
      title: modelOutput.menuTitle,
      currency: modelOutput.currency,
      categories,
      dishes,
      featuredDishIds: [],
      freshness: {
        status: "could_not_verify",
        checkedAt: null,
        sourceUpdatedAt: null,
        comparedFields: [],
        differences: [],
        sourceIds: [],
        limitation: "The uploaded menu was not compared with a current official source.",
      },
      sourceIds: Array.from({ length: imageCount }, (_, index) => toEvidenceId(index)),
      limitations: menuLimitations,
    },
    orderingGuidance: null,
    evidence: createEvidence(imageCount),
    allergySafetyNotice: ALLERGY_SAFETY_NOTICE,
  };
}
