import {
  ANALYSIS_CONSISTENCY_PROFILE,
  BASIC_TASTES,
  FLAVOR_NOTES,
  HEAT_LEVELS,
  INGREDIENT_EVIDENCE_BASES,
  RICHNESS_LEVELS,
  TEXTURES,
  type BasicTaste,
  type BasicTasteIntensity,
  type ConsistencyIssue,
  type FlavorNote,
  type HeatLevel,
  type IngredientEvidenceBasis,
  type RichnessLevel,
  type Texture,
} from "./profile.ts";

export interface BasicTasteInput {
  readonly value: string;
  readonly intensity: number;
}

export interface IngredientEvidenceInput {
  readonly name: string;
  readonly basis: string;
}

export interface DishConsistencyInput {
  readonly basicTastes?: readonly BasicTasteInput[];
  readonly flavorNotes?: readonly string[];
  readonly heatLevel?: string | null;
  readonly richnessLevel?: string | null;
  readonly textures?: readonly string[];
  readonly ingredients?: readonly IngredientEvidenceInput[];
}

export interface NormalizedBasicTaste {
  readonly value: BasicTaste;
  readonly intensity: BasicTasteIntensity;
}

export interface NormalizedIngredientEvidence {
  readonly name: string;
  readonly basis: IngredientEvidenceBasis;
}

export interface NormalizedDishConsistency {
  readonly basicTastes: readonly NormalizedBasicTaste[];
  readonly flavorNotes: readonly FlavorNote[];
  readonly heatLevel: HeatLevel;
  readonly richnessLevel: RichnessLevel;
  readonly textures: readonly Texture[];
  readonly ingredients: readonly NormalizedIngredientEvidence[];
}

export interface NormalizationResult {
  readonly value: NormalizedDishConsistency;
  readonly issues: readonly ConsistencyIssue[];
}

const createIssue = (
  code: ConsistencyIssue["code"],
  path: readonly (string | number)[],
  message: string,
): ConsistencyIssue => ({ code, path, message });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const normalizeComparisonText = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/\s+/gu, " ");

const hasValue = <T extends string>(values: readonly T[], value: string): value is T =>
  (values as readonly string[]).includes(value);

const profileIndex = <T extends string>(values: readonly T[], value: T): number =>
  values.indexOf(value);

const normalizeAliasedValue = <T extends string>(
  rawValue: string,
  values: readonly T[],
  aliases: Readonly<Record<string, T>>,
): T | null => {
  const token = normalizeComparisonText(rawValue);
  const normalized = aliases[token] ?? token;
  return hasValue(values, normalized) ? normalized : null;
};

const normalizeBasicTastes = (
  inputs: unknown,
  issues: ConsistencyIssue[],
): NormalizedBasicTaste[] => {
  if (!Array.isArray(inputs)) {
    issues.push(
      createIssue(
        "axis_not_array",
        ["basicTastes"],
        "Basic tastes must be supplied as an array.",
      ),
    );
    return [];
  }
  const merged = new Map<BasicTaste, BasicTasteIntensity>();

  inputs.forEach((input, index) => {
    if (
      !isRecord(input) ||
      typeof input.value !== "string" ||
      typeof input.intensity !== "number"
    ) {
      issues.push(
        createIssue(
          "axis_value_invalid",
          ["basicTastes", index],
          "A basic-taste entry is malformed.",
        ),
      );
      return;
    }
    const value = normalizeAliasedValue(
      input.value,
      BASIC_TASTES,
      ANALYSIS_CONSISTENCY_PROFILE.aliases.basicTastes,
    );
    if (!value) {
      issues.push(
        createIssue(
          "axis_value_invalid",
          ["basicTastes", index, "value"],
          "The basic-taste value is not part of the consistency profile.",
        ),
      );
      return;
    }
    if (!Number.isInteger(input.intensity) || input.intensity < 1 || input.intensity > 3) {
      issues.push(
        createIssue(
          "basic_taste_intensity_invalid",
          ["basicTastes", index, "intensity"],
          "Basic-taste intensity must be an integer from 1 through 3.",
        ),
      );
      return;
    }

    const intensity = input.intensity as BasicTasteIntensity;
    const previous = merged.get(value);
    if (previous !== undefined) {
      issues.push(
        createIssue(
          "duplicate_value",
          ["basicTastes", index],
          "A normalized basic-taste value appears more than once.",
        ),
      );
    }
    if (previous === undefined || intensity > previous) merged.set(value, intensity);
  });

  const candidates = [...merged.entries()].map(([value, intensity]) => ({
    value,
    intensity,
  }));
  if (candidates.length > ANALYSIS_CONSISTENCY_PROFILE.tagLimits.basicTastes) {
    issues.push(
      createIssue(
        "tag_limit_exceeded",
        ["basicTastes"],
        "The basic-taste tag limit is exceeded.",
      ),
    );
  }

  const selected = candidates
    .sort(
      (left, right) =>
        right.intensity - left.intensity ||
        profileIndex(BASIC_TASTES, left.value) -
          profileIndex(BASIC_TASTES, right.value),
    )
    .slice(0, ANALYSIS_CONSISTENCY_PROFILE.tagLimits.basicTastes);

  return selected.sort(
    (left, right) =>
      profileIndex(BASIC_TASTES, left.value) -
      profileIndex(BASIC_TASTES, right.value),
  );
};

const normalizeTagAxis = <T extends string>(
  axis: "flavorNotes" | "textures",
  inputs: unknown,
  values: readonly T[],
  aliases: Readonly<Record<string, T>>,
  limit: number,
  issues: ConsistencyIssue[],
): T[] => {
  if (!Array.isArray(inputs)) {
    issues.push(
      createIssue(
        "axis_not_array",
        [axis],
        "The consistency axis must be supplied as an array.",
      ),
    );
    return [];
  }
  const unique = new Set<T>();
  inputs.forEach((input, index) => {
    if (typeof input !== "string") {
      issues.push(
        createIssue(
          "axis_value_invalid",
          [axis, index],
          "The consistency axis contains a malformed value.",
        ),
      );
      return;
    }
    const value = normalizeAliasedValue(input, values, aliases);
    if (!value) {
      issues.push(
        createIssue(
          "axis_value_invalid",
          [axis, index],
          "The tag is not part of the selected consistency axis.",
        ),
      );
      return;
    }
    if (unique.has(value)) {
      issues.push(
        createIssue(
          "duplicate_value",
          [axis, index],
          "A normalized tag value appears more than once.",
        ),
      );
    }
    unique.add(value);
  });

  const ordered = [...unique].sort(
    (left, right) => profileIndex(values, left) - profileIndex(values, right),
  );
  if (ordered.length > limit) {
    issues.push(
      createIssue(
        "tag_limit_exceeded",
        [axis],
        "The tag limit for this consistency axis is exceeded.",
      ),
    );
  }
  return ordered.slice(0, limit);
};

const normalizeLevel = <T extends string>(
  axis: "heatLevel" | "richnessLevel",
  input: unknown,
  values: readonly T[],
  unknown: T,
  issues: ConsistencyIssue[],
): T => {
  if (input === undefined || input === null || input === "") return unknown;
  if (typeof input !== "string") {
    issues.push(
      createIssue(
        axis === "heatLevel" ? "heat_level_invalid" : "richness_level_invalid",
        [axis],
        `The ${axis === "heatLevel" ? "heat" : "richness"} level is malformed.`,
      ),
    );
    return unknown;
  }
  if (input.trim() === "") return unknown;
  const token = normalizeComparisonText(input).replace(/\s+/gu, "_");
  if (hasValue(values, token)) return token;
  issues.push(
    createIssue(
      axis === "heatLevel" ? "heat_level_invalid" : "richness_level_invalid",
      [axis],
      `The ${axis === "heatLevel" ? "heat" : "richness"} level is invalid.`,
    ),
  );
  return unknown;
};

export const normalizeIngredientName = (value: string): string => {
  const normalized = normalizeComparisonText(value);
  return (
    ANALYSIS_CONSISTENCY_PROFILE.aliases.ingredients[
      normalized as keyof typeof ANALYSIS_CONSISTENCY_PROFILE.aliases.ingredients
    ] ?? normalized
  );
};

const basisIndex = (basis: IngredientEvidenceBasis): number =>
  profileIndex(INGREDIENT_EVIDENCE_BASES, basis);

const compareCodePoints = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizeIngredients = (
  inputs: unknown,
  issues: ConsistencyIssue[],
): NormalizedIngredientEvidence[] => {
  if (!Array.isArray(inputs)) {
    issues.push(
      createIssue(
        "axis_not_array",
        ["ingredients"],
        "Ingredients must be supplied as an array.",
      ),
    );
    return [];
  }
  const merged = new Map<string, NormalizedIngredientEvidence>();

  inputs.forEach((input, index) => {
    if (
      !isRecord(input) ||
      typeof input.name !== "string" ||
      typeof input.basis !== "string"
    ) {
      issues.push(
        createIssue(
          "axis_value_invalid",
          ["ingredients", index],
          "An ingredient entry is malformed.",
        ),
      );
      return;
    }
    const name = normalizeIngredientName(input.name);
    if (!name) {
      issues.push(
        createIssue(
          "ingredient_name_empty",
          ["ingredients", index, "name"],
          "An ingredient name must not be empty.",
        ),
      );
      return;
    }
    const basisToken = normalizeComparisonText(input.basis);
    if (!hasValue(INGREDIENT_EVIDENCE_BASES, basisToken)) {
      issues.push(
        createIssue(
          "ingredient_basis_invalid",
          ["ingredients", index, "basis"],
          "The ingredient evidence basis is invalid.",
        ),
      );
      return;
    }

    const previous = merged.get(name);
    if (previous) {
      issues.push(
        createIssue(
          previous.basis === basisToken
            ? "ingredient_duplicate"
            : "ingredient_basis_conflict",
          ["ingredients", index],
          previous.basis === basisToken
            ? "A normalized ingredient appears more than once."
            : "A normalized ingredient has conflicting evidence bases.",
        ),
      );
    }
    if (!previous || basisIndex(basisToken) < basisIndex(previous.basis)) {
      merged.set(name, { name, basis: basisToken });
    }
  });

  return [...merged.values()].sort(
    (left, right) =>
      basisIndex(left.basis) - basisIndex(right.basis) ||
      compareCodePoints(left.name, right.name),
  );
};

export function normalizeDishConsistency(input: unknown): NormalizationResult {
  const issues: ConsistencyIssue[] = [];
  const candidate = isRecord(input) ? input : {};
  if (!isRecord(input)) {
    issues.push(
      createIssue(
        "axis_value_invalid",
        [],
        "The dish consistency input is malformed.",
      ),
    );
  }
  return {
    value: {
      basicTastes: normalizeBasicTastes(candidate.basicTastes ?? [], issues),
      flavorNotes: normalizeTagAxis(
        "flavorNotes",
        candidate.flavorNotes ?? [],
        FLAVOR_NOTES,
        ANALYSIS_CONSISTENCY_PROFILE.aliases.flavorNotes,
        ANALYSIS_CONSISTENCY_PROFILE.tagLimits.flavorNotes,
        issues,
      ),
      heatLevel: normalizeLevel(
        "heatLevel",
        candidate.heatLevel,
        HEAT_LEVELS,
        "unknown",
        issues,
      ),
      richnessLevel: normalizeLevel(
        "richnessLevel",
        candidate.richnessLevel,
        RICHNESS_LEVELS,
        "unknown",
        issues,
      ),
      textures: normalizeTagAxis(
        "textures",
        candidate.textures ?? [],
        TEXTURES,
        ANALYSIS_CONSISTENCY_PROFILE.aliases.textures,
        ANALYSIS_CONSISTENCY_PROFILE.tagLimits.textures,
        issues,
      ),
      ingredients: normalizeIngredients(candidate.ingredients ?? [], issues),
    },
    issues,
  };
}
