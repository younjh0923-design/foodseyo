import { demoFoodseyoAnalysis } from "@/data/demoFoodseyoAnalysis";
import type {
  DietaryAssessment,
  Dish as AnalysisDish,
  EvidenceItem as AnalysisEvidenceItem,
} from "@/domain/foodseyo-analysis";
import type {
  DietaryFact,
  Dish,
  EvidenceBadgeKind,
  EvidenceReference,
  Restaurant,
} from "@/types/domain";
import { getReusableDishImageSource } from "@/services/analysis/image-display";

const analysisMenu = demoFoodseyoAnalysis.payload.menu;
const analysisRestaurant = demoFoodseyoAnalysis.payload.restaurant;

if (!analysisMenu || !analysisRestaurant) {
  throw new Error("The canonical Foodseyo demo fixture requires a restaurant and menu.");
}

const categoryById = (categoryId: string | null): Dish["category"] => {
  const label = analysisMenu.categories.find((category) => category.id === categoryId)?.label;
  return label ?? "Other";
};

const evidenceById = (id: string): AnalysisEvidenceItem | null =>
  demoFoodseyoAnalysis.payload.evidence.find((item) => item.id === id) ?? null;

const firstEvidenceSource = (sourceIds: string[]) =>
  sourceIds.map(evidenceById).find((item) => item !== null)?.sourceType ?? null;

const dietaryBadgeKind = (assessment: DietaryAssessment): EvidenceBadgeKind => {
  if (assessment.status === "confirm_with_staff") return "staff_confirmation";
  if (assessment.basis === "general_food_knowledge") return "general_food_knowledge";
  if (assessment.basis === "ai_inference") return "ai_inference";
  return firstEvidenceSource(assessment.sourceIds) ?? "unavailable";
};

const dietaryStatusLabel: Record<DietaryAssessment["status"], string> = {
  confirmed_present: "Confirmed present",
  likely_present: "Likely included",
  confirmed_absent: "Not present in the available evidence",
  may_be_modifiable: "Ask whether modification is available",
  unknown: "Information unavailable",
  confirm_with_staff: "Confirm with staff",
};

const toDietaryFact = (assessment: DietaryAssessment): DietaryFact => ({
  label: assessment.label,
  status: dietaryStatusLabel[assessment.status],
  evidence:
    assessment.explanation ?? assessment.limitation ?? "No supporting detail is available.",
  badgeKind: dietaryBadgeKind(assessment),
  action:
    assessment.status === "confirm_with_staff" ||
    assessment.status === "unknown" ||
    assessment.status === "may_be_modifiable"
      ? "Confirm with staff"
      : undefined,
});

const toEvidenceReferences = (dish: AnalysisDish): EvidenceReference[] => {
  const sourceReferences = dish.evidenceIds.flatMap((id) => {
    const evidence = evidenceById(id);
    if (!evidence) return [];

    return [
      {
        sourceType: evidence.sourceType,
        basis:
          evidence.sourceType === "uploaded_menu" ||
          evidence.sourceType === "user_provided_screen" ||
          evidence.sourceType === "demo_data"
            ? "direct_observation"
            : "external_source",
        availability: "available",
        label: evidence.sourceLabel ?? evidence.title,
        note: evidence.limitations[0],
      } satisfies EvidenceReference,
    ];
  });

  return [
    ...sourceReferences,
    {
      sourceType: null,
      basis: "general_food_knowledge",
      availability: "available",
      label: "General dish knowledge",
    },
  ];
};

const toDishViewModel = (dish: AnalysisDish): Dish => {
  const general = dish.generalKnowledge;
  const restaurantSpecific = dish.restaurantSpecific;

  return {
    id: dish.id,
    name: dish.name,
    localName: dish.originalName,
    pronunciation: dish.pronunciation,
    category: categoryById(dish.categoryId),
    shortDescription:
      dish.menuDescription ?? general.definition ?? "Dish description unavailable.",
    price: dish.price?.amount ?? null,
    currency: dish.price?.currency ?? analysisMenu.currency ?? "",
    imageUrl: getReusableDishImageSource(dish.image),
    imageSource: dish.image.userFacingLabel,
    imagePosition: dish.image.displayPosition ?? undefined,
    tasteTags: general.typicalTaste,
    textureTags: general.typicalTexture,
    spiceLevel: dish.visibleSpiceLabel ?? general.typicalSpice ?? "Unknown",
    representative: analysisMenu.featuredDishIds.includes(dish.id),
    reviewBadge:
      dish.reviews.status === "insufficient" ? "Insufficient evidence" : "Repeated opinion",
    overview: {
      whatItIs: general.definition ?? "General dish definition unavailable.",
      regionalBackground:
        general.regionalBackground ?? "Regional background is unavailable.",
      mainIngredients:
        general.commonIngredients.length > 0
          ? general.commonIngredients
          : ["Ingredients vary by preparation"],
      cookingMethod:
        general.typicalPreparation ??
        "Preparation varies by restaurant and is not confirmed in this demo.",
      textureAndFlavor:
        [...general.typicalTaste, ...general.typicalTexture].join(" · ") ||
        "Flavor and texture may vary by preparation.",
      similarTo:
        general.similarDishes.join(", ") ||
        "Ask the restaurant team for the closest familiar comparison.",
      portionGuidance:
        general.orderingConsiderations.join(" ") ||
        "Portion size is not confirmed. Ask staff if you plan to share.",
      generalKnowledge:
        general.definition ?? "General dish knowledge is unavailable.",
      atRestaurant: restaurantSpecific.menuDescription,
    },
    reviewConsensus: {
      level: dish.reviews.status,
      sourceGroupCount: dish.reviews.sourceGroupCount,
      evidenceCount: dish.reviews.evidenceCount,
      freshness: dish.reviews.freshness ?? "Freshness unavailable",
      positiveThemes: dish.reviews.repeatedPositives,
      negativeThemes: dish.reviews.repeatedNegatives,
      disagreements: dish.reviews.disagreements,
      limitation: dish.reviews.limitation ?? "Review limitations are unavailable.",
    },
    dietary: dish.dietary.items.map(toDietaryFact),
    evidence: toEvidenceReferences(dish),
  };
};

const dishes = analysisMenu.dishes.map(toDishViewModel);
const restaurantImage = analysisMenu.dishes[0]?.image ?? null;

export const demoRestaurant: Restaurant = {
  id: analysisRestaurant.id ?? "demo-restaurant",
  name: analysisRestaurant.name ?? "Demo restaurant",
  localName: null,
  location: analysisRestaurant.address ?? "Location unavailable",
  cuisine: analysisRestaurant.cuisineLabels.join(", ") || "Cuisine unavailable",
  priceLevel: analysisRestaurant.priceLevel ?? "Unknown",
  shortSummary:
    analysisRestaurant.summary ??
    "A clearly labeled static demo restaurant for the Foodseyo experience.",
  imageUrl: restaurantImage ? getReusableDishImageSource(restaurantImage) : null,
  imageSource: restaurantImage?.userFacingLabel ?? "Image unavailable",
  representativeDishIds: analysisMenu.featuredDishIds,
  dishes,
};

export const getDish = (dishId: string) =>
  demoRestaurant.dishes.find((item) => item.id === dishId) ?? null;
