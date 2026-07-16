import type {
  DietaryAssessment,
  Dish,
  ConsistentDish,
  FoodseyoAnalysis,
  LegacyRestaurantResolution,
  MenuCategory,
  RestaurantIdentityScope,
  RestaurantResolution,
  RestaurantResolutionBasis,
  RestaurantResolutionConflictCode,
} from "../domain/foodseyo-analysis.ts";

const cleanText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const uniqueText = (values: readonly (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
};

const firstText = (...values: readonly (string | null | undefined)[]) =>
  uniqueText(values)[0] ?? null;

const isConsistentDish = (dish: Dish): dish is ConsistentDish =>
  "consistency" in dish && "consistencyWording" in dish;

export const liveDishPath = (dishId: string): string =>
  `/analysis/dishes/${encodeURIComponent(dishId)}`;

const decodeDishId = (dishId: string): string => {
  try {
    return decodeURIComponent(dishId);
  } catch {
    return dishId;
  }
};

export interface LiveDishCardView {
  readonly id: string;
  readonly href: string;
  readonly name: string;
  readonly originalName: string | null;
  readonly description: string | null;
  readonly labels: readonly string[];
}

export interface LiveCategoryView {
  readonly id: string;
  readonly label: string;
  readonly dishes: readonly LiveDishCardView[];
}

export interface LiveOrderingRecommendationView {
  readonly id: string;
  readonly dishNames: readonly string[];
  readonly quantity: number;
  readonly reason: string;
}

export interface LiveOrderingGuidanceView {
  readonly goal: string | null;
  readonly recommendations: readonly LiveOrderingRecommendationView[];
  readonly notes: readonly string[];
}

export interface LiveAnalysisOverviewView {
  readonly restaurantName: string;
  readonly restaurantMatchLabel: string;
  readonly restaurantSummary: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly cuisineLabels: readonly string[];
  readonly dishCount: number;
  readonly dishCountLabel: string;
  readonly completenessLabel: string;
  readonly limitations: readonly string[];
  readonly categories: readonly LiveCategoryView[];
  readonly orderingGuidance: LiveOrderingGuidanceView | null;
}

export interface RestaurantResolutionProvenanceView {
  readonly basis: RestaurantResolutionBasis;
  readonly scope: RestaurantIdentityScope;
  readonly displayName: string | null;
  readonly conflictCode: RestaurantResolutionConflictCode | null;
}

export function getRestaurantResolutionProvenance(
  resolution: LegacyRestaurantResolution | RestaurantResolution,
): RestaurantResolutionProvenanceView {
  if (!("basis" in resolution) || !("scope" in resolution)) {
    return {
      basis: "none",
      scope: "unknown",
      displayName: null,
      conflictCode: null,
    };
  }
  return {
    basis: resolution.basis,
    scope: resolution.scope,
    displayName: cleanText(resolution.displayName),
    conflictCode: resolution.conflictCode ?? null,
  };
}

const toDishCard = (dish: Dish): LiveDishCardView => ({
  id: dish.id,
  href: liveDishPath(dish.id),
  name: dish.name,
  originalName: cleanText(dish.originalName),
  description: firstText(
    dish.menuDescription,
    dish.restaurantSpecific.menuDescription,
    dish.generalKnowledge.definition,
  ),
  labels: isConsistentDish(dish)
    ? uniqueText([
        dish.consistencyWording.basicTastes,
        dish.consistencyWording.flavorNotes,
        dish.consistencyWording.heat,
        dish.consistencyWording.richness,
        dish.consistencyWording.textures,
      ])
    : uniqueText([dish.visibleSpiceLabel, ...dish.visibleDietaryLabels]),
});

const uniqueDishes = (dishes: readonly Dish[]): Dish[] => {
  const seen = new Set<string>();
  return dishes.filter((dish) => {
    if (seen.has(dish.id)) return false;
    seen.add(dish.id);
    return true;
  });
};

const uniqueCategories = (categories: readonly MenuCategory[]): MenuCategory[] => {
  const seen = new Set<string>();
  return categories.filter((category) => {
    if (seen.has(category.id)) return false;
    seen.add(category.id);
    return true;
  });
};

export function createLiveAnalysisOverview(
  analysis: FoodseyoAnalysis,
): LiveAnalysisOverviewView {
  const menu = analysis.payload.menu;
  const dishes = uniqueDishes(menu?.dishes ?? []);
  const categories = uniqueCategories(menu?.categories ?? []);
  const resolution = analysis.payload.restaurantResolution;
  const resolutionProvenance = getRestaurantResolutionProvenance(resolution);
  const selectedCandidate = resolution.selectedCandidateId
    ? resolution.candidates.find(
        (candidate) => candidate.id === resolution.selectedCandidateId,
      )
    : null;
  const candidate = selectedCandidate ?? resolution.candidates[0] ?? null;
  const canNameRestaurant =
    resolution.status === "confirmed" || resolution.status === "likely";
  const restaurantName = canNameRestaurant
    ? firstText(
        resolutionProvenance.displayName,
        analysis.payload.restaurant?.name,
        candidate?.name,
      ) ??
      "Restaurant not confirmed"
    : "Restaurant not confirmed";
  const restaurantMatchLabel =
    resolution.status === "confirmed"
      ? "Restaurant confirmed"
      : resolution.status === "likely"
        ? "Likely match"
        : "Restaurant not confirmed";

  const dishesByCategory = new Map<string, LiveDishCardView[]>();
  for (const category of categories) dishesByCategory.set(category.id, []);
  const uncategorized: LiveDishCardView[] = [];
  for (const dish of dishes) {
    const view = toDishCard(dish);
    const target = dish.categoryId ? dishesByCategory.get(dish.categoryId) : null;
    if (target) target.push(view);
    else uncategorized.push(view);
  }
  const categoryViews: LiveCategoryView[] = categories.flatMap((category) => {
    const categoryDishes = dishesByCategory.get(category.id) ?? [];
    return categoryDishes.length
      ? [{ id: category.id, label: category.label, dishes: categoryDishes }]
      : [];
  });
  if (uncategorized.length) {
    categoryViews.push({ id: "uncategorized", label: "Menu", dishes: uncategorized });
  }

  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const guidance = analysis.payload.orderingGuidance;
  const recommendations = (guidance?.recommendations ?? []).flatMap(
    (recommendation) => {
      const dishNames = uniqueText(
        recommendation.dishIds.map((dishId) => dishById.get(dishId)?.name),
      );
      return dishNames.length
        ? [
            {
              id: recommendation.id,
              dishNames,
              quantity: recommendation.quantity,
              reason: recommendation.reason,
            },
          ]
        : [];
    },
  );
  const guidanceNotes = uniqueText([
    ...(guidance?.assumptions ?? []),
    ...(guidance?.warnings ?? []),
  ]);
  const orderingGuidance = guidance &&
    (cleanText(guidance.goal) || recommendations.length || guidanceNotes.length)
    ? {
        goal: cleanText(guidance.goal),
        recommendations,
        notes: guidanceNotes,
      }
    : null;

  const limitations = uniqueText([
    ...resolution.limitations,
    ...(menu?.limitations ?? []),
    ...analysis.issues
      .filter((issue) =>
        [
          "RESTAURANT_UNCONFIRMED",
          "RESTAURANT_MATCH_LIKELY",
          "ANALYSIS_PARTIAL",
        ].includes(issue.code),
      )
      .map((issue) => issue.message),
  ]);

  return {
    restaurantName,
    restaurantMatchLabel,
    restaurantSummary: cleanText(analysis.payload.restaurant?.summary),
    address: canNameRestaurant
      ? firstText(analysis.payload.restaurant?.address, candidate?.address)
      : null,
    phone: canNameRestaurant ? cleanText(analysis.payload.restaurant?.phone) : null,
    website: canNameRestaurant
      ? firstText(analysis.payload.restaurant?.website, candidate?.website)
      : null,
    cuisineLabels: canNameRestaurant
      ? uniqueText([
          ...(analysis.payload.restaurant?.cuisineLabels ?? []),
          ...(candidate?.cuisineLabels ?? []),
        ])
      : [],
    dishCount: dishes.length,
    dishCountLabel: `${dishes.length} ${dishes.length === 1 ? "dish" : "dishes"} found`,
    completenessLabel:
      analysis.status === "complete"
        ? "Menu details extracted"
        : "Some menu details may be missing",
    limitations,
    categories: categoryViews,
    orderingGuidance,
  };
}

export interface LiveDietaryNoteView {
  readonly label: string;
  readonly status: string;
  readonly detail: string | null;
}

export interface LiveDishDetailView {
  readonly id: string;
  readonly name: string;
  readonly originalName: string | null;
  readonly pronunciation: string | null;
  readonly categoryLabel: string | null;
  readonly description: string | null;
  readonly expectations: readonly string[];
  readonly ingredientsTitle: string | null;
  readonly ingredients: readonly string[];
  readonly statedIngredients: readonly string[];
  readonly typicalIngredients: readonly string[];
  readonly uncertainIngredientsSummary: string | null;
  readonly dietaryNotes: readonly LiveDietaryNoteView[];
  readonly orderingNotes: readonly string[];
  readonly uncertaintyNotes: readonly string[];
  readonly allergySafetyNotice: string;
}

const dietaryStatusLabel: Record<DietaryAssessment["status"], string> = {
  confirmed_present: "Listed as present",
  likely_present: "May be present",
  confirmed_absent: "Listed as absent",
  may_be_modifiable: "May be modifiable",
  unknown: "Not confirmed",
  confirm_with_staff: "Confirm with staff",
};

export function findLiveDish(
  analysis: FoodseyoAnalysis,
  routeDishId: string,
): Dish | null {
  const targetId = decodeDishId(routeDishId);
  return uniqueDishes(analysis.payload.menu?.dishes ?? []).find(
    (dish) => dish.id === targetId,
  ) ?? null;
}

export function createLiveDishDetail(
  analysis: FoodseyoAnalysis,
  routeDishId: string,
): LiveDishDetailView | null {
  const dish = findLiveDish(analysis, routeDishId);
  if (!dish) return null;
  const category = analysis.payload.menu?.categories.find(
    (candidate) => candidate.id === dish.categoryId,
  );
  const confirmedIngredients = uniqueText(
    dish.restaurantSpecific.confirmedIngredients.values,
  );
  const consistent = isConsistentDish(dish);
  const ingredients = consistent
    ? []
    : confirmedIngredients.length
      ? confirmedIngredients
      : uniqueText(dish.generalKnowledge.commonIngredients);
  const statedIngredients = consistent
    ? dish.consistency.ingredients
        .filter((ingredient) => ingredient.basis === "stated")
        .map((ingredient) => ingredient.name)
    : [];
  const typicalIngredients = consistent
    ? dish.consistency.ingredients
        .filter((ingredient) => ingredient.basis === "typical")
        .map((ingredient) => ingredient.name)
    : [];
  const expectations = consistent
    ? uniqueText([
        dish.consistencyWording.basicTastes,
        dish.consistencyWording.flavorNotes,
        dish.consistencyWording.heat,
        dish.consistencyWording.richness,
        dish.consistencyWording.textures,
      ])
    : uniqueText([
        ...dish.generalKnowledge.typicalTaste,
        ...dish.generalKnowledge.typicalTexture,
        dish.visibleSpiceLabel,
        dish.generalKnowledge.typicalSpice,
        dish.generalKnowledge.typicalPreparation,
      ]);
  const dietaryNotes = dish.dietary.items.map((item) => ({
    label: item.label,
    status: dietaryStatusLabel[item.status],
    detail: firstText(item.explanation, item.limitation),
  }));
  const orderingNotes = uniqueText([
    ...dish.restaurantSpecific.modificationOptions.values,
    ...dish.generalKnowledge.orderingConsiderations,
  ]);
  const uncertaintyNotes = uniqueText([
    ...dish.limitations,
    ...dish.restaurantSpecific.limitations,
    dish.restaurantSpecific.confirmedIngredients.limitation,
    dish.restaurantSpecific.preparationDetails.limitation,
    ...dish.dietary.items.map((item) => item.limitation),
  ]);

  return {
    id: dish.id,
    name: dish.name,
    originalName: cleanText(dish.originalName),
    pronunciation: cleanText(dish.pronunciation),
    categoryLabel: cleanText(category?.label),
    description: firstText(
      dish.menuDescription,
      dish.restaurantSpecific.menuDescription,
      dish.generalKnowledge.definition,
    ),
    expectations,
    ingredientsTitle: consistent
      ? null
      : confirmedIngredients.length
        ? "Ingredients shown"
        : "Common ingredients",
    ingredients,
    statedIngredients,
    typicalIngredients,
    uncertainIngredientsSummary:
      consistent && dish.consistencyWording.uncertainIngredients
        ? "Some ingredients could not be confirmed."
        : null,
    dietaryNotes,
    orderingNotes,
    uncertaintyNotes,
    allergySafetyNotice: analysis.payload.allergySafetyNotice,
  };
}
