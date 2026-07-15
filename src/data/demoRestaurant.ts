import type { DietaryFact, Dish, Restaurant, ReviewConsensus } from "@/types/domain";

const demoReview: ReviewConsensus = {
  level: "moderate",
  sourceGroupCount: 2,
  evidenceCount: 5,
  freshness: "Recent demo evidence included",
  positiveThemes: ["Well-balanced flavor", "Frequently mentioned by diners"],
  negativeThemes: ["Taste preferences vary"],
  disagreements: ["Spice perception differs between reviewers"],
  limitation: "Demo review evidence is illustrative and does not represent a live review feed.",
};

const sharedDietary: DietaryFact[] = [
  {
    label: "Ingredient details",
    status: "Information is incomplete",
    evidence: "Demo menu description",
    source: "demo_data",
    action: "Confirm with staff",
  },
];

const baseOverview = (name: string, description: string) => ({
  whatItIs: description,
  regionalBackground: `${name} is presented here with concise general food context for travelers.`,
  mainIngredients: ["Ingredients vary by preparation"],
  cookingMethod: "Preparation varies by restaurant and is not confirmed in this demo.",
  textureAndFlavor: "Flavor and texture may vary by preparation and service.",
  similarTo: "Ask the restaurant team for the closest familiar comparison.",
  portionGuidance: "Portion size is not confirmed. Ask staff if you plan to share.",
  generalKnowledge: `${name} can be prepared in several regional and restaurant-specific styles.`,
  atRestaurant: "The available demo menu confirms the dish name and short description only.",
});

const dish = (
  input: Pick<
    Dish,
    | "id"
    | "name"
    | "category"
    | "shortDescription"
    | "price"
    | "tasteTags"
    | "textureTags"
    | "spiceLevel"
    | "imagePosition"
  >,
): Dish => ({
  ...input,
  localName: null,
  pronunciation: null,
  currency: "CAD",
  imageUrl: "/images/thai-dishes.png",
  imageSource: "Demo reference image",
  representative: true,
  reviewBadge: "Repeated opinion",
  overview: baseOverview(input.name, input.shortDescription),
  reviewConsensus: demoReview,
  dietary: sharedDietary,
  evidence: [
    { source: "demo_data", label: "Demo data" },
    { source: "general_food_knowledge", label: "General dish knowledge" },
  ],
});

const khaoSoi: Dish = {
  ...dish({
    id: "khao-soi",
    name: "Khao Soi",
    category: "Noodles",
    shortDescription: "Coconut curry noodle soup with crispy noodles and pickled mustard greens.",
    price: 18,
    tasteTags: ["Rich", "Aromatic", "Mild spicy"],
    textureTags: ["Creamy", "Crispy"],
    spiceLevel: "Mild",
    imagePosition: "18% 50%",
  }),
  localName: "ข้าวซอย",
  pronunciation: "kow soy",
  overview: {
    whatItIs:
      "A Northern Thai coconut curry noodle soup combining soft egg noodles with crispy noodles and a rich aromatic broth.",
    regionalBackground: "Commonly associated with Chiang Mai and Northern Thailand.",
    mainIngredients: [
      "Egg noodles",
      "Coconut milk",
      "Curry paste",
      "Chicken",
      "Pickled mustard greens",
      "Shallots",
      "Crispy noodles",
    ],
    cookingMethod:
      "Egg noodles are served in a coconut curry broth and finished with crispy noodles and fresh garnishes.",
    textureAndFlavor:
      "Creamy and comforting with gentle heat, crispy texture, and bright tang from pickled vegetables.",
    similarTo: "Somewhat similar to laksa, but generally milder and more coconut-forward.",
    portionGuidance: "Demo reviews often describe it as a generous individual main; portion size can vary.",
    generalKnowledge:
      "Khao Soi commonly combines coconut curry broth, egg noodles, and crispy noodle toppings.",
    atRestaurant:
      "The menu lists chicken or beef options. Public demo evidence repeatedly identifies it as a signature dish.",
  },
  reviewConsensus: {
    level: "strong",
    sourceGroupCount: 3,
    evidenceCount: 8,
    freshness: "Recent evidence included",
    positiveThemes: [
      "Rich and flavorful broth",
      "Frequently recommended as a signature dish",
      "Generous portion",
    ],
    negativeThemes: ["Some diners find the broth salty", "Texture may feel heavy for some users"],
    disagreements: [
      "Waiting-time complaints appear mostly in one source group",
      "Spice perception varies between reviewers",
    ],
    limitation:
      "We do not decide which platform to trust. We identify which food opinions remain consistent across sources.",
  },
  dietary: [
    {
      label: "Vegetarian",
      status: "Ask whether modification is available",
      evidence: "Official ingredient details are incomplete",
      source: "unavailable",
      action: "Confirm with staff",
    },
    {
      label: "Vegan",
      status: "Not vegan by default",
      evidence: "General recipe and menu description",
      source: "general_food_knowledge",
    },
    {
      label: "Gluten",
      status: "Likely contains wheat noodles",
      evidence: "Menu description",
      source: "official_menu",
    },
    {
      label: "Coconut",
      status: "Likely included",
      evidence: "Menu description",
      source: "official_menu",
    },
    {
      label: "Peanuts",
      status: "Information unavailable",
      evidence: "No confirmed ingredient statement",
      source: "unavailable",
      action: "Confirm with staff",
    },
    {
      label: "Cross-contact",
      status: "Confirm with staff",
      evidence: "Kitchen practices are not included in demo data",
      source: "staff_confirmation",
    },
  ],
  evidence: [
    { source: "official_menu", label: "Official menu" },
    { source: "public_web", label: "Public web source" },
    { source: "demo_data", label: "Demo review dataset" },
    { source: "general_food_knowledge", label: "General dish knowledge" },
  ],
};

export const demoRestaurant: Restaurant = {
  id: "pai-northern-thai-kitchen",
  name: "PAI Northern Thai Kitchen",
  localName: null,
  location: "Toronto",
  cuisine: "Northern Thai",
  priceLevel: "$$",
  shortSummary:
    "A lively Northern Thai restaurant known for rich coconut curries, aromatic herbs, and bold regional flavors.",
  imageUrl: "/images/thai-dishes.png",
  imageSource: "Demo reference image",
  representativeDishIds: [
    "khao-soi",
    "sai-ua",
    "pad-kra-pao",
    "green-curry",
    "mango-sticky-rice",
    "tom-yum-soup",
  ],
  dishes: [
    khaoSoi,
    dish({
      id: "sai-ua",
      name: "Sai Ua",
      category: "Sides",
      shortDescription: "Northern Thai herb sausage.",
      price: 12,
      tasteTags: ["Herby", "Savory", "Grilled"],
      textureTags: ["Juicy", "Charred"],
      spiceLevel: "Mild",
      imagePosition: "52% 54%",
    }),
    dish({
      id: "pad-kra-pao",
      name: "Pad Kra Pao",
      category: "Rice",
      shortDescription: "Stir-fried basil with rice.",
      price: 17,
      tasteTags: ["Savory", "Peppery", "Medium spicy"],
      textureTags: ["Tender", "Crisp-edged"],
      spiceLevel: "Medium",
      imagePosition: "54% 60%",
    }),
    dish({
      id: "green-curry",
      name: "Green Curry",
      category: "Curry",
      shortDescription: "Coconut green curry.",
      price: 19,
      tasteTags: ["Creamy", "Herbal", "Medium spicy"],
      textureTags: ["Silky", "Tender"],
      spiceLevel: "Medium",
      imagePosition: "84% 32%",
    }),
    dish({
      id: "mango-sticky-rice",
      name: "Mango Sticky Rice",
      category: "Dessert",
      shortDescription: "Coconut sticky rice with mango.",
      price: 10,
      tasteTags: ["Sweet", "Creamy", "Fruity"],
      textureTags: ["Chewy", "Soft"],
      spiceLevel: "None",
      imagePosition: "72% 72%",
    }),
    dish({
      id: "tom-yum-soup",
      name: "Tom Yum Soup",
      category: "Curry",
      shortDescription: "Hot and sour aromatic soup.",
      price: 15,
      tasteTags: ["Sour", "Fragrant", "Spicy"],
      textureTags: ["Brothy", "Tender"],
      spiceLevel: "Hot",
      imagePosition: "32% 42%",
    }),
  ],
};

export const getDish = (dishId: string) =>
  demoRestaurant.dishes.find((item) => item.id === dishId) ?? null;
