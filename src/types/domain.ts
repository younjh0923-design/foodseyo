import type {
  Availability,
  ClaimBasis,
  EvidenceSourceType,
  ReviewConsensusStatus,
} from "@/domain/foodseyo-analysis";

export type EvidenceBadgeKind =
  | EvidenceSourceType
  | "general_food_knowledge"
  | "ai_inference"
  | "unavailable";

export type SpicePreference = "mild" | "medium" | "hot";
export type PreferredLanguage = "English" | "Korean";

export interface EvidenceReference {
  sourceType: EvidenceSourceType | null;
  basis: ClaimBasis;
  availability: Availability;
  label: string;
  note?: string;
}

export interface ReviewConsensus {
  level: ReviewConsensusStatus;
  sourceGroupCount: number;
  evidenceCount: number;
  freshness: string;
  positiveThemes: string[];
  negativeThemes: string[];
  disagreements: string[];
  limitation: string;
}

export interface DietaryFact {
  label: string;
  status: string;
  evidence: string;
  badgeKind: EvidenceBadgeKind;
  action?: string;
}

export interface DishOverview {
  whatItIs: string;
  regionalBackground: string;
  mainIngredients: string[];
  cookingMethod: string;
  textureAndFlavor: string;
  similarTo: string;
  portionGuidance: string;
  generalKnowledge: string;
  atRestaurant: string | null;
}

export interface Dish {
  id: string;
  name: string;
  localName: string | null;
  pronunciation: string | null;
  category: string;
  shortDescription: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  imageSource: string;
  imagePosition?: string;
  tasteTags: string[];
  textureTags: string[];
  spiceLevel: string;
  representative: boolean;
  reviewBadge: string;
  overview: DishOverview;
  reviewConsensus: ReviewConsensus;
  dietary: DietaryFact[];
  evidence: EvidenceReference[];
}

export interface Restaurant {
  id: string;
  name: string;
  localName: string | null;
  location: string;
  cuisine: string;
  priceLevel: "$" | "$$" | "$$$" | "$$$$" | "Unknown";
  shortSummary: string;
  imageUrl: string | null;
  imageSource: string;
  representativeDishIds: string[];
  dishes: Dish[];
}

export interface FoodPassport {
  allergies: string[];
  diets: string[];
  avoidedIngredients: string[];
  spicePreference: SpicePreference;
  preferredLanguage: PreferredLanguage;
  configured: boolean;
}

export interface MealPreferences {
  partySize: "1" | "2" | "3-4" | "5+";
  budgetLevel: "$" | "$$" | "$$$";
  goal: "Signature dishes" | "Local experience" | "Best value" | "Try something new";
  sharing: "Share dishes" | "Individual meals";
}

export interface OrderRecommendationItem {
  dishId: string;
  quantity: number;
  reason: string;
}

export interface OrderRecommendation {
  items: OrderRecommendationItem[];
  estimatedTotal: number;
  currency: string;
  summary: string;
  warnings: string[];
}
