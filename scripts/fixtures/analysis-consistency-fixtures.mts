import type { DishConsistencyInput } from "../../src/lib/analysis-consistency/index.ts";

export const equivalentConsistencyInputA: DishConsistencyInput = {
  basicTastes: [
    { value: "Umami", intensity: 3 },
    { value: "Sweet", intensity: 1 },
  ],
  flavorNotes: ["Garlic-forward", "Smoky"],
  textures: ["Juicy", "Tender"],
  heatLevel: "Mild",
  richnessLevel: "Rich",
};

export const equivalentConsistencyInputB: DishConsistencyInput = {
  basicTastes: [
    { value: "sweet", intensity: 1 },
    { value: "savory", intensity: 3 },
    { value: "savory", intensity: 2 },
  ],
  flavorNotes: ["smoky", "garlicky", "garlicky"],
  textures: ["tender", "juicy"],
  heatLevel: "mild",
  richnessLevel: "rich",
};

export const ambiguousConsistencyInput: DishConsistencyInput = {
  basicTastes: [
    { value: "bright", intensity: 2 },
    { value: "rich", intensity: 3 },
    { value: "spicy", intensity: 2 },
  ],
  flavorNotes: ["fresh", "aromatic", "warm", "roasted", "zesty"],
  textures: ["smooth", "delicate", "bouncy", "meaty", "hearty"],
  heatLevel: "warmly spiced",
  richnessLevel: null,
};

export const ingredientEvidenceInput: DishConsistencyInput = {
  ingredients: [
    { name: "  Cumin ", basis: "typical" },
    { name: "CUMIN", basis: "stated" },
    { name: "Tomatoes", basis: "uncertain" },
    { name: "onions", basis: "typical" },
    { name: "Parsley", basis: "stated" },
    { name: "lamb", basis: "stated" },
  ],
};

export const repeatabilityFixtureNames = [
  "Tabbouleh",
  "Lamb Kofta",
  "Pad Thai",
  "Tonkotsu Ramen",
  "Margherita Pizza",
  "Chicken Tikka Masala",
] as const;
