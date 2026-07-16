export const ANALYSIS_CONSISTENCY_PROFILE_VERSION =
  "foodseyo-consistency-v1" as const;

export const BASIC_TASTES = [
  "sweet",
  "salty",
  "sour",
  "bitter",
  "savory",
] as const;

export const FLAVOR_NOTES = [
  "smoky",
  "herbal",
  "nutty",
  "earthy",
  "garlicky",
  "buttery",
  "cheesy",
  "fruity",
  "citrusy",
  "fermented",
] as const;

export const HEAT_LEVELS = [
  "none",
  "mild",
  "medium",
  "hot",
  "very_hot",
  "unknown",
] as const;

export const RICHNESS_LEVELS = [
  "light",
  "moderate",
  "rich",
  "unknown",
] as const;

export const TEXTURES = [
  "crispy",
  "crunchy",
  "creamy",
  "tender",
  "chewy",
  "juicy",
  "flaky",
  "soft",
  "firm",
  "dense",
  "airy",
  "silky",
  "sticky",
  "springy",
  "crumbly",
  "moist",
] as const;

export const INGREDIENT_EVIDENCE_BASES = [
  "stated",
  "typical",
  "uncertain",
] as const;

export type BasicTaste = (typeof BASIC_TASTES)[number];
export type FlavorNote = (typeof FLAVOR_NOTES)[number];
export type HeatLevel = (typeof HEAT_LEVELS)[number];
export type RichnessLevel = (typeof RICHNESS_LEVELS)[number];
export type Texture = (typeof TEXTURES)[number];
export type IngredientEvidenceBasis =
  (typeof INGREDIENT_EVIDENCE_BASES)[number];
export type BasicTasteIntensity = 1 | 2 | 3;

export const CONSISTENCY_ISSUE_CODES = [
  "axis_not_array",
  "axis_value_invalid",
  "basic_taste_intensity_invalid",
  "duplicate_value",
  "tag_limit_exceeded",
  "deterministic_order_invalid",
  "heat_level_missing",
  "heat_level_multiple",
  "heat_level_invalid",
  "spiced_is_not_heat",
  "richness_level_missing",
  "richness_level_multiple",
  "richness_level_invalid",
  "texture_contradiction",
  "ingredient_name_empty",
  "ingredient_basis_invalid",
  "ingredient_duplicate",
  "ingredient_basis_conflict",
  "ingredient_order_invalid",
  "version_metadata_missing",
  "version_metadata_invalid",
  "fingerprint_input_malformed",
  "canonical_serialization_invalid",
] as const;

export type ConsistencyIssueCode =
  (typeof CONSISTENCY_ISSUE_CODES)[number];

export interface ConsistencyIssue {
  readonly code: ConsistencyIssueCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

const TEXTURE_DEFINITIONS: Readonly<Record<Texture, string>> = {
  crispy: "A thin, lightly breaking crisp surface or shell.",
  crunchy: "A firmer texture with clear resistance when bitten.",
  creamy: "A thick, smooth texture resembling cream.",
  tender: "A cooked ingredient, often meat, that is easy to chew.",
  chewy: "A resistant texture that needs repeated chewing.",
  juicy: "Moisture or juices released while biting.",
  flaky: "A texture that separates into thin layers.",
  soft: "Low structural resistance and generally easy compression.",
  firm: "Shape-holding and resistant without necessarily being crunchy.",
  dense: "A closely packed, weighty internal structure.",
  airy: "A light structure with noticeable air pockets.",
  silky: "An especially smooth, fine texture that passes easily.",
  sticky: "A tacky or adhesive texture with noticeable viscosity.",
  springy: "An elastic texture that rebounds after pressure.",
  crumbly: "A texture that readily breaks into small pieces.",
  moist: "A texture that retains moisture without necessarily releasing juice.",
};

export const ANALYSIS_CONSISTENCY_PROFILE = Object.freeze({
  version: ANALYSIS_CONSISTENCY_PROFILE_VERSION,
  basicTastes: BASIC_TASTES,
  flavorNotes: FLAVOR_NOTES,
  heatLevels: HEAT_LEVELS,
  richnessLevels: RICHNESS_LEVELS,
  textures: TEXTURES,
  textureDefinitions: TEXTURE_DEFINITIONS,
  ingredientEvidenceBases: INGREDIENT_EVIDENCE_BASES,
  intensityScale: Object.freeze({
    1: "mild",
    2: "noticeable",
    3: "prominent",
  } as const),
  tagLimits: Object.freeze({
    basicTastes: 3,
    flavorNotes: 3,
    textures: 2,
  }),
  unknownHandling: Object.freeze({
    basicTastes: "empty_array",
    flavorNotes: "empty_array",
    textures: "empty_array",
    heatLevel: "unknown",
    richnessLevel: "unknown",
  } as const),
  aliases: Object.freeze({
    basicTastes: Object.freeze({ umami: "savory" } as const),
    flavorNotes: Object.freeze({
      "garlic-forward": "garlicky",
      "cheesy flavor": "cheesy",
      "buttery flavor": "buttery",
      "citrus-forward": "citrusy",
      "smoky flavor": "smoky",
      "fermented flavor": "fermented",
    } as const),
    textures: Object.freeze({
      crisp: "crispy",
      velvety: "silky",
      fluffy: "airy",
      pillowy: "airy",
    } as const),
    ingredients: Object.freeze({
      onions: "onion",
      tomatoes: "tomato",
      eggs: "egg",
    } as const),
  }),
  contextualAliases: Object.freeze({
    zesty: Object.freeze({ value: "citrusy", requires: "explicit_citrus_context" }),
  }),
  ambiguousTerms: Object.freeze({
    basicTastes: Object.freeze(["seasoned", "bright", "zesty", "rich", "spiced"]),
    flavorNotes: Object.freeze(["bright", "fresh", "warm", "aromatic", "roasted"]),
    heatLevels: Object.freeze(["spiced", "warmly spiced"]),
    textures: Object.freeze(["smooth", "delicate", "bouncy", "meaty", "hearty"]),
  }),
  contradictions: Object.freeze([
    Object.freeze(["dense", "airy"] as const),
    Object.freeze(["firm", "soft"] as const),
  ]),
  selectionRules: Object.freeze({
    duplicateBasicTaste: "strongest_intensity",
    excessBasicTastes: "intensity_then_profile_order",
    excessFlavorNotes: "profile_order",
    excessTextures: "profile_order",
    ingredientBasis: "stated_then_typical_then_uncertain",
  } as const),
  wordingRules: Object.freeze({
    locale: "en",
    listStyle: "oxford_comma",
    unknownHeat: "omit",
    unknownRichness: "omit",
    uncertainIngredients: "summary_only",
  } as const),
});
