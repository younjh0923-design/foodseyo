import type {
  DietaryAssessment,
  Dish,
  FoodseyoAnalysis,
  MenuCategory,
} from "../domain/foodseyo-analysis.ts";
import type { FoodPassport } from "../types/domain.ts";

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
  labels: uniqueText([
    dish.visibleSpiceLabel,
    ...dish.visibleDietaryLabels,
  ]),
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
  const selectedCandidate = resolution.selectedCandidateId
    ? resolution.candidates.find(
        (candidate) => candidate.id === resolution.selectedCandidateId,
      )
    : null;
  const candidate = selectedCandidate ?? resolution.candidates[0] ?? null;
  const canNameRestaurant =
    resolution.status === "confirmed" || resolution.status === "likely";
  const restaurantName = canNameRestaurant
    ? firstText(analysis.payload.restaurant?.name, candidate?.name) ??
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
  readonly ingredientsTitle: string;
  readonly ingredients: readonly string[];
  readonly dietaryNotes: readonly LiveDietaryNoteView[];
  readonly orderingNotes: readonly string[];
  readonly uncertaintyNotes: readonly string[];
  readonly allergySafetyNotice: string;
  readonly canonicalDish: Dish;
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
  const ingredients = confirmedIngredients.length
    ? confirmedIngredients
    : uniqueText(dish.generalKnowledge.commonIngredients);
  const expectations = uniqueText([
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
    ingredientsTitle: confirmedIngredients.length
      ? "Ingredients shown"
      : "Common ingredients",
    ingredients,
    dietaryNotes,
    orderingNotes,
    uncertaintyNotes,
    allergySafetyNotice: analysis.payload.allergySafetyNotice,
    canonicalDish: dish,
  };
}

export interface PassportComparisonView {
  readonly kind: "match" | "caution" | "unknown";
  readonly label: string;
  readonly message: string;
}

const passportKeyByLabel: Record<string, DietaryAssessment["key"]> = {
  peanuts: "peanuts",
  "tree nuts": "tree_nuts",
  shellfish: "shellfish",
  dairy: "dairy",
  eggs: "eggs",
  gluten: "gluten",
  vegetarian: "vegetarian",
  vegan: "vegan",
  "halal preference": "halal_preference",
  "gluten avoidance": "gluten_avoidance",
};

const findDietaryItem = (dish: Dish, label: string) => {
  const key = passportKeyByLabel[label.toLowerCase()];
  return key ? dish.dietary.items.find((item) => item.key === key) : null;
};

const spiceRank = (value: string | null): number | null => {
  const normalized = value?.toLowerCase() ?? "";
  if (/extra hot|very hot/.test(normalized)) return 4;
  if (/mild|low|not spicy/.test(normalized)) return 1;
  if (/medium|moderate/.test(normalized)) return 2;
  if (/hot|spicy/.test(normalized)) return 3;
  return null;
};

export function compareDishWithPassport(
  dish: Dish,
  passport: FoodPassport,
): PassportComparisonView[] {
  if (!passport.configured) return [];
  const comparisons: PassportComparisonView[] = [];

  for (const allergy of passport.allergies) {
    const item = findDietaryItem(dish, allergy);
    if (!item || ["unknown", "confirm_with_staff"].includes(item.status)) {
      comparisons.push({
        kind: "unknown",
        label: allergy,
        message: "Ingredient information is incomplete. Ask the restaurant about ingredients and cross-contact.",
      });
    } else if (["confirmed_present", "likely_present"].includes(item.status)) {
      comparisons.push({
        kind: "caution",
        label: allergy,
        message: `${item.label} is listed as present or possible. Ask the restaurant before ordering.`,
      });
    } else if (item.status === "confirmed_absent") {
      comparisons.push({
        kind: "match",
        label: allergy,
        message: `${item.label} is listed as absent, but confirm ingredients and cross-contact with staff.`,
      });
    } else {
      comparisons.push({
        kind: "caution",
        label: allergy,
        message: `${item.label} may require a modification. Confirm directly with staff.`,
      });
    }
  }

  for (const diet of passport.diets) {
    const item = findDietaryItem(dish, diet);
    if (!item || ["unknown", "confirm_with_staff"].includes(item.status)) {
      comparisons.push({
        kind: "unknown",
        label: diet,
        message: "The menu does not confirm this preference. Ask the restaurant.",
      });
    } else if (item.status === "confirmed_present") {
      comparisons.push({
        kind: "match",
        label: diet,
        message: `${item.label} is listed for this dish. Confirm preparation details with staff if needed.`,
      });
    } else if (item.status === "confirmed_absent") {
      comparisons.push({
        kind: "caution",
        label: diet,
        message: `${item.label} is not listed for this dish.`,
      });
    } else {
      comparisons.push({
        kind: "caution",
        label: diet,
        message: `${item.label} may be possible with a modification. Ask the restaurant.`,
      });
    }
  }

  const selectedSpiceRank = { mild: 1, medium: 2, hot: 3 }[passport.spicePreference];
  const dishSpiceRank = spiceRank(
    firstText(dish.visibleSpiceLabel, dish.generalKnowledge.typicalSpice),
  );
  if (dishSpiceRank === null) {
    comparisons.push({
      kind: "unknown",
      label: "Spice",
      message: "The spice level is not clear. Ask the restaurant before ordering.",
    });
  } else if (dishSpiceRank > selectedSpiceRank) {
    comparisons.push({
      kind: "caution",
      label: "Spice",
      message: `This may be hotter than your ${passport.spicePreference} preference.`,
    });
  } else {
    comparisons.push({
      kind: "match",
      label: "Spice",
      message: `The listed spice level is within your ${passport.spicePreference} preference.`,
    });
  }

  const ingredientText = uniqueText([
    ...dish.restaurantSpecific.confirmedIngredients.values,
    ...dish.generalKnowledge.commonIngredients,
  ]).join(" ").toLowerCase();
  for (const avoided of passport.avoidedIngredients) {
    if (!ingredientText.includes(avoided.toLowerCase())) continue;
    comparisons.push({
      kind: "caution",
      label: avoided,
      message: `${avoided} appears in the available ingredient information. Confirm the recipe with staff.`,
    });
  }

  return comparisons;
}
