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

const tasteAdjectives: Readonly<Record<NormalizedBasicTaste["value"], string>> = {
  sweet: "sweet",
  salty: "salty",
  sour: "sour",
  bitter: "bitter",
  savory: "savory",
};

const renderTaste = (taste: NormalizedBasicTaste): string => {
  const noun = tasteNouns[taste.value];
  if (taste.intensity === 1) return `mild ${noun}`;
  if (taste.intensity === 3) return `prominent ${noun}`;
  return noun;
};

const renderBasicTastes = (
  tastes: readonly NormalizedBasicTaste[],
): string | null => {
  if (tastes.length === 0) return null;
  if (tastes.length === 1) {
    const [taste] = tastes;
    if (taste.intensity === 1) {
      return `Slightly ${tasteAdjectives[taste.value]}.`;
    }
    if (taste.intensity === 2) {
      return `${capitalize(tasteAdjectives[taste.value])}.`;
    }
    return `Prominent ${tasteNouns[taste.value]}.`;
  }

  if (tastes.length === 2) {
    const prominent = tastes.find((taste) => taste.intensity === 3);
    const mild = tastes.find((taste) => taste.intensity === 1);
    if (prominent && mild) {
      return `Mostly ${tasteAdjectives[prominent.value]}, with mild ${tasteNouns[mild.value]}.`;
    }
  }

  return `${capitalize(
    formatList(
      tastes.map((taste) =>
        taste.intensity === 2 ? tasteAdjectives[taste.value] : renderTaste(taste),
      ),
    ),
  )}.`;
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
    basicTastes: renderBasicTastes(consistency.basicTastes),
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
      ? "Some ingredients could not be confirmed."
      : null,
  };
}
