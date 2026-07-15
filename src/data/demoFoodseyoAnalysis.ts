import {
  ALLERGY_SAFETY_NOTICE,
  FOODSEYO_ANALYSIS_SCHEMA_VERSION,
  FoodseyoAnalysisSchema,
  type ClaimEvidence,
  type DietaryAssessment,
  type Dish,
  type ReviewConsensus,
} from "../domain/foodseyo-analysis.ts";

const DEMO_RESTAURANT_EVIDENCE_ID = "demo-restaurant-fixture";
const DEMO_MENU_EVIDENCE_ID = "demo-menu-fixture";
const DEMO_REVIEW_EVIDENCE_ID = "demo-review-fixture";

const demoMenuClaim = (): ClaimEvidence => ({
  availability: "available",
  basis: "direct_observation",
  sourceIds: [DEMO_MENU_EVIDENCE_ID],
  limitation: "This value comes from a static demo fixture, not a live menu.",
});

const unavailableDemoClaim = (
  limitation = "The static demo fixture does not confirm this restaurant-specific detail.",
): ClaimEvidence => ({
  availability: "unknown",
  basis: "direct_observation",
  sourceIds: [DEMO_MENU_EVIDENCE_ID],
  limitation,
});

const createDemoReview = (
  status: ReviewConsensus["status"] = "moderate",
): ReviewConsensus => ({
  status,
  sourceGroupCount: status === "strong" ? 3 : 2,
  evidenceCount: status === "strong" ? 8 : 5,
  freshness: "Static demo evidence dated 2026-07-15",
  repeatedPositives:
    status === "strong"
      ? [
          "Rich and flavorful broth",
          "Frequently recommended as a signature dish",
          "Generous portion",
        ]
      : ["Well-balanced flavor", "Frequently mentioned by demo diners"],
  repeatedNegatives:
    status === "strong"
      ? ["Some demo diners find the broth salty", "The texture may feel heavy"]
      : ["Taste preferences vary"],
  disagreements: ["Spice perception differs between demo reviewers"],
  rationale: "Repeated themes are stored only to demonstrate the review UI.",
  sourceIds: [DEMO_REVIEW_EVIDENCE_ID],
  limitation: "Illustrative demo evidence; this is not a live review feed.",
});

const createGenericDietaryAssessment = (): DietaryAssessment => ({
  key: "ingredient_details",
  label: "Ingredient details",
  status: "confirm_with_staff",
  explanation: "The static demo description does not establish full ingredients.",
  basis: "direct_observation",
  sourceIds: [DEMO_MENU_EVIDENCE_ID],
  limitation: "Confirm ingredients and cross-contact with restaurant staff.",
});

type DemoDishInput = Pick<
  Dish,
  | "id"
  | "name"
  | "originalName"
  | "pronunciation"
  | "categoryId"
  | "menuDescription"
  | "visibleSpiceLabel"
> & {
  priceAmount: number;
  taste: string[];
  texture: string[];
  typicalPreparation: string;
  regionalBackground: string;
  commonIngredients: string[];
  similarDishes: string[];
  orderingConsiderations: string[];
  imagePosition: string;
  reviewStatus?: ReviewConsensus["status"];
  dietary?: DietaryAssessment[];
  signature?: boolean;
  proteinOptions?: string[];
};

const createDemoDish = (input: DemoDishInput): Dish => {
  const signature = input.signature ?? false;
  const proteinOptions = input.proteinOptions ?? [];

  return {
    id: input.id,
    name: input.name,
    originalName: input.originalName,
    pronunciation: input.pronunciation,
    categoryId: input.categoryId,
    menuDescription: input.menuDescription,
    price: {
      amount: input.priceAmount,
      currency: "CAD",
      displayText: `CAD ${input.priceAmount}`,
    },
    priceEvidence: demoMenuClaim(),
    priceOptions: [],
    options: [],
    visibleSpiceLabel: input.visibleSpiceLabel,
    visibleDietaryLabels: [],
    generalKnowledge: {
      definition: input.menuDescription,
      regionalBackground: input.regionalBackground,
      typicalTaste: input.taste,
      typicalTexture: input.texture,
      typicalSpice: input.visibleSpiceLabel,
      typicalPreparation: input.typicalPreparation,
      commonIngredients: input.commonIngredients,
      similarDishes: input.similarDishes,
      orderingConsiderations: input.orderingConsiderations,
    },
    restaurantSpecific: {
      menuDescription: input.menuDescription,
      confirmedIngredients: {
        values: [],
        ...unavailableDemoClaim("Full restaurant-specific ingredients are not confirmed."),
      },
      preparationDetails: {
        values: [],
        ...unavailableDemoClaim("Restaurant-specific preparation is not confirmed."),
      },
      signatureStatus: {
        value: signature ? "confirmed_signature" : "not_confirmed",
        availability: signature ? "available" : "insufficient",
        basis: "external_source",
        sourceIds: [DEMO_REVIEW_EVIDENCE_ID],
        limitation: signature
          ? "Signature status is part of the static demo fixture."
          : "The fixture does not establish signature status for this dish.",
      },
      proteinOptions: {
        values: proteinOptions,
        availability: proteinOptions.length > 0 ? "available" : "unknown",
        basis: "direct_observation",
        sourceIds: [DEMO_MENU_EVIDENCE_ID],
        limitation:
          proteinOptions.length > 0
            ? "Options are static demo values."
            : "Protein options are not confirmed.",
      },
      modificationOptions: {
        values: [],
        ...unavailableDemoClaim("Modification options are not confirmed."),
      },
      sourceIds: [DEMO_MENU_EVIDENCE_ID],
      limitations: ["Restaurant-specific values are static demo data, not live evidence."],
    },
    image: {
      url: null,
      localAssetPath: "/images/thai-dishes.png",
      sourceType: "demo_data",
      sourcePageUrl: null,
      restaurantSpecific: false,
      userFacingLabel: "Demo reference image",
      attribution: null,
      rightsStatus: "cleared",
      limitation: "Demo reference image. Actual presentation may differ.",
      altText: `${input.name} shown in a shared demo food reference image`,
      displayPosition: input.imagePosition,
    },
    reviews: createDemoReview(input.reviewStatus),
    dietary: {
      items: input.dietary ?? [createGenericDietaryAssessment()],
      warning: ALLERGY_SAFETY_NOTICE,
    },
    evidenceIds: [DEMO_MENU_EVIDENCE_ID, DEMO_REVIEW_EVIDENCE_ID],
    limitations: ["This dish is part of a static product demo."],
  };
};

const dishes: Dish[] = [
  createDemoDish({
    id: "khao-soi",
    name: "Khao Soi",
    originalName: "ข้าวซอย",
    pronunciation: "kow soy",
    categoryId: "noodles",
    menuDescription:
      "Coconut curry noodle soup with crispy noodles and pickled mustard greens.",
    priceAmount: 18,
    taste: ["Rich", "Aromatic", "Mild spicy"],
    texture: ["Creamy", "Crispy"],
    visibleSpiceLabel: "Mild",
    typicalPreparation:
      "Soft egg noodles are commonly served in coconut curry broth with crisp noodle toppings.",
    regionalBackground: "Commonly associated with Chiang Mai and Northern Thailand.",
    commonIngredients: [
      "Egg noodles",
      "Coconut milk",
      "Curry paste",
      "Pickled mustard greens",
      "Shallots",
      "Crispy noodles",
    ],
    similarDishes: ["Laksa"],
    orderingConsiderations: [
      "Often ordered as an individual main; ask staff about portion size before sharing.",
    ],
    imagePosition: "18% 50%",
    reviewStatus: "strong",
    signature: true,
    proteinOptions: ["Chicken", "Beef"],
    dietary: [
      {
        key: "vegetarian",
        label: "Vegetarian",
        status: "may_be_modifiable",
        explanation: "Ask whether a vegetarian modification is available.",
        basis: "direct_observation",
        sourceIds: [DEMO_MENU_EVIDENCE_ID],
        limitation: "The static fixture does not confirm a vegetarian preparation.",
      },
      {
        key: "vegan",
        label: "Vegan",
        status: "confirm_with_staff",
        explanation:
          "The listed demo options are chicken and beef, but vegan availability was not confirmed.",
        basis: "direct_observation",
        sourceIds: [DEMO_MENU_EVIDENCE_ID],
        limitation:
          "Confirm current ingredients, broth, preparation, and modification options with staff.",
      },
      {
        key: "gluten",
        label: "Gluten",
        status: "likely_present",
        explanation: "Khao Soi commonly uses wheat-based egg noodles.",
        basis: "general_food_knowledge",
        sourceIds: [],
        limitation: "General recipes do not confirm this restaurant's ingredients.",
      },
      {
        key: "coconut",
        label: "Coconut",
        status: "likely_present",
        explanation: "The static demo description names coconut curry.",
        basis: "direct_observation",
        sourceIds: [DEMO_MENU_EVIDENCE_ID],
        limitation: "Confirm the current recipe with staff.",
      },
      {
        key: "peanuts",
        label: "Peanuts",
        status: "unknown",
        explanation: "The static demo description does not address peanuts.",
        basis: "direct_observation",
        sourceIds: [DEMO_MENU_EVIDENCE_ID],
        limitation: "Confirm ingredients and cross-contact with staff.",
      },
      {
        key: "cross_contact",
        label: "Cross-contact",
        status: "confirm_with_staff",
        explanation: "Kitchen practices are not included in the demo fixture.",
        basis: "direct_observation",
        sourceIds: [DEMO_MENU_EVIDENCE_ID],
        limitation: "Foodseyo cannot guarantee allergy safety.",
      },
    ],
  }),
  createDemoDish({
    id: "sai-ua",
    name: "Sai Ua",
    originalName: null,
    pronunciation: null,
    categoryId: "sides",
    menuDescription: "Northern Thai herb sausage.",
    priceAmount: 12,
    taste: ["Herby", "Savory", "Grilled"],
    texture: ["Juicy", "Charred"],
    visibleSpiceLabel: "Mild",
    typicalPreparation: "Typically seasoned with herbs and grilled.",
    regionalBackground: "A sausage style associated with Northern Thailand.",
    commonIngredients: ["Pork", "Herbs", "Spices"],
    similarDishes: ["Herb sausage"],
    orderingConsiderations: ["Often suitable as a shareable side."],
    imagePosition: "52% 54%",
  }),
  createDemoDish({
    id: "pad-kra-pao",
    name: "Pad Kra Pao",
    originalName: null,
    pronunciation: null,
    categoryId: "rice",
    menuDescription: "Stir-fried basil with rice.",
    priceAmount: 17,
    taste: ["Savory", "Peppery", "Medium spicy"],
    texture: ["Tender", "Crisp-edged"],
    visibleSpiceLabel: "Medium",
    typicalPreparation: "Typically stir-fried quickly with basil and served over rice.",
    regionalBackground: "A widely known Thai rice dish.",
    commonIngredients: ["Basil", "Chili", "Rice"],
    similarDishes: ["Basil stir-fry"],
    orderingConsiderations: ["Commonly ordered as an individual rice plate."],
    imagePosition: "54% 60%",
  }),
  createDemoDish({
    id: "green-curry",
    name: "Green Curry",
    originalName: null,
    pronunciation: null,
    categoryId: "curry",
    menuDescription: "Coconut green curry.",
    priceAmount: 19,
    taste: ["Creamy", "Herbal", "Medium spicy"],
    texture: ["Silky", "Tender"],
    visibleSpiceLabel: "Medium",
    typicalPreparation: "Typically simmered as a coconut-based curry.",
    regionalBackground: "A Thai curry style known for green chili and herbs.",
    commonIngredients: ["Coconut milk", "Green curry paste", "Herbs"],
    similarDishes: ["Red curry"],
    orderingConsiderations: ["Ask whether rice is included before planning a shared order."],
    imagePosition: "84% 32%",
  }),
  createDemoDish({
    id: "mango-sticky-rice",
    name: "Mango Sticky Rice",
    originalName: null,
    pronunciation: null,
    categoryId: "dessert",
    menuDescription: "Coconut sticky rice with mango.",
    priceAmount: 10,
    taste: ["Sweet", "Creamy", "Fruity"],
    texture: ["Chewy", "Soft"],
    visibleSpiceLabel: "None",
    typicalPreparation: "Typically served with ripe mango and coconut-seasoned sticky rice.",
    regionalBackground: "A popular Thai dessert pairing fruit and glutinous rice.",
    commonIngredients: ["Mango", "Glutinous rice", "Coconut milk"],
    similarDishes: ["Coconut rice pudding"],
    orderingConsiderations: ["Often works as a shared dessert."],
    imagePosition: "72% 72%",
  }),
  createDemoDish({
    id: "tom-yum-soup",
    name: "Tom Yum Soup",
    originalName: null,
    pronunciation: null,
    categoryId: "curry",
    menuDescription: "Hot and sour aromatic soup.",
    priceAmount: 15,
    taste: ["Sour", "Fragrant", "Spicy"],
    texture: ["Brothy", "Tender"],
    visibleSpiceLabel: "Hot",
    typicalPreparation: "Typically simmered with aromatic herbs and sour seasoning.",
    regionalBackground: "A Thai soup style known for hot, sour, and aromatic flavors.",
    commonIngredients: ["Lemongrass", "Makrut lime leaf", "Chili"],
    similarDishes: ["Hot-and-sour soup"],
    orderingConsiderations: ["Ask about serving size if ordering for the table."],
    imagePosition: "32% 42%",
  }),
];

export const demoFoodseyoAnalysis = FoodseyoAnalysisSchema.parse({
  schemaVersion: FOODSEYO_ANALYSIS_SCHEMA_VERSION,
  analysisId: "demo-pai-northern-thai-kitchen-v1",
  generatedAt: "2026-07-15T00:00:00.000Z",
  status: "complete",
  inputContext: {
    type: "demo",
    fixtureId: "pai-northern-thai-kitchen",
    clearlyLabeledDemo: true,
    storageScope: "session_only",
  },
  payload: {
    restaurantResolution: {
      status: "confirmed",
      candidates: [
        {
          id: "pai-northern-thai-kitchen",
          name: "PAI Northern Thai Kitchen",
          address: null,
          website: null,
          cuisineLabels: ["Northern Thai"],
          matchReasons: ["Explicitly selected static demo fixture"],
          sourceIds: [DEMO_RESTAURANT_EVIDENCE_ID],
          selectedByUser: false,
        },
      ],
      selectedCandidateId: "pai-northern-thai-kitchen",
      confirmedBy: "explicit_input",
      sourceIds: [DEMO_RESTAURANT_EVIDENCE_ID],
      limitations: ["This identity is confirmed only inside the clearly labeled demo fixture."],
    },
    restaurant: {
      id: "pai-northern-thai-kitchen",
      name: "PAI Northern Thai Kitchen",
      summary:
        "A lively Northern Thai restaurant demo known for rich coconut curries, aromatic herbs, and bold regional flavors.",
      address: "Toronto",
      phone: null,
      website: null,
      cuisineLabels: ["Northern Thai"],
      priceLevel: "$$",
      publicLocation: null,
      sourceIds: [DEMO_RESTAURANT_EVIDENCE_ID],
    },
    menu: {
      title: "Foodseyo demo menu",
      currency: "CAD",
      categories: [
        { id: "noodles", label: "Noodles" },
        { id: "curry", label: "Curry" },
        { id: "rice", label: "Rice" },
        { id: "sides", label: "Sides" },
        { id: "dessert", label: "Dessert" },
      ],
      dishes,
      featuredDishIds: dishes.map((dish) => dish.id),
      freshness: {
        status: "could_not_verify",
        checkedAt: null,
        sourceUpdatedAt: null,
        comparedFields: [],
        differences: [],
        sourceIds: [DEMO_MENU_EVIDENCE_ID],
        limitation: "A static demo fixture is not checked against a live official menu.",
      },
      sourceIds: [DEMO_MENU_EVIDENCE_ID],
      limitations: ["Prices, descriptions, and options are static demo values."],
    },
    orderingGuidance: {
      partySize: null,
      budget: null,
      goal: null,
      sharingPreference: null,
      recommendations: [],
      estimatedTotal: null,
      estimatedTotalEvidence: {
        availability: "insufficient",
        basis: "deterministic_calculation",
        sourceIds: [],
        limitation: "A total is calculated only after the user chooses meal preferences.",
      },
      assumptions: [],
      warnings: [],
    },
    evidence: [
      {
        id: DEMO_RESTAURANT_EVIDENCE_ID,
        sourceType: "demo_data",
        title: "Static demo restaurant fixture",
        url: null,
        sourceLabel: "Demo data",
        retrievedAt: null,
        publishedAt: null,
        excerpt: null,
        attribution: null,
        limitations: ["Not live restaurant evidence."],
      },
      {
        id: DEMO_MENU_EVIDENCE_ID,
        sourceType: "demo_data",
        title: "Static demo menu fixture",
        url: null,
        sourceLabel: "Demo data",
        retrievedAt: null,
        publishedAt: null,
        excerpt: null,
        attribution: null,
        limitations: ["Not a current official menu."],
      },
      {
        id: DEMO_REVIEW_EVIDENCE_ID,
        sourceType: "demo_data",
        title: "Static demo review fixture",
        url: null,
        sourceLabel: "Demo review dataset",
        retrievedAt: null,
        publishedAt: null,
        excerpt: null,
        attribution: null,
        limitations: ["Illustrative only; not a live review feed."],
      },
    ],
    allergySafetyNotice: ALLERGY_SAFETY_NOTICE,
  },
  issues: [
    {
      code: "MENU_FRESHNESS_UNVERIFIED",
      severity: "info",
      message: "The static demo menu was not checked against a live official source.",
      relatedEntityIds: ["pai-northern-thai-kitchen"],
      recoverable: true,
    },
    {
      code: "DIETARY_CONFIRM_WITH_STAFF",
      severity: "warning",
      message: "Ingredient and cross-contact details require staff confirmation.",
      relatedEntityIds: dishes.map((dish) => dish.id),
      recoverable: true,
    },
  ],
});
