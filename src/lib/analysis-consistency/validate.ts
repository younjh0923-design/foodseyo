import {
  ANALYSIS_RESULT_FINGERPRINT_PATTERN,
  DISH_FINGERPRINT_PATTERN,
  IMAGE_CONTENT_HASH_PATTERN,
  SOURCE_FINGERPRINT_PATTERN,
  canonicalSerialize,
} from "./fingerprint.ts";
import { VERSION_TOKEN_PATTERN } from "./metadata.ts";
import {
  ANALYSIS_CONSISTENCY_PROFILE,
  ANALYSIS_CONSISTENCY_PROFILE_VERSION,
  BASIC_TASTES,
  FLAVOR_NOTES,
  HEAT_LEVELS,
  INGREDIENT_EVIDENCE_BASES,
  RICHNESS_LEVELS,
  TEXTURES,
  type ConsistencyIssue,
  type IngredientEvidenceBasis,
} from "./profile.ts";
import { normalizeComparisonText, normalizeIngredientName } from "./normalize.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const issue = (
  code: ConsistencyIssue["code"],
  path: readonly (string | number)[],
  message: string,
): ConsistencyIssue => ({ code, path, message });

const hasValue = (values: readonly string[], value: string): boolean =>
  values.includes(value);

const normalizedToken = (value: unknown): string | null =>
  typeof value === "string" ? normalizeComparisonText(value) : null;

const checkOrderedUniqueAxis = (
  candidate: Record<string, unknown>,
  axis: "flavorNotes" | "textures",
  values: readonly string[],
  limit: number,
  issues: ConsistencyIssue[],
): string[] => {
  const raw = candidate[axis];
  if (!Array.isArray(raw)) {
    issues.push(
      issue("axis_not_array", [axis], "The consistency axis must be an array."),
    );
    return [];
  }
  if (raw.length > limit) {
    issues.push(
      issue("tag_limit_exceeded", [axis], "The consistency axis exceeds its tag limit."),
    );
  }

  const valid: string[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const token = normalizedToken(entry);
    if (!token || !hasValue(values, token)) {
      issues.push(
        issue(
          "axis_value_invalid",
          [axis, index],
          "The consistency axis contains an unsupported value.",
        ),
      );
      return;
    }
    if (seen.has(token)) {
      issues.push(
        issue(
          "duplicate_value",
          [axis, index],
          "The consistency axis contains a duplicate value.",
        ),
      );
    }
    seen.add(token);
    valid.push(token);
  });

  const indexes = valid.map((value) => values.indexOf(value));
  if (indexes.some((value, index) => index > 0 && value < indexes[index - 1])) {
    issues.push(
      issue(
        "deterministic_order_invalid",
        [axis],
        "The consistency axis is not in profile order.",
      ),
    );
  }
  return valid;
};

const validateBasicTastes = (
  candidate: Record<string, unknown>,
  issues: ConsistencyIssue[],
): void => {
  const raw = candidate.basicTastes;
  if (!Array.isArray(raw)) {
    issues.push(
      issue("axis_not_array", ["basicTastes"], "Basic tastes must be an array."),
    );
    return;
  }
  if (raw.length > ANALYSIS_CONSISTENCY_PROFILE.tagLimits.basicTastes) {
    issues.push(
      issue(
        "tag_limit_exceeded",
        ["basicTastes"],
        "The basic-taste tag limit is exceeded.",
      ),
    );
  }

  const valid: string[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(
        issue(
          "axis_value_invalid",
          ["basicTastes", index],
          "A basic-taste entry is malformed.",
        ),
      );
      return;
    }
    const value = normalizedToken(entry.value);
    if (!value || !hasValue(BASIC_TASTES, value)) {
      issues.push(
        issue(
          "axis_value_invalid",
          ["basicTastes", index, "value"],
          "The basic-taste value is unsupported.",
        ),
      );
    } else {
      if (seen.has(value)) {
        issues.push(
          issue(
            "duplicate_value",
            ["basicTastes", index],
            "The basic-taste value is duplicated.",
          ),
        );
      }
      seen.add(value);
      valid.push(value);
    }
    if (
      typeof entry.intensity !== "number" ||
      !Number.isInteger(entry.intensity) ||
      entry.intensity < 1 ||
      entry.intensity > 3
    ) {
      issues.push(
        issue(
          "basic_taste_intensity_invalid",
          ["basicTastes", index, "intensity"],
          "Basic-taste intensity must be an integer from 1 through 3.",
        ),
      );
    }
  });

  const indexes = valid.map((value) => BASIC_TASTES.indexOf(value as never));
  if (indexes.some((value, index) => index > 0 && value < indexes[index - 1])) {
    issues.push(
      issue(
        "deterministic_order_invalid",
        ["basicTastes"],
        "Basic tastes are not in profile order.",
      ),
    );
  }
};

const validateSingleLevel = (
  candidate: Record<string, unknown>,
  axis: "heatLevel" | "richnessLevel",
  values: readonly string[],
  issues: ConsistencyIssue[],
): void => {
  const raw = candidate[axis];
  const missingCode = axis === "heatLevel" ? "heat_level_missing" : "richness_level_missing";
  const multipleCode =
    axis === "heatLevel" ? "heat_level_multiple" : "richness_level_multiple";
  const invalidCode = axis === "heatLevel" ? "heat_level_invalid" : "richness_level_invalid";

  if (raw === undefined || raw === null || raw === "") {
    issues.push(issue(missingCode, [axis], "The required level is missing."));
    return;
  }
  if (Array.isArray(raw)) {
    if (raw.length !== 1) {
      issues.push(issue(multipleCode, [axis], "Exactly one level is required."));
    }
    raw.forEach((entry, index) => {
      const token = normalizedToken(entry)?.replace(/\s+/gu, "_") ?? null;
      if (axis === "heatLevel" && token === "spiced") {
        issues.push(
          issue(
            "spiced_is_not_heat",
            [axis, index],
            "A spiced description does not establish heat.",
          ),
        );
      } else if (!token || !hasValue(values, token)) {
        issues.push(issue(invalidCode, [axis, index], "The level is unsupported."));
      }
    });
    return;
  }

  const token = normalizedToken(raw)?.replace(/\s+/gu, "_") ?? null;
  if (axis === "heatLevel" && token === "spiced") {
    issues.push(
      issue(
        "spiced_is_not_heat",
        [axis],
        "A spiced description does not establish heat.",
      ),
    );
  } else if (!token || !hasValue(values, token)) {
    issues.push(issue(invalidCode, [axis], "The level is unsupported."));
  }
};

const validateIngredients = (
  candidate: Record<string, unknown>,
  issues: ConsistencyIssue[],
): void => {
  const raw = candidate.ingredients;
  if (!Array.isArray(raw)) {
    issues.push(
      issue("axis_not_array", ["ingredients"], "Ingredients must be an array."),
    );
    return;
  }

  const seen = new Map<string, IngredientEvidenceBasis>();
  const ordering: Array<{ basis: IngredientEvidenceBasis; name: string }> = [];
  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(
        issue(
          "ingredient_name_empty",
          ["ingredients", index],
          "An ingredient entry is malformed.",
        ),
      );
      return;
    }
    const name = typeof entry.name === "string" ? normalizeIngredientName(entry.name) : "";
    const basis = normalizedToken(entry.basis);
    if (!name) {
      issues.push(
        issue(
          "ingredient_name_empty",
          ["ingredients", index, "name"],
          "An ingredient name must not be empty.",
        ),
      );
    }
    if (!basis || !hasValue(INGREDIENT_EVIDENCE_BASES, basis)) {
      issues.push(
        issue(
          "ingredient_basis_invalid",
          ["ingredients", index, "basis"],
          "The ingredient evidence basis is invalid.",
        ),
      );
      return;
    }
    const typedBasis = basis as IngredientEvidenceBasis;
    if (name) {
      const previous = seen.get(name);
      if (previous) {
        issues.push(
          issue(
            previous === typedBasis
              ? "ingredient_duplicate"
              : "ingredient_basis_conflict",
            ["ingredients", index],
            previous === typedBasis
              ? "A normalized ingredient is duplicated."
              : "A normalized ingredient has conflicting evidence bases.",
          ),
        );
      }
      seen.set(name, typedBasis);
      ordering.push({ basis: typedBasis, name });
    }
  });

  const rank = (basis: IngredientEvidenceBasis): number =>
    INGREDIENT_EVIDENCE_BASES.indexOf(basis);
  const sorted = [...ordering].sort((left, right) => {
    const byBasis = rank(left.basis) - rank(right.basis);
    if (byBasis !== 0) return byBasis;
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
  });
  if (canonicalSerialize(ordering) !== canonicalSerialize(sorted)) {
    issues.push(
      issue(
        "ingredient_order_invalid",
        ["ingredients"],
        "Ingredients are not in deterministic basis-and-name order.",
      ),
    );
  }
};

export function validateConsistencyVersionMetadata(
  value: unknown,
  path: readonly (string | number)[] = ["versions"],
): ConsistencyIssue[] {
  if (!isRecord(value)) {
    return [
      issue(
        "version_metadata_missing",
        path,
        "Required consistency version metadata is missing.",
      ),
    ];
  }

  const issues: ConsistencyIssue[] = [];
  for (const field of [
    "modelVersion",
    "promptVersion",
    "providerSchemaVersion",
    "canonicalSchemaVersion",
  ] as const) {
    if (typeof value[field] !== "string" || !VERSION_TOKEN_PATTERN.test(value[field])) {
      issues.push(
        issue(
          "version_metadata_invalid",
          [...path, field],
          "A required version token is invalid.",
        ),
      );
    }
  }
  if (value.consistencyProfileVersion !== ANALYSIS_CONSISTENCY_PROFILE_VERSION) {
    issues.push(
      issue(
        "version_metadata_invalid",
        [...path, "consistencyProfileVersion"],
        "The consistency profile version is unsupported.",
      ),
    );
  }
  return issues;
}

export function validateAnalysisConsistency(value: unknown): ConsistencyIssue[] {
  if (!isRecord(value)) {
    return [
      issue(
        "axis_value_invalid",
        [],
        "The versioned consistency contract is malformed.",
      ),
    ];
  }
  const issues = validateConsistencyVersionMetadata(value.versions);
  if (!isRecord(value.consistency)) {
    issues.push(
      issue(
        "axis_value_invalid",
        ["consistency"],
        "The dish consistency profile is malformed.",
      ),
    );
    return issues;
  }

  const candidate = value.consistency;
  validateBasicTastes(candidate, issues);
  checkOrderedUniqueAxis(
    candidate,
    "flavorNotes",
    FLAVOR_NOTES,
    ANALYSIS_CONSISTENCY_PROFILE.tagLimits.flavorNotes,
    issues,
  );
  validateSingleLevel(candidate, "heatLevel", HEAT_LEVELS, issues);
  validateSingleLevel(candidate, "richnessLevel", RICHNESS_LEVELS, issues);
  const textures = checkOrderedUniqueAxis(
    candidate,
    "textures",
    TEXTURES,
    ANALYSIS_CONSISTENCY_PROFILE.tagLimits.textures,
    issues,
  );
  for (const [left, right] of ANALYSIS_CONSISTENCY_PROFILE.contradictions) {
    if (textures.includes(left) && textures.includes(right)) {
      issues.push(
        issue(
          "texture_contradiction",
          ["consistency", "textures"],
          "The texture set contains a defined contradiction.",
        ),
      );
    }
  }
  validateIngredients(candidate, issues);
  return issues.map((entry) =>
    entry.path[0] === "versions" || entry.path[0] === "consistency"
      ? entry
      : { ...entry, path: ["consistency", ...entry.path] },
  );
}

export function validateSourceFingerprintInput(value: unknown): ConsistencyIssue[] {
  if (!isRecord(value)) {
    return [
      issue(
        "fingerprint_input_malformed",
        ["sourceFingerprintInput"],
        "The source fingerprint input is malformed.",
      ),
    ];
  }
  const issues: ConsistencyIssue[] = [];
  const sourceType =
    typeof value.sourceType === "string"
      ? normalizeComparisonText(value.sourceType)
      : "";
  if (!sourceType) {
    issues.push(
      issue(
        "fingerprint_input_malformed",
        ["sourceType"],
        "A required source fingerprint identity field is missing.",
      ),
    );
  }

  const hashes = value.orderedImageContentHashes;
  const imageCount = value.imageCount;
  if (!Array.isArray(hashes)) {
    issues.push(
      issue(
        "fingerprint_input_malformed",
        ["orderedImageContentHashes"],
        "Ordered image content hashes must be an array.",
      ),
    );
  }

  if (sourceType === "menu_images") {
    if (value.sourceIdentifier !== null) {
      issues.push(
        issue(
          "fingerprint_input_malformed",
          ["sourceIdentifier"],
          "Menu-image identity must use ordered content hashes.",
        ),
      );
    }
    if (
      typeof imageCount !== "number" ||
      !Number.isInteger(imageCount) ||
      imageCount < 1 ||
      !Array.isArray(hashes) ||
      imageCount !== hashes.length
    ) {
      issues.push(
        issue(
          "fingerprint_input_malformed",
          ["imageCount"],
          "Menu-image count must match the ordered hash count.",
        ),
      );
    }
    if (
      Array.isArray(hashes) &&
      hashes.some(
        (hash) =>
          typeof hash !== "string" ||
          !IMAGE_CONTENT_HASH_PATTERN.test(hash.normalize("NFKC").trim().toLowerCase()),
      )
    ) {
      issues.push(
        issue(
          "fingerprint_input_malformed",
          ["orderedImageContentHashes"],
          "An image content hash is malformed.",
        ),
      );
    }
  } else if (sourceType) {
    if (
      typeof value.sourceIdentifier !== "string" ||
      normalizeComparisonText(value.sourceIdentifier).length === 0
    ) {
      issues.push(
        issue(
          "fingerprint_input_malformed",
          ["sourceIdentifier"],
          "A named source identifier is required.",
        ),
      );
    }
    if (imageCount !== 0 || !Array.isArray(hashes) || hashes.length !== 0) {
      issues.push(
        issue(
          "fingerprint_input_malformed",
          ["orderedImageContentHashes"],
          "A named source must not carry image hashes.",
        ),
      );
    }
  }
  for (const field of ["restaurantIdentifier", "branchIdentifier", "sourceRevision"] as const) {
    if (value[field] !== null && typeof value[field] !== "string") {
      issues.push(
        issue(
          "fingerprint_input_malformed",
          [field],
          "An optional source fingerprint field has an invalid type.",
        ),
      );
    }
  }
  if ("versions" in value) {
    issues.push(
      issue(
        "fingerprint_input_malformed",
        ["versions"],
        "Source identity must not depend on analysis versions.",
      ),
    );
  }
  return issues;
}

export function validateDishFingerprintInput(value: unknown): ConsistencyIssue[] {
  if (!isRecord(value)) {
    return [
      issue(
        "fingerprint_input_malformed",
        ["dishFingerprintInput"],
        "The dish fingerprint input is malformed.",
      ),
    ];
  }
  const issues: ConsistencyIssue[] = [];
  if (
    typeof value.sourceFingerprint !== "string" ||
    !SOURCE_FINGERPRINT_PATTERN.test(value.sourceFingerprint)
  ) {
    issues.push(
      issue(
        "fingerprint_input_malformed",
        ["sourceFingerprint"],
        "The source fingerprint is malformed.",
      ),
    );
  }
  for (const field of ["sourceDishIdentifier", "sourceStatedName"] as const) {
    if (
      typeof value[field] !== "string" ||
      normalizeComparisonText(value[field]).length === 0
    ) {
      issues.push(
        issue(
          "fingerprint_input_malformed",
          [field],
          "Required source-stated dish evidence is incomplete.",
        ),
      );
    }
  }
  for (const field of [
    "sourceStatedDescription",
    "sourceStatedCategoryLabel",
  ] as const) {
    if (value[field] !== null && typeof value[field] !== "string") {
      issues.push(
        issue(
          "fingerprint_input_malformed",
          [field],
          "An optional dish fingerprint field has an invalid type.",
        ),
      );
    }
  }
  if (!isRecord(value.sourceStatedPrice)) {
    issues.push(
      issue(
        "fingerprint_input_malformed",
        ["sourceStatedPrice"],
        "The dish price identity is malformed.",
      ),
    );
  } else if (
    value.sourceStatedPrice.amount !== null &&
    (typeof value.sourceStatedPrice.amount !== "number" ||
      !Number.isFinite(value.sourceStatedPrice.amount))
  ) {
    issues.push(
      issue(
        "fingerprint_input_malformed",
        ["sourceStatedPrice", "amount"],
        "The dish price amount is invalid.",
      ),
    );
  }
  if (isRecord(value.sourceStatedPrice)) {
    for (const field of ["currency", "displayText"] as const) {
      if (
        value.sourceStatedPrice[field] !== null &&
        typeof value.sourceStatedPrice[field] !== "string"
      ) {
        issues.push(
          issue(
            "fingerprint_input_malformed",
            ["sourceStatedPrice", field],
            "A source-stated price field has an invalid type.",
          ),
        );
      }
    }
  }
  for (const field of [
    "consistency",
    "wording",
    "ingredients",
    "basicTastes",
    "textures",
    "versions",
  ] as const) {
    if (field in value) {
      issues.push(
        issue(
          "fingerprint_input_malformed",
          [field],
          "Dish identity must contain source-stated evidence only.",
        ),
      );
    }
  }
  return issues;
}

export function validateAnalysisResultFingerprintInput(
  value: unknown,
): ConsistencyIssue[] {
  if (!isRecord(value)) {
    return [
      issue(
        "fingerprint_input_malformed",
        ["analysisResultFingerprintInput"],
        "The analysis result fingerprint input is malformed.",
      ),
    ];
  }
  const issues = validateAnalysisConsistency({
    versions: value.versions,
    consistency: value.consistency,
  });
  if (
    typeof value.dishFingerprint !== "string" ||
    !DISH_FINGERPRINT_PATTERN.test(value.dishFingerprint)
  ) {
    issues.push(
      issue(
        "fingerprint_input_malformed",
        ["dishFingerprint"],
        "The analysis result dish fingerprint is malformed.",
      ),
    );
  }
  return issues;
}

export function validateCanonicalSerialization(
  value: unknown,
  serialized: string,
): ConsistencyIssue[] {
  try {
    return canonicalSerialize(value) === serialized
      ? []
      : [
          issue(
            "canonical_serialization_invalid",
            ["canonicalSerialization"],
            "The supplied serialization is not canonical.",
          ),
        ];
  } catch {
    return [
      issue(
        "canonical_serialization_invalid",
        ["canonicalSerialization"],
        "The value cannot be canonically serialized.",
      ),
    ];
  }
}

export const isSourceFingerprint = (value: string): boolean =>
  SOURCE_FINGERPRINT_PATTERN.test(value);

export const isDishFingerprint = (value: string): boolean =>
  DISH_FINGERPRINT_PATTERN.test(value);

export const isAnalysisResultFingerprint = (value: string): boolean =>
  ANALYSIS_RESULT_FINGERPRINT_PATTERN.test(value);
