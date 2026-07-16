import type {
  NormalizedBasicTaste,
  NormalizedDishConsistency,
  NormalizedIngredientEvidence,
} from "./normalize.ts";
import type { HeatLevel, RichnessLevel } from "./profile.ts";

export interface DishConsistencyWording {
  readonly basicTastes: string | null;
  readonly flavorNotes: string | null;
  readonly heat: string | null;
  readonly richness: string | null;
  readonly textures: string | null;
  readonly statedIngredients: string | null;
  readonly typicalIngredients: string | null;
  readonly uncertainIngredients: string | null;
}

const capitalize = (value: string): string =>
  value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;

const formatList = (values: readonly string[]): string => {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
};

const tasteNouns: Readonly<Record<NormalizedBasicTaste["value"], string>> = {
  sweet: "sweetness",
  salty: "saltiness",
  sour: "sourness",
  bitter: "bitterness",
  savory: "savory taste",
};

const renderTaste = (taste: NormalizedBasicTaste): string => {
  const noun = tasteNouns[taste.value];
  if (taste.intensity === 1) return `mild ${noun}`;
  if (taste.intensity === 3) return `prominent ${noun}`;
  return noun;
};

const heatWording: Readonly<Record<HeatLevel, string | null>> = {
  none: "Not expected to be spicy.",
  mild: "Mild heat.",
  medium: "Medium heat.",
  hot: "Hot.",
  very_hot: "Very hot.",
  unknown: null,
};

const richnessWording: Readonly<Record<RichnessLevel, string | null>> = {
  light: "Light.",
  moderate: "Moderately rich.",
  rich: "Rich.",
  unknown: null,
};

const titleIngredient = (value: string): string =>
  value.replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => capitalize(word));

const ingredientNames = (
  ingredients: readonly NormalizedIngredientEvidence[],
  basis: NormalizedIngredientEvidence["basis"],
): string[] =>
  ingredients
    .filter((ingredient) => ingredient.basis === basis)
    .map((ingredient) => titleIngredient(ingredient.name));

export function renderDishConsistencyWording(
  consistency: NormalizedDishConsistency,
): DishConsistencyWording {
  const stated = ingredientNames(consistency.ingredients, "stated");
  const typical = ingredientNames(consistency.ingredients, "typical");
  const hasUncertain = consistency.ingredients.some(
    (ingredient) => ingredient.basis === "uncertain",
  );

  return {
    basicTastes: consistency.basicTastes.length
      ? `${capitalize(formatList(consistency.basicTastes.map(renderTaste)))}.`
      : null,
    flavorNotes: consistency.flavorNotes.length
      ? `${capitalize(formatList(consistency.flavorNotes))}.`
      : null,
    heat: heatWording[consistency.heatLevel],
    richness: richnessWording[consistency.richnessLevel],
    textures: consistency.textures.length
      ? `${capitalize(formatList(consistency.textures))}.`
      : null,
    statedIngredients: stated.length
      ? `Listed ingredients: ${formatList(stated)}.`
      : null,
    typicalIngredients: typical.length
      ? `Typically may include: ${formatList(typical)}.`
      : null,
    uncertainIngredients: hasUncertain
      ? "Other possible ingredients could not be confirmed."
      : null,
  };
}
